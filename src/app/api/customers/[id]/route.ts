import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError, isSuperAdmin, jsonError, requireUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser()
    const { id } = await params

    const customer = await db.customer.findUnique({ where: { id } })
    if (!customer) throw new ApiError(404, 'Customer not found')

    // Admin scope check via leads: must have at least one lead assigned to them
    if (!isSuperAdmin(user)) {
      const ownLead = await db.lead.findFirst({
        where: { customerId: id, assignedAdminId: user.id },
        select: { id: true },
      })
      if (!ownLead) throw new ApiError(404, 'Customer not found')
    }

    const leadWhere: Prisma.LeadWhereInput = isSuperAdmin(user)
      ? { customerId: id }
      : { customerId: id, assignedAdminId: user.id }

    const quoteWhere: Prisma.QuotationWhereInput = isSuperAdmin(user)
      ? { customerId: id }
      : {
          customerId: id,
          OR: [{ createdById: user.id }, { lead: { assignedAdminId: user.id } }],
        }

    const [leads, quotations] = await Promise.all([
      db.lead.findMany({
        where: leadWhere,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          leadNumber: true,
          status: true,
          lostReason: true,
          source: true,
          notes: true,
          appointmentDate: true,
          createdAt: true,
          assignedAdmin: { select: { id: true, name: true } },
        },
      }),
      db.quotation.findMany({
        where: quoteWhere,
        orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
      }),
    ])

    const mappedQuotations = quotations.map((q) => {
      const cv = q.versions[0] ?? null
      return {
        id: q.id,
        quotationNumber: q.quotationNumber,
        createdAt: q.createdAt,
        status: cv?.status ?? q.status,
        totalPayable: cv?.totalPayable ?? 0,
        grossValue: cv?.grossValue ?? 0,
        currentVersion: cv
          ? {
              id: cv.id,
              versionNumber: cv.versionNumber,
              versionType: cv.versionType,
              status: cv.status,
              totalArea: cv.totalArea,
              grossValue: cv.grossValue,
              totalPayable: cv.totalPayable,
              createdAt: cv.createdAt,
            }
          : null,
        versions: q.versions.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          versionType: v.versionType,
          status: v.status,
          totalPayable: v.totalPayable,
          createdAt: v.createdAt,
        })),
      }
    })

    return Response.json({ customer, leads, quotations: mappedQuotations })
  } catch (e) {
    return jsonError(e)
  }
}
