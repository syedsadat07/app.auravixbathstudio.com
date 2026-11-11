import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  ApiError,
  audit,
  isSuperAdmin,
  jsonError,
  nextPaymentNumber,
  requireUser,
} from '@/lib/auth'

/**
 * GET /api/payments
 * List payments with quotation and customer details.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { searchParams } = new URL(req.url)

    const quotationId = searchParams.get('quotationId')?.trim()
    const customerId = searchParams.get('customerId')?.trim()
    const search = searchParams.get('search')?.trim()

    const where: Prisma.PaymentWhereInput = {}

    if (!sa) {
      where.customer = {
        leads: { some: { assignedAdminId: user.id } },
      }
    }

    if (quotationId) {
      where.quotationId = quotationId
    }

    if (customerId) {
      where.customerId = customerId
    }

    if (search) {
      where.OR = [
        { paymentNumber: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { customer: { is: { phone: { contains: search, mode: 'insensitive' } } } },
        { quotation: { is: { quotationNumber: { contains: search, mode: 'insensitive' } } } },
      ]
    }

    const payments = await db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        quotation: {
          select: { id: true, quotationNumber: true, status: true },
        },
        refunds: {
          select: { id: true, refundNumber: true, status: true, requestedAmount: true, completedAmount: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ payments })
  } catch (err) {
    return jsonError(err)
  }
}

/**
 * POST /api/payments
 * Record a new payment or installment against a quotation/order.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const body = await req.json()

    const {
      quotationId,
      customerId,
      amount: rawAmount,
      type = 'INSTALLMENT',
      method = 'UPI',
      reference,
      notes,
      paidAt,
    } = body

    if (!quotationId) throw new ApiError(400, 'Quotation ID is required')
    if (!customerId) throw new ApiError(400, 'Customer ID is required')

    const amount = Number(rawAmount)
    if (!amount || amount <= 0) {
      throw new ApiError(400, 'Payment amount must be greater than 0')
    }

    const quotation = await db.quotation.findUnique({
      where: { id: quotationId },
      include: {
        customer: { include: { leads: true } },
        lead: true,
      },
    })
    if (!quotation) {
      throw new ApiError(404, 'Quotation not found')
    }

    // RBAC: Verify normal admin is assigned to this lead
    if (!sa) {
      const isAssigned = quotation.lead?.assignedAdminId === user.id
      if (!isAssigned) {
        throw new ApiError(403, 'You can only record payments for your assigned leads/orders')
      }
    }

    const paymentNumber = await nextPaymentNumber()

    const payment = await db.$transaction(
      async (tx) => {
        const p = await tx.payment.create({
          data: {
            paymentNumber,
            quotationId,
            customerId,
            amount,
            type,
            method,
            reference: reference?.trim() || null,
            notes: notes?.trim() || null,
            paidAt: paidAt ? new Date(paidAt) : new Date(),
            createdById: user.id,
          },
          include: {
            customer: true,
            quotation: true,
          },
        })

        // If quotation is in PAYMENT_PENDING or TC_ACCEPTED, advance it to PAYMENT_RECEIVED
        if (['TC_ACCEPTED', 'PAYMENT_PENDING', 'PUBLISHED', 'QUOTE_SHARED'].includes(quotation.status)) {
          await tx.quotation.update({
            where: { id: quotationId },
            data: { status: 'PAYMENT_RECEIVED' },
          })
        }

        return p
      },
      { maxWait: 15_000, timeout: 30_000 }
    )

    await audit(
      user,
      'RECORD_PAYMENT',
      'PAYMENT',
      payment.id,
      `Recorded payment ${payment.paymentNumber} of ₹${amount} for quotation ${quotation.quotationNumber}`
    )

    return NextResponse.json({ payment }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}

