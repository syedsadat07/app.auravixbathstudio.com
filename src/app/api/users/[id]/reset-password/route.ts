import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, generateTemporaryPassword, hashPassword, jsonError, requireSuperAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSuperAdmin()
    const { id } = await params

    const user = await db.user.findUnique({ where: { id } })
    if (!user) throw new ApiError(404, 'User not found')

    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await hashPassword(temporaryPassword)

    await db.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    })

    await audit(actor, 'ADMIN_PASSWORD_RESET', 'USER', id, `Reset password for ${user.name}`)

    // The ONLY place a generated password is ever exposed.
    return Response.json({ temporaryPassword })
  } catch (e) {
    return jsonError(e)
  }
}
