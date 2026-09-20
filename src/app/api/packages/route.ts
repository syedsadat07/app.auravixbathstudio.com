import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/** GET /api/packages — any authed user. Returns all packages (UI filters ACTIVE for admins). */
export async function GET() {
  try {
    await requireUser()
    const packages = await db.package.findMany({ orderBy: { pricePerSqft: 'asc' } })
    return NextResponse.json({ packages })
  } catch (e) {
    return jsonError(e)
  }
}

/** POST /api/packages — SUPER_ADMIN only. {name, pricePerSqft, description?, duration?} */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: { name?: string; pricePerSqft?: number | string; description?: string; duration?: string }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const name = body.name?.trim()
    if (!name) throw new ApiError(400, 'Name is required')
    const pricePerSqft = Number(body.pricePerSqft)
    if (!Number.isFinite(pricePerSqft) || pricePerSqft < 0) {
      throw new ApiError(400, 'A valid pricePerSqft is required')
    }

    const existing = await db.package.findUnique({ where: { name } })
    if (existing) throw new ApiError(409, 'A package with this name already exists')

    const pkg = await db.package.create({
      data: {
        name,
        pricePerSqft,
        description: body.description?.trim() || null,
        duration: body.duration?.trim() || null,
      },
    })

    await audit(user, 'PACKAGE_CREATE', 'PACKAGE', pkg.id, `Created package ${pkg.name} (₹${pkg.pricePerSqft}/sq.ft)`)
    return NextResponse.json({ package: pkg }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
