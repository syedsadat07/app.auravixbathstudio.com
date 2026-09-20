import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/material-categories — any authed user. */
export async function GET() {
  try {
    await requireUser()
    const categories = await db.materialCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { materials: true } } },
    })
    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        materialCount: c._count.materials,
      })),
    })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST /api/material-categories — SUPER_ADMIN only. {name} */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { name?: string }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const name = body.name?.trim()
    if (!name) throw new ApiError(400, 'Name is required')

    const existing = await db.materialCategory.findUnique({ where: { name } })
    if (existing) throw new ApiError(409, 'A category with this name already exists')

    const max = await db.materialCategory.aggregate({ _max: { sortOrder: true } })
    const category = await db.materialCategory.create({
      data: { name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    })

    await audit(user, 'CATEGORY_CREATE', 'CATEGORY', category.id, `Created category ${category.name}`)
    return NextResponse.json({ category }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
