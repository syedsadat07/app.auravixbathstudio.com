import { NextRequest, NextResponse } from 'next/server'
import { requireUser, isSuperAdmin, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'
import { round2 } from '@/lib/calc'

const WON_STATUSES = ['ORDER_CONFIRMED', 'ORDER_FREEZE', 'PAYMENT_RECEIVED']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/**
 * GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD (default last 90 days)
 * Admin scope = own leads/quotations only.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const leadScope = sa ? {} : { assignedAdminId: user.id }
    const quoteScope = sa ? {} : { createdById: user.id }

    const { searchParams } = req.nextUrl
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    if (fromParam && !DATE_RE.test(fromParam)) throw new ApiError(400, 'from must be YYYY-MM-DD')
    if (toParam && !DATE_RE.test(toParam)) throw new ApiError(400, 'to must be YYYY-MM-DD')

    const to = toParam ? new Date(`${toParam}T23:59:59.999`) : new Date()
    const from = fromParam
      ? new Date(`${fromParam}T00:00:00.000`)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    if (from > to) throw new ApiError(400, 'from must be before to')

    const [leadRows, quoteRows, revenueRows, advisers, leadAdviserRows, packageRows] = await Promise.all([
      db.lead.findMany({
        where: { createdAt: { gte: from, lte: to }, ...leadScope },
        select: { status: true },
      }),
      db.quotation.findMany({
        where: { createdAt: { gte: from, lte: to }, ...quoteScope },
        select: {
          status: true,
          createdById: true,
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { grossValue: true, totalPayable: true } },
        },
      }),
      db.quotation.findMany({
        where: { status: 'PAYMENT_RECEIVED', updatedAt: { gte: from, lte: to }, ...quoteScope },
        select: {
          updatedAt: true,
          versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { totalPayable: true } },
        },
      }),
      db.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, ...(sa ? {} : { id: user.id }) },
        select: { id: true, name: true },
      }),
      db.lead.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          assignedAdminId: sa ? { not: null } : user.id,
        },
        select: { assignedAdminId: true },
      }),
      db.quotationVersion.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          packageName: { not: null },
          quotation: { is: { status: { not: 'CANCELLED' }, ...quoteScope } },
        },
        select: { packageName: true, totalArea: true },
      }),
    ])

    // leadsByStatus
    const leadCounts = new Map<string, number>()
    for (const row of leadRows) leadCounts.set(row.status, (leadCounts.get(row.status) ?? 0) + 1)
    const leadsByStatus = Array.from(leadCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)

    // quotesByStatus (value = current-version grossValue)
    const quoteAgg = new Map<string, { count: number; value: number }>()
    for (const q of quoteRows) {
      const entry = quoteAgg.get(q.status) ?? { count: 0, value: 0 }
      entry.count++
      entry.value += q.versions[0]?.grossValue ?? 0
      quoteAgg.set(q.status, entry)
    }
    const quotesByStatus = Array.from(quoteAgg.entries())
      .map(([status, v]) => ({ status, count: v.count, value: round2(v.value) }))
      .sort((a, b) => b.count - a.count)

    // revenueByMonth
    const revenueAgg = new Map<string, number>()
    for (const row of revenueRows) {
      const key = monthKey(row.updatedAt)
      revenueAgg.set(key, round2((revenueAgg.get(key) ?? 0) + (row.versions[0]?.totalPayable ?? 0)))
    }
    const revenueByMonth = Array.from(revenueAgg.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month))

    // adviserPerformance
    const leadCountByAdviser = new Map<string, number>()
    for (const row of leadAdviserRows) {
      if (row.assignedAdminId) {
        leadCountByAdviser.set(row.assignedAdminId, (leadCountByAdviser.get(row.assignedAdminId) ?? 0) + 1)
      }
    }
    const quoteAggByAdviser = new Map<string, { quotes: number; won: number; value: number }>()
    for (const q of quoteRows) {
      const entry = quoteAggByAdviser.get(q.createdById) ?? { quotes: 0, won: 0, value: 0 }
      entry.quotes++
      if (WON_STATUSES.includes(q.status)) {
        entry.won++
        entry.value += q.versions[0]?.totalPayable ?? 0
      }
      quoteAggByAdviser.set(q.createdById, entry)
    }
    const adviserPerformance = advisers
      .map((u) => {
        const agg = quoteAggByAdviser.get(u.id)
        return {
          id: u.id,
          name: u.name,
          leads: leadCountByAdviser.get(u.id) ?? 0,
          quotes: agg?.quotes ?? 0,
          won: agg?.won ?? 0,
          value: round2(agg?.value ?? 0),
        }
      })
      .filter((row) => (sa ? row.leads > 0 || row.quotes > 0 : true))
      .sort((a, b) => b.value - a.value || b.quotes - a.quotes)

    // packageMix (from versions' packageName)
    const packageAgg = new Map<string, { count: number; area: number }>()
    for (const v of packageRows) {
      const name = v.packageName ?? 'Unknown'
      const entry = packageAgg.get(name) ?? { count: 0, area: 0 }
      entry.count++
      entry.area += v.totalArea
      packageAgg.set(name, entry)
    }
    const packageMix = Array.from(packageAgg.entries())
      .map(([name, v]) => ({ name, count: v.count, area: round2(v.area) }))
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({ leadsByStatus, quotesByStatus, revenueByMonth, adviserPerformance, packageMix })
  } catch (e) {
    return jsonError(e)
  }
}
