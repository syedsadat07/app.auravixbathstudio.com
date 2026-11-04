import { NextRequest, NextResponse } from 'next/server'
import { requireUser, audit, ApiError, jsonError } from '@/lib/auth'
import { recordGoodsReturn } from '@/lib/inventory-service'

/**
 * POST /api/inventory/return
 * Handles return of goods to inventory (e.g. from site, customer refund, excess material).
 * Only increments physical stock if returnedToInventory is true.
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

    const { materialId, qty, returnedToInventory, reference, notes } = body
    if (!materialId) throw new ApiError(400, 'Material ID is required')
    const parsedQty = Number(qty)
    if (!parsedQty || parsedQty <= 0) throw new ApiError(400, 'Quantity must be greater than zero')

    // If physical goods were NOT returned (e.g. damaged on site, scrap, monetary refund only),
    // do not increment physical stock.
    if (!returnedToInventory) {
      await audit(
        user,
        'INVENTORY_RETURN_SCRAPPED',
        'INVENTORY',
        materialId,
        `Return processed without physical restock (damaged/scrapped): ${parsedQty} units. Ref: ${reference || 'N/A'}`
      )
      return NextResponse.json({
        success: true,
        restocked: false,
        message: 'Return recorded without physical inventory replenishment.',
      })
    }

    const result = await recordGoodsReturn({
      materialId,
      qty: parsedQty,
      userId: user.id,
      reference,
      notes,
    })

    await audit(
      user,
      'INVENTORY_RETURN',
      'INVENTORY',
      result.transactionId,
      `Returned ${parsedQty} units to inventory. New physical stock: ${result.newStock}. Ref: ${reference || 'N/A'}`
    )

    return NextResponse.json({
      success: true,
      restocked: true,
      newStock: result.newStock,
      transactionId: result.transactionId,
    })
  } catch (e) {
    return jsonError(e)
  }
}

