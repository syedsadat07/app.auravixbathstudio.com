import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser, requireSuperAdmin, audit, isSuperAdmin, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const QUANTITY_RULES = ['AREA', 'PIECE', 'FIXED']

/**
 * GET /api/materials?search=&category=<id|name>&status=ACTIVE|ALL
 * Admins ALWAYS receive ACTIVE only; Super Admin may pass status=ALL.
 * Includes inventory details (physical stock, reserved qty, available qty, low stock status).
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
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { subCategory: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (category) {
      where.category = { OR: [{ id: category }, { name: category }] }
    }

    const materials = await db.material.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        reservations: {
          where: { status: 'RESERVED' },
          select: { qtyReserved: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const enriched = materials.map((m) => {
      const activeReserved = m.reservations.reduce((sum, r) => sum + r.qtyReserved, 0)
      const currentStock = m.stockQty ?? 0
      const availableQty = Math.max(0, currentStock - activeReserved)
      const threshold = m.reorderThreshold ?? 5
      const isLowStock = currentStock > 0 && availableQty <= threshold
      const isOutOfStock = availableQty <= 0

      return {
        id: m.id,
        categoryId: m.categoryId,
        name: m.name,
        subCategory: m.subCategory,
        brand: m.brand,
        sku: m.sku,
        description: m.description,
        purchaseCost: m.purchaseCost ?? 0,
        price: m.price ?? 0,
        unit: m.unit,
        coverage: m.coverage,
        coverageUnit: m.coverageUnit,
        wastagePercent: m.wastagePercent,
        quantityRule: m.quantityRule,
        packageQty: m.packageQty ?? 1,
        supplier: m.supplier,
        imageUrl: m.imageUrl,
        status: m.status,
        stockQty: currentStock,
        reservedQty: activeReserved,
        availableQty,
        reorderThreshold: threshold,
        isLowStock,
        isOutOfStock,
        category: m.category,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }
    })

    return NextResponse.json({ materials: enriched })
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
  purchaseCost?: number | string
  price?: number | string
  unit?: string
  coverage?: number | string
  coverageUnit?: string
  wastagePercent?: number | string
  quantityRule?: string
  packageQty?: number | string
  supplier?: string
  imageUrl?: string
  reorderThreshold?: number | string
  stockQty?: number | string
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
    if (!Number.isFinite(price) || price < 0) throw new ApiError(400, 'A valid selling price is required')

    const category = await db.materialCategory.findUnique({ where: { id: body.categoryId } })
    if (!category) throw new ApiError(400, 'Invalid categoryId')

    const quantityRule =
      body.quantityRule && QUANTITY_RULES.includes(body.quantityRule) ? body.quantityRule : 'PIECE'
    const coverage = Number(body.coverage)
    const wastagePercent = Number(body.wastagePercent)
    const purchaseCost = Number(body.purchaseCost)
    const packageQty = Number(body.packageQty)
    const stockQty = Number(body.stockQty)
    const reorderThreshold = body.reorderThreshold !== undefined ? Number(body.reorderThreshold) : null

    const material = await db.material.create({
      data: {
        name,
        categoryId: body.categoryId,
        subCategory: body.subCategory?.trim() || null,
        brand: body.brand?.trim() || null,
        sku: body.sku?.trim() || null,
        description: body.description?.trim() || null,
        purchaseCost: Number.isFinite(purchaseCost) && purchaseCost >= 0 ? purchaseCost : 0,
        price,
        unit: body.unit?.trim() || 'piece',
        coverage: Number.isFinite(coverage) ? coverage : 1,
        coverageUnit: body.coverageUnit?.trim() || 'sq.ft',
        wastagePercent: Number.isFinite(wastagePercent) ? wastagePercent : 0,
        quantityRule,
        packageQty: Number.isFinite(packageQty) && packageQty > 0 ? packageQty : 1,
        supplier: body.supplier?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        stockQty: Number.isFinite(stockQty) && stockQty >= 0 ? stockQty : 0,
        reorderThreshold: reorderThreshold !== null && Number.isFinite(reorderThreshold) ? reorderThreshold : null,
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
