import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { restoreBackup, validateBackup } from '@/lib/backup-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** POST /api/backup/restore — SUPER_ADMIN only. {confirm: 'RESTORE', backup: BackupFile} */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { confirm?: string; backup?: unknown }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }
    if (body.confirm !== 'RESTORE') throw new ApiError(400, 'Type RESTORE to confirm.')

    let backup
    try {
      backup = validateBackup(body.backup)
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Invalid backup file')
    }

    const restored = await restoreBackup(backup)
    const total = Object.values(restored).reduce((a, b) => a + b, 0)
    await audit(user, 'RESTORE', 'System', null, `Restored backup from ${backup.createdAt} (${total} records)`)
    return NextResponse.json({ ok: true, restored })
  } catch (e) {
    return jsonError(e)
  }
}
