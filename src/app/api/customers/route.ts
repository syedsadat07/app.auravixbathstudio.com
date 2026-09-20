import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { isSuperAdmin, jsonError, requireUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() ?? ''

    // Admins: only customers that have at least one lead assigned to them
    let scopedCustomerIds: string[] | null = null
    if (!isSuperAdmin(user)) {
      const ownLeads = await db.lead.findMany({
        where: { assignedAdminId: user.id },
        select: { customerId: true },
      })
      scopedCustomerIds = Array.from(new Set(ownLeads.map((l) => l.customerId)))
    }

    const where: Prisma.CustomerWhereInput = {}
    if (scopedCustomerIds) where.id = { in: scopedCustomerIds }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ]
    }

    const customers = await db.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    const customerIds = customers.map((c) => c.id)

    const leadCountScope: Prisma.LeadWhereInput = isSuperAdmin(user)
      ? { customerId: { in: customerIds } }
      : { customerId: { in: customerIds }, assignedAdminId: user.id }

    const quoteCountScope: Prisma.QuotationWhereInput = isSuperAdmin(user)
      ? { customerId: { in: customerIds } }
      : {
          customerId: { in: customerIds },
          OR: [{ createdById: user.id }, { lead: { assignedAdminId: user.id } }],
        }

    const [leadGroups, quoteGroups, quotes] = await Promise.all([
      db.lead.groupBy({ by: ['customerId'], _count: { _all: true }, where: leadCountScope }),
      db.quotation.groupBy({
        by: ['customerId'],
        _count: { _all: true },
        where: quoteCountScope,
      }),
      db.quotation.findMany({
        where: quoteCountScope,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          customerId: true,
          quotationNumber: true,
          status: true,
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { status: true, totalPayable: true },
          },
        },
      }),
    ])

    const leadCountMap = new Map(leadGroups.map((g) => [g.customerId, g._count._all]))
    const quoteCountMap = new Map(quoteGroups.map((g) => [g.customerId, g._count._all]))

    // quotes are ordered newest first → first occurrence per customer is the last quote
    const lastQuoteMap = new Map<
      string,
      { quotationNumber: string; totalPayable: number; status: string } | null
    >()
    for (const q of quotes) {
      if (lastQuoteMap.has(q.customerId)) continue
      const v = q.versions[0]
      lastQuoteMap.set(q.customerId, {
        quotationNumber: q.quotationNumber,
        totalPayable: v?.totalPayable ?? 0,
        status: v?.status ?? q.status,
      })
    }

    return Response.json({
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
        pincode: c.pincode,
        createdAt: c.createdAt,
        leadCount: leadCountMap.get(c.id) ?? 0,
        quoteCount: quoteCountMap.get(c.id) ?? 0,
        lastQuote: lastQuoteMap.get(c.id) ?? null,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}
