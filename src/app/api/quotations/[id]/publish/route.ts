/**
 * AURAVIX BATH STUDIO — Publish the current quotation version
 * POST /api/quotations/[id]/publish
 */
import { ApiError, audit, jsonError, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveSettings } from '@/lib/quote-service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params

    const settings = await resolveSettings()
    if (user.role !== 'SUPER_ADMIN' && !settings.adminsCanPublish) {
      throw new ApiError(403, 'Publishing requires Super Admin approval.')
    }

    const quotation = await db.quotation.findUnique({ where: { id } })
    if (!quotation) throw new ApiError(404, 'Quotation not found.')
    if (user.role !== 'SUPER_ADMIN' && quotation.createdById !== user.id) {
      throw new ApiError(403, 'You can only publish your own quotations.')
    }
    if (quotation.status === 'CANCELLED') {
      throw new ApiError(400, 'Cancelled quotations cannot be published.')
    }

    const current = await db.quotationVersion.findFirst({
      where: { quotationId: id },
      orderBy: { versionNumber: 'desc' },
    })
    if (!current) throw new ApiError(400, 'This quotation has no version to publish.')

    await db.$transaction([
      db.quotationVersion.update({ where: { id: current.id }, data: { status: 'PUBLISHED' } }),
      db.quotation.update({ where: { id }, data: { status: 'PUBLISHED' } }), // updatedAt → now via @updatedAt
    ])

    await audit(user, 'QUOTE_PUBLISH', 'QUOTATION', id, `Published ${quotation.quotationNumber} V${current.versionNumber}`)

    return Response.json({
      quotation: {
        id,
        quotationNumber: quotation.quotationNumber,
        versionNumber: current.versionNumber,
        versionType: current.versionType,
        status: 'PUBLISHED',
        totalPayable: current.totalPayable,
        grossValue: current.grossValue,
        updatedAt: new Date(),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
