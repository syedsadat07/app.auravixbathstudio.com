/**
 * AURAVIX BATH STUDIO — Inventory & Stock Reservation Service
 *
 * Enforces stock movement and reservation rules:
 * 1. Draft quotations must not reduce physical inventory.
 * 2. Approved orders reserve stock according to workflow.
 * 3. Dispatch or material issuance records actual stock movements.
 * 4. Cancelled orders release reservations.
 * 5. Returns and refunds record physical stock return.
 * 6. Idempotent operations prevent duplicate stock deductions.
 * 7. Separate tracking of physical stock, reserved stock, and available stock.
 */
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/auth'

type TxClient = Prisma.TransactionClient

export interface StockOverviewItem {
  id: string
  name: string
  brand: string | null
  sku: string | null
  category: { id: string; name: string }
  unit: string
  purchaseCost: number
  price: number
  physicalStock: number
  reservedStock: number
  availableStock: number
  reorderThreshold: number
  isLowStock: boolean
  isOutOfStock: boolean
  supplier: string | null
}

/**
 * Reserve stock for an approved quotation version.
 * Idempotent: checks for existing active reservations before reserving.
 */
export async function reserveStockForQuotation(
  versionId: string,
  tx?: TxClient
): Promise<{ reservedCount: number; alreadyReserved: boolean }> {
  const client = tx ?? db

  // Fetch the version and its items with material references
  const version = await client.quotationVersion.findUnique({
    where: { id: versionId },
    include: {
      items: {
        where: { materialId: { not: null } },
      },
      reservations: {
        where: { status: 'RESERVED' },
      },
    },
  })

  if (!version) throw new ApiError(404, `Quotation version ${versionId} not found`)

  // Check if already reserved
  if (version.reservations.length > 0) {
    return { reservedCount: version.reservations.length, alreadyReserved: true }
  }

  // Aggregate required quantities per material across all quotation items
  const materialQuantities = new Map<string, { qty: number; itemId?: string }>()
  for (const item of version.items) {
    if (!item.materialId || !(item.quantity > 0)) continue
    const current = materialQuantities.get(item.materialId)
    const newQty = (current?.qty ?? 0) + item.quantity
    materialQuantities.set(item.materialId, { qty: newQty, itemId: item.id })
  }

  const materialIds = Array.from(materialQuantities.keys())
  if (materialIds.length === 0) {
    return { reservedCount: 0, alreadyReserved: false }
  }

  // Batch prefetch all materials in ONE single query to avoid N+1 queries & transaction timeout
  const materials = await client.material.findMany({
    where: { id: { in: materialIds } },
  })
  const materialMap = new Map(materials.map((m) => [m.id, m]))

  let count = 0
  for (const [materialId, { qty, itemId }] of materialQuantities.entries()) {
    const material = materialMap.get(materialId)
    if (!material) continue

    const updatedReserved = (material.reservedQty ?? 0) + qty

    // Execute sequentially to prevent SQLite lock contention inside transactions
    await client.stockReservation.create({
      data: {
        versionId,
        itemId,
        materialId,
        qtyReserved: qty,
        status: 'RESERVED',
      },
    })
    await client.material.update({
      where: { id: materialId },
      data: { reservedQty: updatedReserved },
    })
    await client.inventoryTransaction.create({
      data: {
        materialId,
        type: 'RESERVED',
        qty,
        purchaseCost: material.purchaseCost ?? 0,
        refType: 'QUOTATION',
        refId: versionId,
        notes: `Stock reserved for approved quotation order (${versionId})`,
        createdById: version.createdById,
      },
    })

    count++
  }

  return { reservedCount: count, alreadyReserved: false }
}

/**
 * Release reservations for a cancelled/expired quotation or order.
 * Idempotent: only releases active 'RESERVED' records.
 */
export async function releaseStockReservations(
  versionId: string,
  tx?: TxClient
): Promise<{ releasedCount: number }> {
  const client = tx ?? db

  const activeReservations = await client.stockReservation.findMany({
    where: {
      versionId,
      status: 'RESERVED',
    },
    include: { material: true },
  })

  if (activeReservations.length === 0) {
    return { releasedCount: 0 }
  }

  let count = 0
  for (const res of activeReservations) {
    const currentReserved = res.material.reservedQty ?? 0
    const newReserved = Math.max(0, currentReserved - res.qtyReserved)

    await client.stockReservation.update({
      where: { id: res.id },
      data: { status: 'RELEASED' },
    })
    await client.material.update({
      where: { id: res.materialId },
      data: { reservedQty: newReserved },
    })
    await client.inventoryTransaction.create({
      data: {
        materialId: res.materialId,
        type: 'RELEASED',
        qty: -res.qtyReserved,
        purchaseCost: res.material.purchaseCost ?? 0,
        refType: 'QUOTATION',
        refId: versionId,
        notes: `Stock reservation released for cancelled quotation (${versionId})`,
      },
    })

    count++
  }

  return { releasedCount: count }
}

/**
 * Dispatch material / issue physical stock for a quotation version.
 * Deducts physical inventory, releases reservation, and marks as DISPATCHED.
 * Idempotent: checks if already dispatched to prevent duplicate deductions.
 */
export async function dispatchStockForQuotation(
  versionId: string,
  userId: string,
  tx?: TxClient
): Promise<{ dispatchedCount: number; alreadyDispatched: boolean }> {
  const client = tx ?? db

  // Check if an ISSUED transaction for this quotation already exists
  const existingTx = await client.inventoryTransaction.findFirst({
    where: {
      refType: 'QUOTATION',
      refId: versionId,
      type: 'ISSUED',
    },
  })

  if (existingTx) {
    return { dispatchedCount: 0, alreadyDispatched: true }
  }

  const reservations = await client.stockReservation.findMany({
    where: {
      versionId,
      status: 'RESERVED',
    },
    include: { material: true },
  })

  let count = 0
  for (const res of reservations) {
    const material = res.material
    const currentStock = material.stockQty ?? 0
    const currentReserved = material.reservedQty ?? 0

    const newStock = Math.max(0, currentStock - res.qtyReserved)
    const newReserved = Math.max(0, currentReserved - res.qtyReserved)

    await Promise.all([
      client.material.update({
        where: { id: res.materialId },
        data: {
          stockQty: newStock,
          reservedQty: newReserved,
        },
      }),
      client.stockReservation.update({
        where: { id: res.id },
        data: { status: 'DISPATCHED' },
      }),
      client.inventoryTransaction.create({
        data: {
          materialId: res.materialId,
          type: 'ISSUED',
          qty: -res.qtyReserved,
          purchaseCost: material.purchaseCost ?? 0,
          refType: 'QUOTATION',
          refId: versionId,
          notes: `Material dispatched for quotation order ${versionId}`,
          createdById: userId,
        },
      }),
    ])

    count++
  }

  return { dispatchedCount: count, alreadyDispatched: false }
}

/**
 * Record return of goods to physical stock.
 */
export async function recordGoodsReturn(opts: {
  materialId: string
  qty: number
  userId: string
  reference?: string | null
  notes?: string | null
  tx?: TxClient
}): Promise<{ newStock: number; transactionId: string }> {
  const client = opts.tx ?? db
  const parsedQty = Math.abs(opts.qty)
  if (!(parsedQty > 0)) throw new ApiError(400, 'Quantity must be greater than zero')

  const material = await client.material.findUnique({ where: { id: opts.materialId } })
  if (!material) throw new ApiError(404, 'Material not found')

  const newStock = (material.stockQty ?? 0) + parsedQty

  const [_, txRecord] = await Promise.all([
    client.material.update({
      where: { id: opts.materialId },
      data: { stockQty: newStock },
    }),
    client.inventoryTransaction.create({
      data: {
        materialId: opts.materialId,
        type: 'RETURNED',
        qty: parsedQty,
        purchaseCost: material.purchaseCost ?? 0,
        refType: 'RETURN',
        refId: opts.reference || null,
        notes: opts.notes || 'Customer/site return to inventory',
        createdById: opts.userId,
      },
    }),
  ])

  return { newStock, transactionId: txRecord.id }
}

