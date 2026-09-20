import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/** PATCH /api/materials/[id]/status — SUPER_ADMIN only. {status: ACTIVE|INACTIVE} */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin()
    const { id } = await params
    let body: { status?: string }
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const status = body.status
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      throw new ApiError(400, 'status must be ACTIVE or INACTIVE')
    }

    const existing = await db.material.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new ApiError(404, 'Material not found')

    const material = await db.material.update({
      where: { id },
      data: { status },
      include: { category: { select: { id: true, name: true } } },
    })

    await audit(user, 'MATERIAL_STATUS', 'MATERIAL', id, `${material.name} ${status}`)
    return NextResponse.json({ material })
  } catch (e) {
    return jsonError(e)
  }
}
