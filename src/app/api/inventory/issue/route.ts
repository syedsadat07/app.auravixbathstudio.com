import { NextRequest, NextResponse } from 'next/server'
import { requireUser, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/inventory/issue
 * Record materials dispatched / issued for installation or project.
 * Decrements Material.stockQty and logs an InventoryTransaction of type ISSUED.
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

    const { materialId, qty, reference, notes, quotationId } = body
    if (!materialId) throw new ApiError(400, 'Material ID is required')
    const parsedQty = Number(qty)
    if (!parsedQty || parsedQty <= 0) throw new ApiError(400, 'Quantity must be greater than zero')

    const material = await db.material.findUnique({ where: { id: materialId } })
    if (!material) throw new ApiError(404, 'Material not found')

    const currentStock = material.stockQty ?? 0
    if (currentStock < parsedQty) {
      throw new ApiError(
        400,
        `Insufficient stock for "${material.name}". Available: ${currentStock} ${material.unit}, requested: ${parsedQty} ${material.unit}`
      )
    }

    const newStock = currentStock - parsedQty

    const [updatedMaterial, transaction] = await db.$transaction([
      db.material.update({
        where: { id: materialId },
        data: { stockQty: newStock },
      }),
      db.inventoryTransaction.create({
        data: {
          materialId,
          type: 'ISSUED',
          qty: -parsedQty, // Negative for reduction
          purchaseCost: material.purchaseCost ?? 0,
          refType: quotationId ? 'QUOTATION' : 'MANUAL',
          refId: quotationId?.trim() || null,
          notes: notes?.trim() || reference?.trim() || null,
          createdById: user.id,
        },
      }),
    ])

    await audit(
      user,
      'INVENTORY_ISSUE',
      'INVENTORY',
      transaction.id,
      `Issued ${parsedQty} ${material.unit} of "${material.name}". Remaining stock: ${newStock}`
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
