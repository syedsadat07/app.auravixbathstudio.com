import { NextRequest, NextResponse } from 'next/server'
import { requireUser, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * GET /api/inventory/[materialId]/movements
 * Returns all stock movements for a specific product.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    await requireUser()
    const { materialId } = await params

    const material = await db.material.findUnique({
      where: { id: materialId },
      select: {
        id: true,
        name: true,
        unit: true,
        stockQty: true,
        reorderThreshold: true,
        purchaseCost: true,
        price: true,
        brand: true,
        sku: true,
      },
    })

    if (!material) throw new ApiError(404, 'Material not found')

    const movements = await db.inventoryTransaction.findMany({
      where: { materialId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json({
      material,
      movements,
    })
  } catch (e) {
    return jsonError(e)
  }
}
