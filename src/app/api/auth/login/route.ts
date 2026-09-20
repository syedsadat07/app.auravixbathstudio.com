import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ApiError,
  AuthUser,
  SESSION_COOKIE,
  audit,
  createSessionToken,
  jsonError,
  verifyPassword,
} from '@/lib/auth'

interface LoginBody {
  email?: string
  username?: string
  password?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as LoginBody | null
    const identifier = String(body?.email ?? body?.username ?? '').trim()
    const password = String(body?.password ?? '')

    if (!identifier || !password) {
      throw new ApiError(400, 'Email and password are required')
    }

    // Find by email OR username — case-insensitive via lowercasing in JS
    // (SQLite + Prisma has no case-insensitive mode, so verify in JS).
    let user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    })
    if (!user) {
      const lower = identifier.toLowerCase()
      const candidates = await db.user.findMany()
      user =
        candidates.find(
          (u) => u.email.toLowerCase() === lower || u.username.toLowerCase() === lower
        ) ?? null
    }

    if (!user) throw new ApiError(401, 'Invalid email or password')

    const passwordOk = await verifyPassword(password, user.passwordHash)
    if (!passwordOk) throw new ApiError(401, 'Invalid email or password')
    if (user.status !== 'ACTIVE') throw new ApiError(401, 'Invalid email or password')

    const token = createSessionToken(user.id, user.role)

    const sessionUser: AuthUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
    }

    const res = NextResponse.json({ user: sessionUser })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    await audit(sessionUser, 'LOGIN', 'USER', user.id, `${user.name} logged in`)
    return res
  } catch (e) {
    return jsonError(e)
  }
}
