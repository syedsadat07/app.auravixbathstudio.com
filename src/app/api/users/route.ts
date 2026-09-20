import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, hashPassword, jsonError, requireSuperAdmin } from '@/lib/auth'

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

interface CreateUserBody {
  name?: string
  username?: string
  email?: string
  mobile?: string
  password?: string
  role?: string
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() ?? ''

    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { username: { contains: search } },
          ],
        }
      : undefined

    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
        _count: { select: { assignedLeads: true, quotations: true } },
      },
    })

    return Response.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        mobile: u.mobile,
        role: u.role,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
        createdAt: u.createdAt,
        leadCount: u._count.assignedLeads,
        quoteCount: u._count.quotations,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireSuperAdmin()

    const body = await readJson<CreateUserBody>(request)
    const name = body?.name?.trim() ?? ''
    const username = body?.username?.trim() ?? ''
    const email = body?.email?.trim() ?? ''
    const mobile = body?.mobile?.trim() ?? ''
    const password = String(body?.password ?? '')
    const role = body?.role?.trim() || 'ADMIN'

    if (!name || !username || !email) {
      throw new ApiError(400, 'Name, username and email are required')
    }
    if (password.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters')
    }
    if (!['ADMIN', 'SUPER_ADMIN'].includes(role)) {
      throw new ApiError(400, 'Role must be ADMIN or SUPER_ADMIN')
    }

    const usernameTaken = await db.user.findFirst({ where: { username } })
    if (usernameTaken) {
      throw new ApiError(409, 'This username is already taken. Please choose another one.')
    }
    const emailTaken = await db.user.findFirst({ where: { email } })
    if (emailTaken) {
      throw new ApiError(409, 'This email is already registered. Please use another one.')
    }

    const passwordHash = await hashPassword(password)
    const user = await db.user.create({
      data: {
        name,
        username,
        email,
        mobile: mobile || null,
        passwordHash,
        role,
      },
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

    await audit(actor, 'CREATE_ADMIN', 'USER', user.id, `Created admin: ${name}`)
    return Response.json({ user }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
