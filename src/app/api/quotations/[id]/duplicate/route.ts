/**
 * AURAVIX BATH STUDIO — Duplicate quotation
 * POST /api/quotations/[id]/duplicate → new DRAFT quotation (V1 INITIAL)
 * deep-copying the current version's bathrooms + items.
 */
import { ApiError, audit, jsonError, nextQuotationNumber, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { isUniqueConstraintError, resolveSettings } from '@/lib/quote-service'

interface DuplicatedQuotation {
  id: string
  quotationNumber: string
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params

    const settings = await resolveSettings()
    const quotation = await db.quotation.findUnique({ where: { id } })
    if (!quotation) throw new ApiError(404, 'Quotation not found.')
    if (user.role !== 'SUPER_ADMIN' && quotation.createdById !== user.id) {
      throw new ApiError(403, 'You can only duplicate your own quotations.')
    }

    const current = await db.quotationVersion.findFirst({
      where: { quotationId: id },
      orderBy: { versionNumber: 'desc' },
      include: { bathrooms: true, items: true },
    })
    if (!current) throw new ApiError(400, 'This quotation has no version to duplicate.')

    let created: DuplicatedQuotation | null = null
    for (let attempt = 0; attempt < 10 && !created; attempt++) {
      const quotationNumber = await nextQuotationNumber(settings.quotePrefix)
      try {
        created = await db.$transaction(async (tx) => {
          const copy = await tx.quotation.create({
            data: {
              quotationNumber,
              customerId: quotation.customerId,
              leadId: quotation.leadId,
              createdById: user.id,
              status: 'DRAFT',
              validityDays: settings.validityDays,
            },
          })
          await tx.quotationVersion.create({
            data: {
              quotationId: copy.id,
              versionNumber: 1,
              versionType: 'INITIAL',
              status: 'DRAFT',
              totalArea: current.totalArea,
              packageId: current.packageId,
              packageName: current.packageName,
              packageRate: current.packageRate,
              packageAmount: current.packageAmount,
              itemsAmount: current.itemsAmount,
              grossValue: current.grossValue,
              discountType: current.discountType,
              discount: current.discount,
              discountAmount: current.discountAmount,
              taxableValue: current.taxableValue,
              gstRate: current.gstRate,
              gstAmount: current.gstAmount,
              totalPayable: current.totalPayable,
              notes: current.notes,
              createdById: user.id,
              bathrooms: {
                create: current.bathrooms.map((b) => ({
                  name: b.name,
                  type: b.type,
                  length: b.length,
                  width: b.width,
                  height: b.height,
                  areaSqft: b.areaSqft,
                })),
              },
              items: {
                create: current.items.map((i) => ({
                  section: i.section,
                  materialId: i.materialId,
                  name: i.name,
                  quantity: i.quantity,
                  unit: i.unit,
                  rate: i.rate,
                  amount: i.amount,
                })),
              },
            },
          })
          return { id: copy.id, quotationNumber: copy.quotationNumber }
        })
      } catch (e) {
        if (isUniqueConstraintError(e, 'quotationNumber') && attempt < 9) continue
        throw e
      }
    }
    if (!created) throw new ApiError(500, 'Could not allocate a quotation number.')

    await audit(user, 'QUOTE_DUPLICATE', 'QUOTATION', created.id, `Duplicated ${quotation.quotationNumber} as ${created.quotationNumber}`)

    return Response.json({ quotation: { id: created.id, quotationNumber: created.quotationNumber } }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
