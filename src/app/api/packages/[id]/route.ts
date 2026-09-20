import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/** PATCH /api/packages/[id] — SUPER_ADMIN only. Partial {name, pricePerSqft, description, duration, status}. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin()
    const { id } = await params
    let body: {
      name?: string
      pricePerSqft?: number | string
      description?: string | null
      duration?: string | null
      status?: string
    }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const existing = await db.package.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Package not found')

    const data: { name?: string; pricePerSqft?: number; description?: string | null; duration?: string | null; status?: string } = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) throw new ApiError(400, 'Name cannot be empty')
      if (name !== existing.name) {
        const clash = await db.package.findUnique({ where: { name } })
        if (clash) throw new ApiError(409, 'A package with this name already exists')
      }
      data.name = name
    }
    if (body.pricePerSqft !== undefined) {
      const pricePerSqft = Number(body.pricePerSqft)
      if (!Number.isFinite(pricePerSqft) || pricePerSqft < 0) {
        throw new ApiError(400, 'Invalid pricePerSqft')
      }
      data.pricePerSqft = pricePerSqft
    }
    if (body.description !== undefined) {
      data.description = body.description === null ? null : String(body.description).trim() || null
    }
    if (body.duration !== undefined) {
      data.duration = body.duration === null ? null : String(body.duration).trim() || null
    }
    if (body.status !== undefined) {
      const status = String(body.status)
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        throw new ApiError(400, 'status must be ACTIVE or INACTIVE')
      }
      data.status = status
    }

    if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields to update')

    const pkg = await db.package.update({ where: { id }, data })

    if (data.pricePerSqft !== undefined && data.pricePerSqft !== existing.pricePerSqft) {
      await audit(
        user,
        'PACKAGE_UPDATE',
        'PACKAGE',
        pkg.id,
        `${pkg.name} rate ₹${existing.pricePerSqft} → ₹${pkg.pricePerSqft}`
      )
    } else {
      await audit(user, 'PACKAGE_UPDATE', 'PACKAGE', pkg.id, `Updated package ${pkg.name}`)
    }

    return NextResponse.json({ package: pkg })
  } catch (e) {
    return jsonError(e)
  }
}
