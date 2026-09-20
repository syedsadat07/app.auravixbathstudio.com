import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isSuperAdmin, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'
import { round2 } from '@/lib/calc'

const FOLLOW_UP_STATUSES = ['QUOTE_SHARED', 'TC_ACCEPTED', 'PAYMENT_PENDING']
const WON_STATUSES = ['ORDER_CONFIRMED', 'ORDER_FREEZE', 'PAYMENT_RECEIVED']
const ACCEPTED_STATUSES = ['TC_ACCEPTED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** GET /api/dashboard — role-aware metrics (admin scope = own leads/quotations). */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const leadScope = sa ? {} : { assignedAdminId: user.id }
    const quoteScope = sa ? {} : { createdById: user.id }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    // Month buckets for the last 6 months (incl. current)
    const buckets = new Map<string, { label: string; leads: number; quotes: number; revenue: number }>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.set(monthKey(d), {
        label: d.toLocaleString('en-US', { month: 'short' }),
        leads: 0,
        quotes: 0,
        revenue: 0,
      })
    }

    const [
      todayAppointments,
      todayCount,
      followUps,
      ordersWon,
      ordersTargetRow,
      totalLeads,
      activeLeads,
      totalQuotations,
      publishedQuotations,
      acceptedQuotations,
      convertedLeads,
      quotationValueRows,
      revenueAllRows,
      revenueMonthRows,
      leadMonthRows,
      quoteMonthRows,
      activeAdmins,
      totalCustomers,
      recentRaw,
    ] = await Promise.all([
      db.appointment.findMany({
        where: { scheduledAt: { gte: todayStart, lt: tomorrowStart }, lead: leadScope },
        include: { lead: { select: { customer: { select: { name: true, city: true } } } } },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      }),
      db.appointment.count({ where: { scheduledAt: { gte: todayStart, lt: tomorrowStart }, lead: leadScope } }),
      db.quotation.count({ where: { status: { in: FOLLOW_UP_STATUSES }, ...quoteScope } }),
      db.quotation.count({
        where: { status: { in: WON_STATUSES }, updatedAt: { gte: monthStart, lt: monthEnd }, ...quoteScope },
      }),
      db.setting.findUnique({ where: { key: 'orders_target' } }),
      db.lead.count({ where: leadScope }),
      db.lead.count({ where: { status: { notIn: ['CLOSED_LOST', 'CONVERTED'] }, ...leadScope } }),
      db.quotation.count({ where: quoteScope }),
      db.quotation.count({ where: { status: 'PUBLISHED', ...quoteScope } }),
      db.quotation.count({ where: { status: { in: ACCEPTED_STATUSES }, ...quoteScope } }),
      db.lead.count({ where: { status: 'CONVERTED', ...leadScope } }),
      // quotationValue: sum of current-version grossValue of non-cancelled quotations
      db.quotation.findMany({
        where: { status: { not: 'CANCELLED' }, ...quoteScope },
        select: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { grossValue: true } } },
      }),
      // revenue: sum of current-version totalPayable of PAYMENT_RECEIVED quotations
      db.quotation.findMany({
        where: { status: 'PAYMENT_RECEIVED', ...quoteScope },
        select: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { totalPayable: true } } },
      }),
      // monthly revenue (last 6 months, bucketed by updatedAt)
      db.quotation.findMany({
        where: { status: 'PAYMENT_RECEIVED', updatedAt: { gte: sixMonthsStart }, ...quoteScope },
        select: {
          updatedAt: true,
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { totalPayable: true } },
        },
      }),
      db.lead.findMany({ where: { createdAt: { gte: sixMonthsStart }, ...leadScope }, select: { createdAt: true } }),
      db.quotation.findMany({ where: { createdAt: { gte: sixMonthsStart }, ...quoteScope }, select: { createdAt: true } }),
      db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
      db.customer.count({ where: { leads: { some: leadScope } } }),
      db.quotation.findMany({
        where: quoteScope,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          customer: { select: { name: true } },
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true, totalPayable: true } },
        },
      }),
    ])

    // Fill month buckets
    for (const row of leadMonthRows) {
      const b = buckets.get(monthKey(row.createdAt))
      if (b) b.leads++
    }
    for (const row of quoteMonthRows) {
      const b = buckets.get(monthKey(row.createdAt))
      if (b) b.quotes++
    }
    for (const row of revenueMonthRows) {
      const b = buckets.get(monthKey(row.updatedAt))
      if (b) b.revenue = round2(b.revenue + (row.versions[0]?.totalPayable ?? 0))
    }
    const monthly = Array.from(buckets.values())

    const quotationValue = round2(
      quotationValueRows.reduce((sum, q) => sum + (q.versions[0]?.grossValue ?? 0), 0)
    )
    const revenue = round2(revenueAllRows.reduce((sum, q) => sum + (q.versions[0]?.totalPayable ?? 0), 0))

    const metrics: Record<string, number> = {
      totalLeads,
      activeLeads,
      totalQuotations,
      publishedQuotations,
      acceptedQuotations,
      convertedLeads,
      quotationValue,
      revenue,
      totalCustomers,
    }
    if (sa) metrics.activeAdmins = activeAdmins

    const todayAppointmentsOut = todayAppointments.map((a) => ({
      id: a.id,
      scheduledAt: a.scheduledAt,
      status: a.status,
      notes: a.notes,
      leadId: a.leadId,
      customer: { name: a.lead.customer.name, city: a.lead.customer.city },
      customerCity: a.lead.customer.city,
    }))

    const recentQuotes = recentRaw.map((q) => ({
      id: q.id,
      quotationNumber: q.quotationNumber,
      status: q.status,
      totalPayable: q.versions[0]?.totalPayable ?? 0,
      createdAt: q.createdAt,
      customerName: q.customer.name,
      customer: { name: q.customer.name },
      versionNumber: q.versions[0]?.versionNumber ?? 1,
    }))

    const ordersTarget = ordersTargetRow ? parseInt(ordersTargetRow.value, 10) || 10 : 10

    return NextResponse.json({
      todayAppointments: todayAppointmentsOut,
      todayCount,
      followUps,
      ordersWon,
      ordersTarget,
      metrics,
      monthly,
      recentQuotes,
    })
  } catch (e) {
    return jsonError(e)
  }
}
