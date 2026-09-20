import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isSuperAdmin, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const EMPTY = { leads: [], customers: [], quotations: [], admins: [], materials: [] }

/**
 * GET /api/search?q= (min 2 chars) — role-scoped global search, max 5 hits per group.
 * admins & materials groups are Super Admin only.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) {
      return NextResponse.json(EMPTY)
    }

    const leadScope = sa ? {} : { assignedAdminId: user.id }
    const quoteScope = sa ? {} : { createdById: user.id }

    const [leads, customers, quotations, admins, materials] = await Promise.all([
      db.lead.findMany({
        where: {
          ...leadScope,
          OR: [
            { leadNumber: { contains: q } },
            { customer: { is: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } } },
          ],
        },
        include: { customer: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      db.customer.findMany({
        where: {
          leads: { some: leadScope },
          OR: [{ name: { contains: q } }, { phone: { contains: q } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      db.quotation.findMany({
        where: {
          ...quoteScope,
          OR: [{ quotationNumber: { contains: q } }, { customer: { is: { name: { contains: q } } } }],
        },
        include: { customer: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      sa
        ? db.user.findMany({
            where: {
              role: { in: ['ADMIN', 'SUPER_ADMIN'] },
              OR: [
                { name: { contains: q } },
                { email: { contains: q } },
                { username: { contains: q } },
              ],
            },
            select: { id: true, name: true, email: true },
            orderBy: { name: 'asc' },
            take: 5,
          })
        : Promise.resolve([]),
      sa
        ? db.material.findMany({
            where: { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { brand: { contains: q } }] },
            select: { id: true, name: true, price: true },
            orderBy: { name: 'asc' },
            take: 5,
          })
        : Promise.resolve([]),
    ])

    return NextResponse.json({
      leads: leads.map((l) => ({ id: l.id, leadNumber: l.leadNumber, name: l.customer.name })),
      customers: customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      quotations: quotations.map((qt) => ({ id: qt.id, quotationNumber: qt.quotationNumber, customerName: qt.customer.name })),
      admins,
      materials,
    })
  } catch (e) {
    return jsonError(e)
  }
}
