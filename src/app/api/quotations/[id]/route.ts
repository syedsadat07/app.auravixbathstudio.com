/**
 * AURAVIX BATH STUDIO — Quotation detail
 * GET /api/quotations/[id]
 */
import { ApiError, jsonError, requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { computeValidityDate, sortQuotationItems } from '@/lib/quote-service'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser()
    const { id } = await params

    const quotation = await db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        lead: { select: { leadNumber: true } },
        createdBy: { select: { name: true } },
      },
    })
    if (!quotation) throw new ApiError(404, 'Quotation not found.')
    if (user.role !== 'SUPER_ADMIN' && quotation.createdById !== user.id) {
      throw new ApiError(403, 'You can only view your own quotations.')
    }

    const versions = await db.quotationVersion.findMany({
      where: { quotationId: id },
      orderBy: { versionNumber: 'desc' },
      include: { createdBy: { select: { name: true } } },
    })
    const current = versions[0]
    if (!current) throw new ApiError(404, 'This quotation has no versions.')

    // Insertion order preserved by SQLite; stable-sort items into section order.
    const [bathrooms, items] = await Promise.all([
      db.bathroom.findMany({ where: { versionId: current.id } }),
      db.quotationItem.findMany({ where: { versionId: current.id } }).then(sortQuotationItems),
    ])

    return Response.json({
      quotation: {
        id: quotation.id,
        quotationNumber: quotation.quotationNumber,
        status: quotation.status,
        validityDays: quotation.validityDays,
        validityDate: computeValidityDate(quotation.createdAt, quotation.validityDays),
        createdAt: quotation.createdAt,
        updatedAt: quotation.updatedAt,
        customer: {
          id: quotation.customer.id,
          name: quotation.customer.name,
          phone: quotation.customer.phone,
          email: quotation.customer.email,
          address: quotation.customer.address,
          city: quotation.customer.city,
          pincode: quotation.customer.pincode,
        },
        lead: quotation.lead ? { id: quotation.leadId, leadNumber: quotation.lead.leadNumber } : null,
        createdBy: { id: quotation.createdById, name: quotation.createdBy.name },
        currentVersion: {
          id: current.id,
          versionNumber: current.versionNumber,
          versionType: current.versionType,
          status: current.status,
          notes: current.notes,
          packageId: current.packageId,
          packageName: current.packageName,
          packageRate: current.packageRate,
          packageAmount: current.packageAmount,
          totalArea: current.totalArea,
          itemsAmount: current.itemsAmount,
          grossValue: current.grossValue,
          discountType: current.discountType,
          discount: current.discount,
          discountAmount: current.discountAmount,
          taxableValue: current.taxableValue,
          gstRate: current.gstRate,
          gstAmount: current.gstAmount,
          totalPayable: current.totalPayable,
          createdAt: current.createdAt,
          createdByName: current.createdBy.name,
          bathrooms: bathrooms.map((b) => ({
            id: b.id,
            name: b.name,
            type: b.type,
            length: b.length,
            width: b.width,
            height: b.height,
            areaSqft: b.areaSqft,
          })),
          items: items.map((i) => ({
            id: i.id,
            section: i.section,
            materialId: i.materialId,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            rate: i.rate,
            amount: i.amount,
          })),
        },
        versions: versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          versionType: v.versionType,
          status: v.status,
          totalPayable: v.totalPayable,
          grossValue: v.grossValue,
          createdAt: v.createdAt,
          createdByName: v.createdBy.name,
        })),
      },
    })
  } catch (e) {
    return jsonError(e)
  }
}
