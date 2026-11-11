import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ApiError,
  audit,
  isSuperAdmin,
  jsonError,
  nextRefundNumber,
  requireUser,
} from '@/lib/auth'

/**
 * GET /api/refunds
 * List all refund requests with role-based scoping and status filters.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { searchParams } = new URL(req.url)

    const search = searchParams.get('search')?.trim()
    const status = searchParams.get('status')?.trim()
    const customerId = searchParams.get('customerId')?.trim()
    const quotationId = searchParams.get('quotationId')?.trim()

    const where: Prisma.RefundWhereInput = {}

    // RBAC: Normal admins only see refunds for assigned customers or requested by themselves
    if (!sa) {
      where.OR = [
        { requestedById: user.id },
        { customer: { leads: { some: { assignedAdminId: user.id } } } },
        { quotation: { lead: { assignedAdminId: user.id } } },
      ]
    }

    if (status && status !== 'ALL') {
      where.status = status
    }

    if (customerId) {
      where.customerId = customerId
    }

    if (quotationId) {
      where.quotationId = quotationId
    }

    if (search) {
      const searchCondition: Prisma.RefundWhereInput[] = [
        { refundNumber: { contains: search, mode: 'insensitive' } },
        { processingRef: { contains: search, mode: 'insensitive' } },
        { reason: { contains: search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { phone: { contains: search, mode: 'insensitive' } } } },
        { quotation: { is: { quotationNumber: { contains: search, mode: 'insensitive' } } } },
      ]

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCondition }]
        delete where.OR
      } else {
        where.OR = searchCondition
      }
    }

    const refunds = await db.refund.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true, city: true },
        },
        quotation: {
          select: { id: true, quotationNumber: true, status: true },
        },
        payment: {
          select: { id: true, paymentNumber: true, amount: true, method: true, reference: true },
        },
        requestedBy: {
          select: { id: true, name: true, role: true },
        },
        reviewedBy: {
          select: { id: true, name: true, role: true },
        },
        _count: {
          select: { comments: true },
        },
      },
    })

    // Compute summary stats
    const stats = {
      totalCount: refunds.length,
      requestedCount: refunds.filter((r) => r.status === 'REFUND_REQUESTED').length,
      reviewCount: refunds.filter((r) => r.status === 'UNDER_REVIEW').length,
      approvedCount: refunds.filter((r) => r.status === 'APPROVED').length,
      processingCount: refunds.filter((r) => r.status === 'PROCESSING').length,
      completedCount: refunds.filter((r) => ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(r.status)).length,
      totalRequestedAmount: refunds.reduce((sum, r) => sum + r.requestedAmount, 0),
      totalApprovedAmount: refunds.reduce((sum, r) => sum + r.approvedAmount, 0),
      totalDisbursedAmount: refunds.reduce((sum, r) => sum + r.completedAmount, 0),
    }

    return NextResponse.json({ refunds, stats })
  } catch (err) {
    return jsonError(err)
  }
}

/**
 * POST /api/refunds
 * Submit a refund request.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const body = await req.json()

    const {
      customerId,
      quotationId,
      orderId,
      paymentId,
      requestedAmount,
      reason,
      internalNotes,
      paymentMethod,
    } = body

    if (!customerId) {
      throw new ApiError(400, 'Customer ID is required')
    }
    const amount = Number(requestedAmount)
    if (!amount || amount <= 0) {
      throw new ApiError(400, 'Requested refund amount must be greater than 0')
    }
    if (!reason || !reason.trim()) {
      throw new ApiError(400, 'Refund reason is required')
    }

    // Verify customer exists
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      include: { leads: true },
    })
    if (!customer) {
      throw new ApiError(404, 'Customer not found')
    }

    // RBAC: Check if normal admin is assigned to this customer
    if (!sa) {
      const isAssigned = customer.leads.some((l) => l.assignedAdminId === user.id)
      if (!isAssigned) {
        throw new ApiError(403, 'You can only request refunds for your assigned customers')
      }
    }

    // Validate payment if provided
    let originalPaymentAmount = 0
    if (paymentId) {
      const payment = await db.payment.findUnique({ where: { id: paymentId } })
      if (!payment) {
        throw new ApiError(404, 'Linked payment record not found')
      }
      originalPaymentAmount = payment.amount
      const remainingBalance = payment.amount - payment.refundedAmount
      if (amount > remainingBalance) {
        throw new ApiError(
          400,
          `Requested amount (₹${amount}) exceeds remaining refundable balance (₹${remainingBalance}) on this payment`
        )
      }
    }

    const refundNumber = await nextRefundNumber()

    // Transaction to create Refund and initial RefundComment
    const refund = await db.$transaction(
      async (tx) => {
        const created = await tx.refund.create({
          data: {
            refundNumber,
            customerId,
            quotationId: quotationId || null,
            orderId: orderId || quotationId || null,
            paymentId: paymentId || null,
            originalPaymentAmount,
            requestedAmount: amount,
            approvedAmount: 0,
            completedAmount: 0,
            reason: reason.trim(),
            status: 'REFUND_REQUESTED',
            paymentMethod: paymentMethod || 'BANK_TRANSFER',
            internalNotes: internalNotes?.trim() || null,
            requestedById: user.id,
          },
          include: {
            customer: true,
            quotation: true,
            payment: true,
            requestedBy: { select: { id: true, name: true, role: true } },
          },
        })

        // Add initial comment
        await tx.refundComment.create({
          data: {
            refundId: created.id,
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: 'STATUS_CHANGE',
            statusFrom: null,
            statusTo: 'REFUND_REQUESTED',
            comment: `Refund request initiated for ₹${amount}. Reason: ${reason.trim()}`,
          },
        })

        return created
      },
      { maxWait: 15_000, timeout: 30_000 }
    )

    await audit(
      user,
      'REQUEST_REFUND',
      'REFUND',
      refund.id,
      `Requested refund ${refund.refundNumber} of ₹${amount} for customer ${customer.name}`
    )

    return NextResponse.json({ refund }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}

