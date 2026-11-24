import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { resetBusinessData, resetQuotationData, resetQuotationDates } from '@/lib/backup-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/reset — SUPER_ADMIN only.
 * Body: { confirm: 'RESET', scope?: 'all' | 'quotations' | 'dates' }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { confirm?: string; scope?: 'all' | 'quotations' | 'dates' }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }
    if (body.confirm !== 'RESET') throw new ApiError(400, 'Type RESET to confirm.')

    const scope = body.scope || 'all'

    if (scope === 'dates') {
      const res = await resetQuotationDates()
      await audit(user, 'RESET', 'System', null, `Reset dates of all ${res.count} quotations to ${res.updatedTo}`)
      return NextResponse.json({ ok: true, scope: 'dates', count: res.count, updatedTo: res.updatedTo })
    }

    if (scope === 'quotations') {
      const cleared = await resetQuotationData()
      const summary = Object.entries(cleared).map(([k, v]) => `${k}: ${v}`).join(', ')
      await audit(user, 'RESET', 'System', null, `Reset quotation data — ${summary}`)
      return NextResponse.json({ ok: true, scope: 'quotations', cleared })
    }

    const cleared = await resetBusinessData()
    const summary = Object.entries(cleared).map(([k, v]) => `${k}: ${v}`).join(', ')
    await audit(user, 'RESET', 'System', null, `Reset business data — ${summary}`)
    return NextResponse.json({ ok: true, scope: 'all', cleared })
  } catch (e) {
    return jsonError(e)
  }
}
