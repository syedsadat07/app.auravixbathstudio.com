import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/inventory/adjust
 * Stock reconciliation / manual adjustment (damage, shrinkage, count correction).
 * Can set absolute new stock or apply a delta.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: any
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const { materialId, newStock, delta, reason, notes } = body
    if (!materialId) throw new ApiError(400, 'Material ID is required')

    const material = await db.material.findUnique({ where: { id: materialId } })
    if (!material) throw new ApiError(404, 'Material not found')

    const currentStock = material.stockQty ?? 0
    let targetStock: number
    let qtyChange: number

    if (typeof newStock === 'number') {
      if (newStock < 0) throw new ApiError(400, 'New stock cannot be negative')
      targetStock = newStock
      qtyChange = targetStock - currentStock
    } else if (typeof delta === 'number') {
      qtyChange = delta
      targetStock = currentStock + delta
      if (targetStock < 0) throw new ApiError(400, 'Resulting stock cannot be negative')
    } else {
      throw new ApiError(400, 'Provide either newStock (absolute) or delta (adjustment)')
    }

    const [updatedMaterial, transaction] = await db.$transaction([
      db.material.update({
        where: { id: materialId },
        data: { stockQty: targetStock },
      }),
      db.inventoryTransaction.create({
        data: {
          materialId,
          type: 'ADJUSTED',
          qty: qtyChange,
          purchaseCost: material.purchaseCost ?? 0,
          refType: 'MANUAL',
          notes: notes?.trim() || reason?.trim() || 'Physical Count Adjustment',
          createdById: user.id,
        },
      }),
    ])

    await audit(
      user,
      'INVENTORY_ADJUST',
      'INVENTORY',
      transaction.id,
      `Adjusted "${material.name}" from ${currentStock} to ${targetStock} (${qtyChange >= 0 ? '+' : ''}${qtyChange}). Reason: ${reason || 'N/A'}`
    )

    return NextResponse.json({
      success: true,
      material: updatedMaterial,
      transaction,
    })
  } catch (e) {
    return jsonError(e)
  }
}
