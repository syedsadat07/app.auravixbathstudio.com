import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError, audit, isSuperAdmin, jsonError, nextLeadNumber, requireUser } from '@/lib/auth'

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/** Parse 'YYYY-MM-DD' as server-local midnight; anything else via Date(). Returns null when invalid. */
function parseFlexibleDate(value: string): Date | null {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dayOnly) {
    return new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

interface NewCustomerInput {
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  pincode?: string
}

interface CreateLeadBody {
  customer?: NewCustomerInput
  appointmentDate?: string | null
  notes?: string
  source?: string
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()

    const { searchParams } = new URL(request.url)
    const tab = searchParams.get('tab') ?? 'all'
    const search = searchParams.get('search')?.trim() ?? ''
    const adviserId = searchParams.get('adviserId')?.trim() ?? ''
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const mine = searchParams.get('mine') === '1'

    const where: Prisma.LeadWhereInput = {}

    // Tab → status mapping
    if (tab === 'scheduled') {
      where.status = 'CONSULTATION_SCHEDULED'
    } else if (tab === 'done') {
      where.status = {
        in: ['MEETING_DONE', 'QUOTE_PREPARING', 'QUOTE_SHARED', 'FOLLOW_UP', 'CONVERTED'],
      }
    } else if (tab === 'closed_lost') {
      where.status = 'CLOSED_LOST'
    }
    // 'all' (or anything else) → no status filter

    // RBAC scoping: admins ALWAYS see only their own leads.
    if (!isSuperAdmin(user) || mine) {
      where.assignedAdminId = user.id
    } else if (adviserId) {
      // Super Admin only filter
      where.assignedAdminId = adviserId
    }

    if (search) {
      where.OR = [
        { leadNumber: { contains: search } },
        { customer: { name: { contains: search } } },
        { customer: { phone: { contains: search } } },
        { customer: { email: { contains: search } } },
      ]
    }

    const appointmentRange: Prisma.DateTimeNullableFilter = {}
    if (from) {
      const f = parseFlexibleDate(from)
      if (f) appointmentRange.gte = f
    }
    if (to) {
      const t = parseFlexibleDate(to)
      if (t) appointmentRange.lt = endOfDay(t)
    }
    if (appointmentRange.gte || appointmentRange.lt) {
      where.appointmentDate = appointmentRange
    }

    const [total, leads] = await Promise.all([
      db.lead.count({ where }),
      db.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              city: true,
              pincode: true,
            },
          },
          assignedAdmin: { select: { id: true, name: true } },
          quotations: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
          },
        },
      }),
    ])

    const mapped = leads.map((l) => {
      const quote = l.quotations[0]
      const version = quote?.versions[0]
      return {
        id: l.id,
        leadNumber: l.leadNumber,
        status: l.status,
        lostReason: l.lostReason,
        source: l.source,
        notes: l.notes,
        appointmentDate: l.appointmentDate,
        createdAt: l.createdAt,
        customer: l.customer,
        assignedAdmin: l.assignedAdmin,
        activeQuote:
          quote && version
            ? {
                id: quote.id,
                quotationNumber: quote.quotationNumber,
                versionNumber: version.versionNumber,
                status: version.status,
                totalPayable: version.totalPayable,
                grossValue: version.grossValue,
              }
            : null,
      }
    })

    return Response.json({ total, leads: mapped })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser()

    const body = await readJson<CreateLeadBody>(request)
    const customerInput = body?.customer
    const name = customerInput?.name?.trim() ?? ''
    const phone = customerInput?.phone?.trim() ?? ''

    if (!name || !phone) {
      throw new ApiError(400, 'Customer name and phone are required')
    }

    let appointmentDate: Date | null = null
    if (body?.appointmentDate) {
      const parsed = parseFlexibleDate(body.appointmentDate)
      if (!parsed) throw new ApiError(400, 'Invalid appointmentDate')
      appointmentDate = parsed
    }

    // Reuse customer by phone, else create
    let customer = await db.customer.findFirst({ where: { phone } })
    if (!customer) {
      customer = await db.customer.create({
        data: {
          name,
          phone,
          email: customerInput?.email?.trim() || null,
          address: customerInput?.address?.trim() || null,
          city: customerInput?.city?.trim() || null,
          pincode: customerInput?.pincode?.trim() || null,
        },
      })
    }

    const leadNumber = await nextLeadNumber()
    const status = appointmentDate ? 'CONSULTATION_SCHEDULED' : 'NEW'

    const lead = await db.lead.create({
      data: {
        leadNumber,
        customerId: customer.id,
        assignedAdminId: user.id,
        status,
        source: body?.source?.trim() || null,
        notes: body?.notes?.trim() || null,
        appointmentDate,
        appointments: appointmentDate
          ? {
              create: {
                scheduledAt: appointmentDate,
                adminId: user.id,
                status: 'SCHEDULED',
                notes: 'First site visit',
              },
            }
          : undefined,
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            pincode: true,
          },
        },
        assignedAdmin: { select: { id: true, name: true } },
      },
    })

    await audit(user, 'LEAD_CREATE', 'LEAD', lead.id, `Created lead ${lead.leadNumber} for ${name}`)
    return Response.json({ lead }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
