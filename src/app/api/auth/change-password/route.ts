import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, hashPassword, jsonError, requireUser, verifyPassword } from '@/lib/auth'

interface ChangePasswordBody {
  currentPassword?: string
  newPassword?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireUser()

    const body = (await request.json().catch(() => null)) as ChangePasswordBody | null
    const currentPassword = String(body?.currentPassword ?? '')
    const newPassword = String(body?.newPassword ?? '')

    if (!currentPassword) throw new ApiError(400, 'Current password is required')
    if (newPassword.length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters')
    }

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) throw new ApiError(404, 'User not found')

    const currentOk = await verifyPassword(currentPassword, user.passwordHash)
    if (!currentOk) throw new ApiError(403, 'Current password is incorrect')

    const passwordHash = await hashPassword(newPassword)
    await db.user.update({
      where: { id: session.id },
      data: { passwordHash, mustChangePassword: false },
    })

    await audit(session, 'CHANGE_PASSWORD', 'USER', session.id, `${session.name} changed their password`)
    return Response.json({ ok: true })
  } catch (e) {
    return jsonError(e)
  }
}
