/**
 * AURAVIX BATH STUDIO — Change quotation status
 * PATCH /api/quotations/[id]/status  { status: QuoteStatus }
 */
import { ApiError, audit, jsonError, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { ORDER_FLAG_STATUSES, QUOTE_STATUSES } from '@/lib/status'
import { releaseStockReservations, reserveStockForQuotation } from '@/lib/inventory-service'

/** Statuses an ADMIN may set… */
const ADMIN_ALLOWED_STATUSES = ['QUOTE_SHARED', 'TC_ACCEPTED', 'PAYMENT_PENDING']
/** …but only while the quote is already in the published pipeline. */
const ADMIN_ALLOWED_CURRENT = ['PUBLISHED', 'QUOTE_SHARED', 'TC_ACCEPTED', 'PAYMENT_PENDING']

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params

    const body = (await req.json().catch(() => null)) as { status?: unknown } | null
    const status = typeof body?.status === 'string' ? body.status : ''
    if (!status || !(QUOTE_STATUSES as readonly string[]).includes(status)) {
      throw new ApiError(400, 'Invalid quotation status.')
    }

    const quotation = await db.quotation.findUnique({ where: { id } })
    if (!quotation) throw new ApiError(404, 'Quotation not found.')

    if (user.role !== 'SUPER_ADMIN') {
      if (quotation.createdById !== user.id) {
        throw new ApiError(403, 'You can only update your own quotations.')
      }
      if (!ADMIN_ALLOWED_STATUSES.includes(status)) {
        throw new ApiError(403, 'You can only set Quote Shared, T&C Accepted or Payment Pending.')
      }
      if (!ADMIN_ALLOWED_CURRENT.includes(quotation.status)) {
        throw new ApiError(403, 'Quote status can only be updated after the quote is published.')
      }
    }

    const current = await db.quotationVersion.findFirst({
      where: { quotationId: id },
      orderBy: { versionNumber: 'desc' },
    })
    if (!current) throw new ApiError(400, 'This quotation has no version.')

    await db.$transaction(
      async (tx) => {
        await tx.quotation.update({ where: { id }, data: { status } })
        await tx.quotationVersion.update({ where: { id: current.id }, data: { status } })

        // Stock movement rules:
        // - Draft quotations must not reduce physical inventory.
        // - Approved orders may reserve stock according to the configured workflow.
        // - Cancelled orders must release reservations where applicable.
        if (ORDER_FLAG_STATUSES.includes(status)) {
          await reserveStockForQuotation(current.id, tx)
        } else if (status === 'CANCELLED' || status === 'EXPIRED') {
          await releaseStockReservations(current.id, tx)
        }
      },
      { maxWait: 15_000, timeout: 60_000 }
    )

    await audit(user, 'QUOTE_STATUS', 'QUOTATION', id, `${quotation.status} → ${status}`)

    return Response.json({
      quotation: {
        id,
        quotationNumber: quotation.quotationNumber,
        versionNumber: current.versionNumber,
        status,
        totalPayable: current.totalPayable,
        grossValue: current.grossValue,
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
