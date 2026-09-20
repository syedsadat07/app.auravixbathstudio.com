import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const SEARCH_FIELDS = ['userName', 'action', 'entity', 'entityId', 'details'] as const

/** GET /api/audit-logs?search=&limit=100 — SUPER_ADMIN only. */
export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin()
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim()
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100

    const where = search
      ? { OR: SEARCH_FIELDS.map((field) => ({ [field]: { contains: search } })) }
      : {}

    const logs = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userName: true,
        userRole: true,
        action: true,
        entity: true,
        entityId: true,
        details: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ logs })
  } catch (e) {
    return jsonError(e)
  }
}
