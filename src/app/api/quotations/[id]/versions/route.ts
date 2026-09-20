/**
 * AURAVIX BATH STUDIO — Create a new quotation version
 * POST /api/quotations/[id]/versions  (QuotePayload → V(n+1))
 */
import { ApiError, audit, jsonError, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { createVersionFromPayload, type QuotePayload } from '@/lib/quote-service'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params
    const payload = (await req.json().catch(() => null)) as QuotePayload | null
    if (!payload || typeof payload !== 'object') throw new ApiError(400, 'Invalid request body.')

    const quotation = await db.quotation.findUnique({ where: { id } })
    if (!quotation) throw new ApiError(404, 'Quotation not found.')
    if (user.role !== 'SUPER_ADMIN' && quotation.createdById !== user.id) {
      throw new ApiError(403, 'You can only modify your own quotations.')
    }
    if (quotation.status === 'CANCELLED') {
      throw new ApiError(400, 'Cancelled quotations cannot be modified.')
    }

    const version = await createVersionFromPayload({ quotation, payload, user })

    // Quotation status follows the new current version (DRAFT or PUBLISHED).
    await db.quotation.update({ where: { id }, data: { status: version.status } })

    await audit(user, 'QUOTE_VERSION_CREATE', 'QUOTATION', id, `Created V${version.versionNumber} of ${quotation.quotationNumber}`)
    if (version.status === 'PUBLISHED') {
      await audit(user, 'QUOTE_PUBLISH', 'QUOTATION', id, `Published ${quotation.quotationNumber} V${version.versionNumber}`)
    }

    return Response.json(
      { quotation: { id, quotationNumber: quotation.quotationNumber, versionNumber: version.versionNumber } },
      { status: 201 }
    )
  } catch (e) {
    return jsonError(e)
  }
}
