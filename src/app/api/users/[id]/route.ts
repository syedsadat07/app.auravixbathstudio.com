import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, jsonError, requireSuperAdmin } from '@/lib/auth'

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

interface UpdateUserBody {
  name?: string
  email?: string
  mobile?: string
  status?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireSuperAdmin()
    const { id } = await params

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'User not found')

    const body = await readJson<UpdateUserBody>(request)

    const data: {
      name?: string
      email?: string
      mobile?: string | null
      status?: string
    } = {}

    if (body?.name !== undefined) {
      const name = body.name.trim()
      if (!name) throw new ApiError(400, 'Name cannot be empty')
      data.name = name
    }
    if (body?.email !== undefined) {
      const email = body.email.trim()
      if (!email) throw new ApiError(400, 'Email cannot be empty')
      const clash = await db.user.findFirst({ where: { email, id: { not: id } } })
      if (clash) throw new ApiError(409, 'This email is already registered. Please use another one.')
      data.email = email
    }
    if (body?.mobile !== undefined) {
      data.mobile = body.mobile?.trim() || null
    }
    if (body?.status !== undefined) {
      if (!['ACTIVE', 'DISABLED'].includes(body.status)) {
        throw new ApiError(400, 'Status must be ACTIVE or DISABLED')
      }
      if (body.status !== existing.status) data.status = body.status
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        mobile: true,
        role: true,
        status: true,
        mustChangePassword: true,
        createdAt: true,
      },
    })

    if (data.status === 'DISABLED') {
      await audit(actor, 'ADMIN_UPDATE', 'USER', id, `Disabled account for ${existing.name}`)
    } else if (data.status === 'ACTIVE' && existing.status === 'DISABLED') {
      await audit(actor, 'ADMIN_UPDATE', 'USER', id, `Enabled account for ${existing.name}`)
    } else {
      await audit(actor, 'ADMIN_UPDATE', 'USER', id, `Updated profile for ${existing.name}`)
    }

    return Response.json({ user })
  } catch (e) {
    return jsonError(e)
  }
}
