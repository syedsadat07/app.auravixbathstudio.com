import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/settings — any authed user. → {settings: Record<key, value>} */
export async function GET() {
  try {
    await requireUser()
    const rows = await db.setting.findMany()
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return NextResponse.json({ settings })
  } catch (e) {
    return jsonError(e)
  }
}

/** PUT /api/settings — SUPER_ADMIN only. {settings: Record<key, value>} (upsert each key). */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { settings?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const input = body.settings
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new ApiError(400, 'settings object is required')
    }

    const keys = Object.keys(input)
    if (keys.length === 0) throw new ApiError(400, 'No settings keys provided')

    for (const key of keys) {
      const raw = input[key]
      if (raw === null || raw === undefined) continue
      if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
        throw new ApiError(400, `Invalid value for setting "${key}"`)
      }
      const value = String(raw)
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    await audit(user, 'SETTINGS_UPDATE', 'SETTINGS', null, `Updated keys: ${keys.join(', ')}`)

    const rows = await db.setting.findMany()
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return NextResponse.json({ settings })
  } catch (e) {
    return jsonError(e)
  }
}
