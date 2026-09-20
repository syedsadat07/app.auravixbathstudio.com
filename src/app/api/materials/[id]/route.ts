import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const QUANTITY_RULES = ['AREA', 'PIECE', 'FIXED']
const NULLABLE_STRING_FIELDS = ['subCategory', 'brand', 'sku', 'description', 'imageUrl'] as const

/** PATCH /api/materials/[id] — SUPER_ADMIN only. Partial master-data update. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSuperAdmin()
    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const existing = await db.material.findUnique({ where: { id } })
    if (!existing) throw new ApiError(404, 'Material not found')

    const data: Prisma.MaterialUncheckedUpdateInput = {}

    if (body.name !== undefined) {
      const name = String(body.name).trim()
      if (!name) throw new ApiError(400, 'Name cannot be empty')
      data.name = name
    }
    for (const field of NULLABLE_STRING_FIELDS) {
      if (body[field] !== undefined) {
        const raw = body[field]
        data[field] = raw === null ? null : String(raw).trim() || null
      }
    }
    if (body.unit !== undefined) {
      const unit = String(body.unit).trim()
      if (!unit) throw new ApiError(400, 'Invalid unit')
      data.unit = unit
    }
    if (body.coverageUnit !== undefined) {
      const coverageUnit = String(body.coverageUnit).trim()
      if (!coverageUnit) throw new ApiError(400, 'Invalid coverageUnit')
      data.coverageUnit = coverageUnit
    }
    if (body.quantityRule !== undefined) {
      const quantityRule = String(body.quantityRule)
      if (!QUANTITY_RULES.includes(quantityRule)) throw new ApiError(400, 'Invalid quantityRule')
      data.quantityRule = quantityRule
    }
    if (body.price !== undefined) {
      const price = Number(body.price)
      if (!Number.isFinite(price) || price < 0) throw new ApiError(400, 'Invalid price')
      data.price = price
    }
    if (body.coverage !== undefined) {
      const coverage = Number(body.coverage)
      if (!Number.isFinite(coverage) || coverage < 0) throw new ApiError(400, 'Invalid coverage')
      data.coverage = coverage
    }
    if (body.wastagePercent !== undefined) {
      const wastagePercent = Number(body.wastagePercent)
      if (!Number.isFinite(wastagePercent) || wastagePercent < 0) throw new ApiError(400, 'Invalid wastagePercent')
      data.wastagePercent = wastagePercent
    }
    if (body.categoryId !== undefined) {
      const categoryId = String(body.categoryId)
      const category = await db.materialCategory.findUnique({ where: { id: categoryId } })
      if (!category) throw new ApiError(400, 'Invalid categoryId')
      data.categoryId = categoryId
    }

    if (Object.keys(data).length === 0) throw new ApiError(400, 'No valid fields to update')

    const material = await db.material.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    })

    if (data.price !== undefined && Number(data.price) !== existing.price) {
      await audit(
        user,
        'MATERIAL_PRICE_UPDATE',
        'MATERIAL',
        material.id,
        `Updated ${material.name} price ₹${existing.price} → ₹${material.price}`
      )
    } else {
      await audit(user, 'MATERIAL_UPDATE', 'MATERIAL', material.id, `Updated ${material.name}`)
    }

    return NextResponse.json({ material })
  } catch (e) {
    return jsonError(e)
  }
}
