import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ApiError,
  audit,
  isSuperAdmin,
  jsonError,
  requireSuperAdmin,
  requireUser,
} from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/refunds/[id]
 * Fetch single refund record with full customer, order, payment and comment history.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { id } = await context.params

    const refund = await db.refund.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
        },
        payment: true,
        requestedBy: {
          select: { id: true, name: true, role: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, role: true, email: true },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!refund) {
      throw new ApiError(404, 'Refund record not found')
    }

    // RBAC: Check access
    if (!sa) {
      const isRequester = refund.requestedById === user.id
      const customer = await db.customer.findUnique({
        where: { id: refund.customerId },
        include: { leads: true },
      })
      const isAssigned = customer?.leads.some((l) => l.assignedAdminId === user.id)
      if (!isRequester && !isAssigned) {
        throw new ApiError(403, 'You are not authorized to view this refund record')
      }
    }

    return NextResponse.json({ refund })
  } catch (err) {
    return jsonError(err)
  }
}

/**
 * PATCH /api/refunds/[id]
 * Update refund status and execute refund workflow transitions.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { id } = await context.params
    const body = await req.json()

    const {
      status: nextStatus,
      approvedAmount: newApprovedAmount,
      completedAmount: newCompletedAmount,
      processingRef,
      paymentMethod,
      comment,
      internalNotes,
    } = body

    const existing = await db.refund.findUnique({
      where: { id },
      include: {
        payment: true,
        customer: true,
      },
    })

    if (!existing) {
      throw new ApiError(404, 'Refund record not found')
    }

    // Permission Enforcement
    // Only Super Admin can Approve, Reject, or complete Refunds
    const requiresSuperAdminStatuses = ['APPROVED', 'REJECTED', 'REFUNDED', 'PARTIALLY_REFUNDED']
    if (nextStatus && requiresSuperAdminStatuses.includes(nextStatus)) {
      if (!sa) {
        throw new ApiError(403, 'Only Super Admins have permission to approve, reject, or disburse refunds')
      }
    }

    // Prepare update data
    const updateData: Record<string, unknown> = {}
    const commentLogs: string[] = []

    if (processingRef !== undefined) {
      updateData.processingRef = processingRef?.trim() || null
    }
    if (paymentMethod !== undefined) {
      updateData.paymentMethod = paymentMethod
    }
    if (internalNotes !== undefined) {
      updateData.internalNotes = internalNotes?.trim() || null
    }

    // Workflow state machine
    if (nextStatus && nextStatus !== existing.status) {
      updateData.status = nextStatus

      switch (nextStatus) {
        case 'UNDER_REVIEW': {
          commentLogs.push(`Moved refund status to Under Review.`)
          break
        }

        case 'APPROVED': {
          // Enforce approved amount
          const appAmt =
            newApprovedAmount !== undefined && newApprovedAmount !== null
              ? Number(newApprovedAmount)
              : existing.requestedAmount

          if (appAmt <= 0) {
            throw new ApiError(400, 'Approved amount must be greater than 0')
          }
          if (appAmt > existing.requestedAmount) {
            throw new ApiError(400, `Approved amount (₹${appAmt}) cannot exceed requested amount (₹${existing.requestedAmount})`)
          }

          updateData.approvedAmount = appAmt
          updateData.reviewedById = user.id
          updateData.reviewedAt = new Date()
          // Note: completedAmount remains 0! (Money is NOT yet returned to customer)
          commentLogs.push(`Approved refund for ₹${appAmt}. Awaiting disbursement/processing.`)
          break
        }

        case 'REJECTED': {
          updateData.reviewedById = user.id
          updateData.reviewedAt = new Date()
          commentLogs.push(`Refund request was REJECTED by ${user.name}.`)
          break
        }

        case 'PROCESSING': {
          if (processingRef) {
            commentLogs.push(`Disbursement in progress. Ref/UTR: ${processingRef}`)
          } else {
            commentLogs.push(`Disbursement in progress with banking partner.`)
          }
          break
        }

        case 'REFUNDED':
        case 'PARTIALLY_REFUNDED': {
          // Money returned confirmation
          const finalDisbursed =
            newCompletedAmount !== undefined && newCompletedAmount !== null
              ? Number(newCompletedAmount)
              : (existing.approvedAmount > 0 ? existing.approvedAmount : existing.requestedAmount)

          if (finalDisbursed <= 0) {
            throw new ApiError(400, 'Completed refund disbursement amount must be greater than 0')
          }

          const ref = processingRef || existing.processingRef
          if (!ref || !ref.trim()) {
            throw new ApiError(400, 'A bank reference / gateway refund reference (UTR) is required to confirm disbursement')
          }

          updateData.completedAmount = finalDisbursed
          updateData.completedAt = new Date()
          updateData.processingRef = ref.trim()

          // If the disbursed amount is less than approved, automatically adjust to PARTIALLY_REFUNDED
          if (existing.approvedAmount > 0 && finalDisbursed < existing.approvedAmount && nextStatus === 'REFUNDED') {
            updateData.status = 'PARTIALLY_REFUNDED'
          }

          commentLogs.push(
            `Disbursement confirmed: ₹${finalDisbursed} returned to customer via ${updateData.paymentMethod || existing.paymentMethod || 'Bank Transfer'}. Ref: ${ref.trim()}`
          )
          break
        }

        case 'FAILED': {
          commentLogs.push(`Disbursement attempt failed.`)
          break
        }

        default:
          break
      }
    } else if (newApprovedAmount !== undefined && sa) {
      updateData.approvedAmount = Number(newApprovedAmount)
      commentLogs.push(`Updated approved amount to ₹${newApprovedAmount}`)
    }

    // Execute within database transaction to maintain strict integrity
    const updated = await db.$transaction(async (tx) => {
      const res = await tx.refund.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          quotation: true,
          payment: true,
          requestedBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
        },
      })

      // If money disbursed was updated and payment is linked, update payment.refundedAmount
      if (
        (updateData.status === 'REFUNDED' || updateData.status === 'PARTIALLY_REFUNDED') &&
        res.paymentId &&
        updateData.completedAmount
      ) {
        await tx.payment.update({
          where: { id: res.paymentId },
          data: {
            refundedAmount: { increment: Number(updateData.completedAmount) },
            status:
              Number(updateData.completedAmount) >= (existing.payment?.amount ?? 0)
                ? 'REFUNDED'
                : 'PARTIALLY_REFUNDED',
          },
        })
      }

      // Record refund comment for status change or internal note
      const commentText = [comment?.trim(), ...commentLogs].filter(Boolean).join(' | ')
      if (commentText) {
        await tx.refundComment.create({
          data: {
            refundId: id,
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            action: nextStatus ? 'STATUS_CHANGE' : 'NOTE',
            statusFrom: existing.status,
            statusTo: (updateData.status as string) || existing.status,
            comment: commentText,
          },
        })
      }

      return res
    })

    await audit(
      user,
      'UPDATE_REFUND_STATUS',
      'REFUND',
      updated.id,
      `Updated refund ${updated.refundNumber} status: ${existing.status} -> ${updated.status}`
    )

    return NextResponse.json({ refund: updated })
  } catch (err) {
    return jsonError(err)
  }
}

