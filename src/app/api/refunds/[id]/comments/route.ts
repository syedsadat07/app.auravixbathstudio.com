import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, isSuperAdmin, jsonError, requireUser } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/refunds/[id]/comments
 * Add an internal comment to a refund record.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { id } = await context.params
    const body = await req.json()

    const commentText = body?.comment?.trim()
    if (!commentText) {
      throw new ApiError(400, 'Comment text is required')
    }

    const refund = await db.refund.findUnique({
      where: { id },
      include: { customer: { include: { leads: true } } },
    })
    if (!refund) {
      throw new ApiError(404, 'Refund not found')
    }

    if (!sa) {
      const isRequester = refund.requestedById === user.id
      const isAssigned = refund.customer.leads.some((l) => l.assignedAdminId === user.id)
      if (!isRequester && !isAssigned) {
        throw new ApiError(403, 'Not authorized to comment on this refund')
      }
    }

    const created = await db.refundComment.create({
      data: {
        refundId: id,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'NOTE',
        statusFrom: refund.status,
        statusTo: refund.status,
        comment: commentText,
      },
    })

    await audit(user, 'ADD_REFUND_COMMENT', 'REFUND', id, `Added comment on refund ${refund.refundNumber}`)

    return NextResponse.json({ comment: created }, { status: 201 })
  } catch (err) {
    return jsonError(err)
  }
}

