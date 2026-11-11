import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, isSuperAdmin, jsonError, requireSuperAdmin, requireUser } from '@/lib/auth'

/**
 * GET /api/targets?month=&year=&userId=
 * View monthly targets (Super Admin views all; Admin views only own).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser()
    const sa = isSuperAdmin(user)
    const { searchParams } = new URL(req.url)

    const now = new Date()
    const month = Number(searchParams.get('month')) || now.getMonth() + 1
    const year = Number(searchParams.get('year')) || now.getFullYear()
    const requestedUserId = searchParams.get('userId')?.trim()

    // RBAC: Normal admin can only see their own target
    const targetUserId = sa ? (requestedUserId || undefined) : user.id

    const targets = await db.monthlyTarget.findMany({
      where: {
        month,
        year,
        ...(targetUserId ? { userId: targetUserId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ targets, month, year })
  } catch (err) {
    return jsonError(err)
  }
}

/**
 * POST /api/targets
 * Super Admin only: Set or update monthly targets for an administrator.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireSuperAdmin()
    const body = await req.json()

    const { userId, month, year, revenueTarget, collectionTarget, leadsTarget, conversionsTarget } = body

    if (!userId) throw new ApiError(400, 'User ID is required')
    if (!month || month < 1 || month > 12) throw new ApiError(400, 'Valid month (1-12) is required')
    if (!year || year < 2020) throw new ApiError(400, 'Valid year is required')

    const targetUser = await db.user.findUnique({ where: { id: userId } })
    if (!targetUser) throw new ApiError(404, 'User not found')

    const target = await db.monthlyTarget.upsert({
      where: {
        userId_month_year: {
          userId,
          month: Number(month),
          year: Number(year),
        },
      },
      create: {
        userId,
        month: Number(month),
        year: Number(year),
        revenueTarget: Number(revenueTarget) || 0,
        collectionTarget: Number(collectionTarget) || 0,
        leadsTarget: Number(leadsTarget) || 0,
        conversionsTarget: Number(conversionsTarget) || 0,
      },
      update: {
        revenueTarget: Number(revenueTarget) || 0,
        collectionTarget: Number(collectionTarget) || 0,
        leadsTarget: Number(leadsTarget) || 0,
        conversionsTarget: Number(conversionsTarget) || 0,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    })

    await audit(
      actor,
      'SET_MONTHLY_TARGET',
      'USER',
      userId,
      `Configured targets for ${targetUser.name} (${month}/${year}): Revenue ₹${revenueTarget}, Collection ₹${collectionTarget}`
    )

    return NextResponse.json({ target })
  } catch (err) {
    return jsonError(err)
  }
}

