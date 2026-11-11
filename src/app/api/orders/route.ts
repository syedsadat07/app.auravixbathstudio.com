import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireUser, isSuperAdmin, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'
import { ORDER_FLAG_STATUSES } from '@/lib/status'

const WON_LIKE = ['TC_ACCEPTED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']
const PAID_LIKE = ['PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']

/**
 * GET /api/orders?search=
 * Orders = Quotations in an order-pipeline status (TC_ACCEPTED, PAYMENT_PENDING, PAYMENT_RECEIVED, ORDER_CONFIRMED, ORDER_FREEZE).
 * Supports both lead-linked quotations and direct customer quotations (where leadId may be null).
 * RBAC:
 * - Super Admins see all orders.
 * - Normal Admins see quotations they created OR where the linked lead is assigned to them.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const search = req.nextUrl.searchParams.get('search')?.trim()

    // RBAC access filter for normal admins
    const accessFilter: Prisma.QuotationWhereInput = sa
      ? {}
      : {
          OR: [
            { createdById: user.id },
            { lead: { assignedAdminId: user.id } },
          ],
        }

    // Search filter across quotationNumber, customer name/phone/email, and leadNumber
    const searchFilter: Prisma.QuotationWhereInput = search
      ? {
          OR: [
            { quotationNumber: { contains: search, mode: 'insensitive' } },
            { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
            { customer: { is: { phone: { contains: search, mode: 'insensitive' } } } },
            { customer: { is: { email: { contains: search, mode: 'insensitive' } } } },
            { lead: { is: { leadNumber: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}

    const quoteWhere: Prisma.QuotationWhereInput = {
      status: { in: ORDER_FLAG_STATUSES },
      AND: [accessFilter, searchFilter].filter((f) => Object.keys(f).length > 0),
    }

    const quotes = await db.quotation.findMany({
      where: quoteWhere,
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true } },
        lead: {
          include: {
            assignedAdmin: { select: { id: true, name: true } },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: { _count: { select: { bathrooms: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const orders = quotes.map((activeQuote) => {
      const currentVersion = activeQuote.versions[0] // highest versionNumber first
      const publishedVersion = activeQuote.versions.find((v) => v.status === 'PUBLISHED')
      const status = activeQuote.status

      return {
        leadId: activeQuote.lead?.id ?? activeQuote.id,
        leadNumber: activeQuote.lead?.leadNumber ?? activeQuote.quotationNumber,
        leadStatus: activeQuote.lead?.status ?? 'CONVERTED',
        customer: {
          name: activeQuote.customer.name,
          phone: activeQuote.customer.phone,
          email: activeQuote.customer.email,
          address: activeQuote.customer.address,
          city: activeQuote.customer.city,
        },
        createdAt: activeQuote.lead?.createdAt ?? activeQuote.createdAt,
        adviserName: activeQuote.lead?.assignedAdmin?.name ?? activeQuote.createdBy?.name ?? null,
        quote: {
          id: activeQuote.id,
          quotationNumber: activeQuote.quotationNumber,
          versionNumber: currentVersion?.versionNumber ?? 1,
          versionType: currentVersion?.versionType ?? 'INITIAL',
          status,
          totalPayable: currentVersion?.totalPayable ?? 0,
          grossValue: currentVersion?.grossValue ?? 0,
          publishedAt: publishedVersion ? publishedVersion.createdAt : activeQuote.updatedAt,
          bathroomCount: currentVersion?._count.bathrooms ?? 0,
          statusFlags: {
            quotePublished: !['DRAFT', 'UNDER_REVIEW'].includes(status),
            tcAccepted: WON_LIKE.includes(status),
            paymentReceived: PAID_LIKE.includes(status),
            orderFreeze: status === 'ORDER_FREEZE',
          },
        },
        otherVersionsCount: Math.max(activeQuote.versions.length - 1, 0),
      }
    })

    return NextResponse.json({ total: orders.length, orders })
  } catch (e) {
    return jsonError(e)
  }
}
