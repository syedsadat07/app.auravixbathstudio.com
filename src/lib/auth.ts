import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

const SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'auravix-bath-studio-dev-secret-2026'
export const SESSION_COOKIE = 'abs_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

// ---------- password hashing (bcrypt) ----------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(10)
  let out = ''
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

// ---------- JWT-style token (HS256 via node crypto) ----------

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(data: string): string {
  return b64url(createHmac('sha256', SECRET).update(data).digest())
}

export function createSessionToken(userId: string, role: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    })
  )
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`
}

export interface SessionPayload {
  sub: string
  role: string
  exp: number
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, payload, signature] = parts
    const expected = sign(`${header}.${payload}`)
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()) as SessionPayload
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null
    return data
  } catch {
    return null
  }
}

// ---------- session helpers for route handlers ----------

export interface AuthUser {
  id: string
  name: string
  username: string
  email: string
  role: string
  status: string
  mustChangePassword: boolean
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = verifySessionToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({ where: { id: payload.sub } })
  if (!user || user.status !== 'ACTIVE') return null
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Throws ApiError(401) if not signed in. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getSessionUser()
  if (!user) throw new ApiError(401, 'Not authenticated. Please sign in.')
  return user
}

/** Throws ApiError(403) if not Super Admin. */
export async function requireSuperAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'SUPER_ADMIN') throw new ApiError(403, 'Only Super Admins can perform this action.')
  return user
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === 'SUPER_ADMIN'
}

// ---------- audit ----------

export async function audit(
  user: AuthUser | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: string
) {
  try {
    await db.auditLog.create({
      data: {
        userId: user?.id ?? null,
        userName: user?.name ?? 'System',
        userRole: user?.role ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        details: details ?? null,
      },
    })
  } catch (e) {
    console.error('audit log failed', e)
  }
}

// ---------- response helpers ----------

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('API error:', error)
  const message = error instanceof Error ? error.message : 'Something went wrong'
  return Response.json({ error: message }, { status: 500 })
}

// ---------- counters (sequential numbering) ----------

export async function nextCounter(key: string, start = 1): Promise<number> {
  const existing = await db.counter.findUnique({ where: { key } })
  if (!existing) {
    await db.counter.create({ data: { key, value: start } })
    return start
  }
  const updated = await db.counter.update({ where: { key }, data: { value: { increment: 1 } } })
  return updated.value
}

export async function nextLeadNumber(): Promise<string> {
  const n = await nextCounter('lead', 1000)
  return `BEN${String(n).padStart(5, '0')}`
}

export async function nextQuotationNumber(prefix = 'ABS-Q'): Promise<string> {
  const n = await nextCounter('quotation', 245)
  return `${prefix}-${String(n).padStart(6, '0')}`
}

// ---------- shared query scope ----------

/** Returns the where-clause fragment that scopes leads/quotations to admins. */
export function adminScope(adminId: string) {
  return { assignedAdminId: adminId }
}
