import { NextRequest, NextResponse } from 'next/server'
import { requireUser, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * GET /api/inventory
 * Returns inventory summary:
 * - products with stock levels, reserved qty, available qty, purchase cost, selling price
 * - low stock alerts
 * - total stock valuation (at purchase cost and selling price)
 * - recent inventory transactions
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const { searchParams } = req.nextUrl
    const filter = searchParams.get('filter') // 'all' | 'low_stock' | 'out_of_stock'
    const categoryId = searchParams.get('categoryId')
    const query = searchParams.get('q')?.trim()

    // 1. Fetch materials with category and active reservations
    const materials = await db.material.findMany({
      where: {
        status: 'ACTIVE',
        ...(categoryId ? { categoryId } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { brand: { contains: query, mode: 'insensitive' } },
                { sku: { contains: query, mode: 'insensitive' } },
                { subCategory: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        reservations: {
          where: { status: 'RESERVED' },
          select: { qtyReserved: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute stock calculations for each material
    const items = materials
      .map((m) => {
        const reservedQty = m.reservations.reduce((sum, r) => sum + r.qtyReserved, 0)
        const currentStock = m.stockQty ?? 0
        const availableQty = Math.max(0, currentStock - reservedQty)
        const threshold = m.reorderThreshold ?? 5
        const isLowStock = currentStock > 0 && currentStock <= threshold
        const isOutOfStock = currentStock <= 0

        return {
          id: m.id,
          name: m.name,
          category: m.category,
          subCategory: m.subCategory,
          brand: m.brand,
          sku: m.sku,
          unit: m.unit,
          purchaseCost: m.purchaseCost ?? 0,
          sellingPrice: m.price ?? 0,
          currentStock,
          reservedQty,
          availableQty,
          reorderThreshold: threshold,
          supplier: m.supplier,
          packageQty: m.packageQty ?? 1,
          isLowStock,
          isOutOfStock,
          valuationPurchase: (m.purchaseCost ?? 0) * currentStock,
          valuationSelling: (m.price ?? 0) * currentStock,
          imageUrl: m.imageUrl,
        }
      })
      .filter((item) => {
        if (filter === 'low_stock') return item.isLowStock
        if (filter === 'out_of_stock') return item.isOutOfStock
        return true
      })

    // Overall metrics
    const totalMaterials = items.length
    const lowStockCount = items.filter((i) => i.isLowStock).length
    const outOfStockCount = items.filter((i) => i.isOutOfStock).length
    const totalValuationCost = items.reduce((sum, i) => sum + i.valuationPurchase, 0)
    const totalValuationSelling = items.reduce((sum, i) => sum + i.valuationSelling, 0)

    // Recent 20 transactions
    const recentTransactions = await db.inventoryTransaction.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        material: { select: { id: true, name: true, unit: true, brand: true } },
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      items,
      metrics: {
        totalMaterials,
        lowStockCount,
        outOfStockCount,
        totalValuationCost,
        totalValuationSelling,
      },
      recentTransactions,
    })
  } catch (e) {
    return jsonError(e)
  }
}
