import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser, isSuperAdmin, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'
import { ORDER_FLAG_STATUSES } from '@/lib/status'

const WON_LIKE = ['TC_ACCEPTED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']
const PAID_LIKE = ['PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']

/**
 * GET /api/orders?search=
 * Orders = leads having at least one quotation in an order-pipeline status.
 * Admin scope = own leads only. Active quote = most advanced (latest updatedAt among pipeline quotes).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const search = req.nextUrl.searchParams.get('search')?.trim()

    const leadWhere: Prisma.LeadWhereInput = {
      quotations: { some: { status: { in: ORDER_FLAG_STATUSES } } },
      ...(sa ? {} : { assignedAdminId: user.id }),
    }
    if (search) {
      leadWhere.OR = [
        { leadNumber: { contains: search } },
        { customer: { is: { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } } },
        { quotations: { some: { quotationNumber: { contains: search } } } },
      ]
    }

    const leads = await db.lead.findMany({
      where: leadWhere,
      include: {
        customer: true,
        assignedAdmin: { select: { name: true } },
        quotations: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              include: { _count: { select: { bathrooms: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const orders: unknown[] = []
    const sortKeys: number[] = []

    for (const lead of leads) {
      const pipelineQuotes = lead.quotations.filter((q) => ORDER_FLAG_STATUSES.includes(q.status))
      if (pipelineQuotes.length === 0) continue
      // Active quote = most advanced: latest updatedAt among pipeline-status quotations
      const activeQuote = [...pipelineQuotes].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      )[0]
      const currentVersion = activeQuote.versions[0] // highest versionNumber first
      const publishedVersion = activeQuote.versions.find((v) => v.status === 'PUBLISHED')
      const status = activeQuote.status

      orders.push({
        leadId: lead.id,
        leadNumber: lead.leadNumber,
        leadStatus: lead.status,
        customer: {
          name: lead.customer.name,
          phone: lead.customer.phone,
          email: lead.customer.email,
          address: lead.customer.address,
          city: lead.customer.city,
        },
        createdAt: lead.createdAt,
        adviserName: lead.assignedAdmin?.name ?? null,
        quote: {
          id: activeQuote.id,
          quotationNumber: activeQuote.quotationNumber,
          versionNumber: currentVersion?.versionNumber ?? 1,
          versionType: currentVersion?.versionType ?? 'INITIAL',
          status,
          totalPayable: currentVersion?.totalPayable ?? 0,
          grossValue: currentVersion?.grossValue ?? 0,
          publishedAt: publishedVersion ? publishedVersion.createdAt : activeQuote.updatedAt,
          bathroomCount: currentVersion?._count.bathrooms ?? 0,
          statusFlags: {
            quotePublished: !['DRAFT', 'UNDER_REVIEW'].includes(status),
            tcAccepted: WON_LIKE.includes(status),
            paymentReceived: PAID_LIKE.includes(status),
            orderFreeze: status === 'ORDER_FREEZE',
          },
        },
        otherVersionsCount: Math.max(activeQuote.versions.length - 1, 0),
      })
      sortKeys.push(activeQuote.updatedAt.getTime())
    }

    // Most recent order activity first
    const paired = orders.map((o, i) => ({ o, k: sortKeys[i] }))
    paired.sort((a, b) => b.k - a.k)

    return NextResponse.json({ total: paired.length, orders: paired.map((p) => p.o) })
  } catch (e) {
    return jsonError(e)
  }
}
