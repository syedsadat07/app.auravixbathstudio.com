/**
 * AURAVIX BATH STUDIO — Quotations list & create
 * GET  /api/quotations?status=&search=&mine=1
 * POST /api/quotations  (QuotePayload → Quotation + V1)
 */
import type { NextRequest } from 'next/server'
import { ApiError, audit, jsonError, nextQuotationNumber, requireUser, type AuthUser } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  computeValidityDate,
  createVersionFromPayload,
  isUniqueConstraintError,
  resolveSettings,
  type CreateVersionResult,
  type QuotePayload,
} from '@/lib/quote-service'

// ---------- GET /api/quotations ----------

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const { searchParams } = new URL(req.url)
    const status = (searchParams.get('status') ?? '').trim()
    const search = (searchParams.get('search') ?? '').trim().toLowerCase()
    const mine = searchParams.get('mine') === '1'

    // Admins are ALWAYS scoped to their own quotations.
    const where: { createdById?: string } = {}
    if (user.role !== 'SUPER_ADMIN' || mine) where.createdById = user.id

    const rows = await db.quotation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { name: true } },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { _count: { select: { bathrooms: true } } },
        },
      },
    })

    let list = rows
    if (status) list = list.filter((q) => (q.versions[0]?.status ?? q.status) === status)
    if (search) {
      list = list.filter((q) =>
        `${q.quotationNumber} ${q.customer.name} ${q.customer.phone}`.toLowerCase().includes(search)
      )
    }

    return Response.json({
      total: list.length,
      quotations: list.map((q) => {
        const v = q.versions[0]
        return {
          id: q.id,
          quotationNumber: q.quotationNumber,
          versionNumber: v?.versionNumber ?? 0,
          versionType: v?.versionType ?? '',
          status: v?.status ?? q.status,
          totalPayable: v?.totalPayable ?? 0,
          grossValue: v?.grossValue ?? 0,
          totalArea: v?.totalArea ?? 0,
          validityDate: computeValidityDate(q.createdAt, q.validityDays),
          createdAt: q.createdAt,
          customer: q.customer,
          createdBy: { name: q.createdBy.name },
          bathroomCount: v?._count.bathrooms ?? 0,
        }
      }),
    })
  } catch (e) {
    return jsonError(e)
  }
}

// ---------- POST /api/quotations ----------

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Resolve customerId from payload.customerId or create-or-reuse by phone. */
async function resolveCustomer(payload: QuotePayload) {
  if (typeof payload.customerId === 'string' && payload.customerId) {
    const customer = await db.customer.findUnique({ where: { id: payload.customerId } })
    if (!customer) throw new ApiError(400, 'The selected customer was not found.')
    return customer
  }

  const name = typeof payload.customer?.name === 'string' ? payload.customer.name.trim() : ''
  const phone = typeof payload.customer?.phone === 'string' ? payload.customer.phone.trim() : ''
  if (!name || !phone) throw new ApiError(400, 'Provide a customerId, or customer name and phone.')

  const existing = await db.customer.findFirst({ where: { phone } })
  if (existing) return existing

  return db.customer.create({
    data: {
      name,
      phone,
      email: optionalText(payload.customer?.email),
      address: optionalText(payload.customer?.address),
      city: optionalText(payload.customer?.city),
      pincode: optionalText(payload.customer?.pincode),
    },
  })
}

/** Validate a linked lead: must exist; admins only on their own leads. */
async function resolveLeadId(payload: QuotePayload, user: AuthUser): Promise<string | null> {
  if (typeof payload.leadId !== 'string' || !payload.leadId) return null
  const lead = await db.lead.findUnique({ where: { id: payload.leadId } })
  if (!lead) throw new ApiError(404, 'The linked lead was not found.')
  if (user.role !== 'SUPER_ADMIN' && lead.assignedAdminId !== user.id) {
    throw new ApiError(403, 'This lead is not assigned to you.')
  }
  return lead.id
}

interface CreatedQuotation {
  id: string
  quotationNumber: string
  createdAt: Date
  validityDays: number
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const payload = (await req.json().catch(() => null)) as QuotePayload | null
    if (!payload || typeof payload !== 'object') throw new ApiError(400, 'Invalid request body.')

    const settings = await resolveSettings()
    const customer = await resolveCustomer(payload)
    const leadId = await resolveLeadId(payload, user)

    const publishRequested = payload.publish === true
    const canPublish = user.role === 'SUPER_ADMIN' || settings.adminsCanPublish
    const initialStatus = publishRequested && canPublish ? 'PUBLISHED' : 'DRAFT'
    const notice =
      publishRequested && !canPublish
        ? 'Quote saved as draft. A Super Admin approval is required to publish.'
        : undefined

    // Number allocation + creation in one transaction, with self-healing
    // retry if a freshly allocated number collides (e.g. after a seed).
    let quotation: CreatedQuotation | null = null
    let version: CreateVersionResult | null = null
    for (let attempt = 0; attempt < 10 && !quotation; attempt++) {
      const quotationNumber = await nextQuotationNumber(settings.quotePrefix)
      try {
        const result = await db.$transaction(async (tx) => {
          const q = await tx.quotation.create({
            data: {
              quotationNumber,
              customerId: customer.id,
              leadId,
              createdById: user.id,
              status: initialStatus,
              validityDays: settings.validityDays,
            },
          })
          const v = await createVersionFromPayload({ quotation: q, payload, user, tx })
          return { q, v }
        })
        quotation = { id: result.q.id, quotationNumber: result.q.quotationNumber, createdAt: result.q.createdAt, validityDays: result.q.validityDays }
        version = result.v
      } catch (e) {
        if (isUniqueConstraintError(e, 'quotationNumber') && attempt < 9) continue
        throw e
      }
    }
    if (!quotation || !version) throw new ApiError(500, 'Could not allocate a quotation number.')

    await audit(user, 'QUOTE_CREATE', 'QUOTATION', quotation.id, `Created ${quotation.quotationNumber}`)
    if (version.status === 'PUBLISHED') {
      await audit(user, 'QUOTE_PUBLISH', 'QUOTATION', quotation.id, `Published ${quotation.quotationNumber} V${version.versionNumber}`)
    }

    return Response.json(
      {
        quotation: {
          id: quotation.id,
          quotationNumber: quotation.quotationNumber,
          versionNumber: version.versionNumber,
          versionType: version.versionType,
          status: version.status,
          totalPayable: version.totals.totalPayable,
          grossValue: version.totals.grossValue,
          totalArea: version.totals.totalArea,
          validityDate: computeValidityDate(quotation.createdAt, quotation.validityDays),
          createdAt: quotation.createdAt,
          customer: { id: customer.id, name: customer.name, phone: customer.phone },
          createdBy: { name: user.name },
        },
        ...(notice ? { notice } : {}),
      },
      { status: 201 }
    )
  } catch (e) {
    return jsonError(e)
  }
}
