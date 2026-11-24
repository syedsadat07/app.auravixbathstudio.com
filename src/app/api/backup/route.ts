import { requireSuperAdmin, audit, jsonError } from '@/lib/auth'
import { createBackup } from '@/lib/backup-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** GET /api/backup — SUPER_ADMIN only. Downloads a full JSON backup of every table. */
export async function GET() {
  try {
    const user = await requireSuperAdmin()
    const backup = await createBackup(user.name)
    const total = Object.values(backup.counts).reduce((a, b) => a + b, 0)
    await audit(user, 'BACKUP', 'System', null, `Downloaded full backup (${total} records)`)
    const stamp = backup.createdAt.replace(/[:.]/g, '-').slice(0, 19)
    return new Response(JSON.stringify(backup), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="auravix-backup-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
