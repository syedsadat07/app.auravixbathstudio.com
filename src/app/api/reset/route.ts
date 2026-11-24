import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { resetBusinessData } from '@/lib/backup-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST /api/reset — SUPER_ADMIN only. {confirm: 'RESET'} — clears the sales pipeline. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { confirm?: string }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }
    if (body.confirm !== 'RESET') throw new ApiError(400, 'Type RESET to confirm.')

    const cleared = await resetBusinessData()
    const summary = Object.entries(cleared).map(([k, v]) => `${k}: ${v}`).join(', ')
    await audit(user, 'RESET', 'System', null, `Reset business data — ${summary}`)
    return NextResponse.json({ ok: true, cleared })
  } catch (e) {
    return jsonError(e)
  }
}
