import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser, requireSuperAdmin, audit, isSuperAdmin, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const QUANTITY_RULES = ['AREA', 'PIECE', 'FIXED']

/**
 * GET /api/materials?search=&category=<id|name>&status=ACTIVE|ALL
 * Admins ALWAYS receive ACTIVE only; Super Admin may pass status=ALL.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search')?.trim()
    const category = searchParams.get('category')?.trim()
    const statusParam = searchParams.get('status')

    const where: Prisma.MaterialWhereInput = {}
    if (!isSuperAdmin(user) || statusParam !== 'ALL') {
      where.status = 'ACTIVE'
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { brand: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (category) {
      where.category = { OR: [{ id: category }, { name: category }] }
    }

    const materials = await db.material.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ materials })
  } catch (e) {
    return jsonError(e)
  }
}

interface MaterialCreateBody {
  name?: string
  categoryId?: string
  subCategory?: string
  brand?: string
  sku?: string
  description?: string
  price?: number | string
  unit?: string
  coverage?: number | string
  coverageUnit?: string
  wastagePercent?: number | string
  quantityRule?: string
  imageUrl?: string
}

/** POST /api/materials — SUPER_ADMIN only. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: MaterialCreateBody
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const name = body.name?.trim()
    if (!name) throw new ApiError(400, 'Name is required')
    if (!body.categoryId) throw new ApiError(400, 'categoryId is required')
    const price = Number(body.price)
    if (!Number.isFinite(price) || price < 0) throw new ApiError(400, 'A valid price is required')

    const category = await db.materialCategory.findUnique({ where: { id: body.categoryId } })
    if (!category) throw new ApiError(400, 'Invalid categoryId')

    const quantityRule =
      body.quantityRule && QUANTITY_RULES.includes(body.quantityRule) ? body.quantityRule : 'PIECE'
    const coverage = Number(body.coverage)
    const wastagePercent = Number(body.wastagePercent)

    const material = await db.material.create({
      data: {
        name,
        categoryId: body.categoryId,
        subCategory: body.subCategory?.trim() || null,
        brand: body.brand?.trim() || null,
        sku: body.sku?.trim() || null,
        description: body.description?.trim() || null,
        price,
        unit: body.unit?.trim() || 'piece',
        coverage: Number.isFinite(coverage) ? coverage : 1,
        coverageUnit: body.coverageUnit?.trim() || 'sq.ft',
        wastagePercent: Number.isFinite(wastagePercent) ? wastagePercent : 0,
        quantityRule,
        imageUrl: body.imageUrl?.trim() || null,
        createdById: user.id,
      },
      include: { category: { select: { id: true, name: true } } },
    })

    await audit(
      user,
      'MATERIAL_CREATE',
      'MATERIAL',
      material.id,
      `Created material ${material.name} (₹${material.price}/${material.unit})`
    )
    return NextResponse.json({ material }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
