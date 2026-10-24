import { NextRequest, NextResponse } from 'next/server'
import { requireUser, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/inventory/receive
 * Record goods received / supplier delivery.
 * Increments Material.stockQty and logs an InventoryTransaction of type RECEIVED.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    let body: any
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const { materialId, qty, unitCost, reference, notes, supplier } = body
    if (!materialId) throw new ApiError(400, 'Material ID is required')
    const parsedQty = Number(qty)
    if (!parsedQty || parsedQty <= 0) throw new ApiError(400, 'Quantity must be greater than zero')

    const material = await db.material.findUnique({ where: { id: materialId } })
    if (!material) throw new ApiError(404, 'Material not found')

    const newStock = (material.stockQty ?? 0) + parsedQty
    const updateData: any = { stockQty: newStock }
    if (typeof unitCost === 'number' && unitCost > 0) {
      updateData.purchaseCost = unitCost
    }
    if (typeof supplier === 'string' && supplier.trim()) {
      updateData.supplier = supplier.trim()
    }

    // Run in transaction
    const [updatedMaterial, transaction] = await db.$transaction([
      db.material.update({
        where: { id: materialId },
        data: updateData,
      }),
      db.inventoryTransaction.create({
        data: {
          materialId,
          type: 'RECEIVED',
          qty: parsedQty,
          purchaseCost: typeof unitCost === 'number' ? unitCost : material.purchaseCost,
          supplier: supplier?.trim() || material.supplier || null,
          refType: 'ORDER',
          notes: notes?.trim() || reference?.trim() || null,
          createdById: user.id,
        },
      }),
    ])

    await audit(
      user,
      'INVENTORY_RECEIVE',
      'INVENTORY',
      transaction.id,
      `Received ${parsedQty} ${material.unit} of "${material.name}". New stock: ${newStock}`
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
