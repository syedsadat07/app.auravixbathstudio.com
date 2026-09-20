import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { ApiError, isSuperAdmin, jsonError, requireUser } from '@/lib/auth'

/** Parse 'YYYY-MM-DD' as server-local midnight; anything else via Date(). Returns null when invalid. */
function parseDayStart(value: string): Date | null {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dayOnly) {
    return new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser()

    const { searchParams } = new URL(request.url)
    const scope = searchParams.get('scope') ?? 'all'
    const dateParam = searchParams.get('date')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const now = new Date()

    // Base calendar day for todayCount (given date, or today)
    let baseDay: Date
    if (dateParam && dateParam !== 'today') {
      const parsed = parseDayStart(dateParam)
      if (!parsed) throw new ApiError(400, 'Invalid date. Use YYYY-MM-DD.')
      baseDay = parsed
    } else {
      baseDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }
    const dayStart = baseDay
    const dayEnd = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 1)

    const baseWhere: Prisma.AppointmentWhereInput = {}
    // Admins: only appointments of their own leads
    if (!isSuperAdmin(user)) {
      baseWhere.lead = { assignedAdminId: user.id }
    }

    const where: Prisma.AppointmentWhereInput = { ...baseWhere }
    let orderBy: Prisma.AppointmentOrderByWithRelationInput = { scheduledAt: 'desc' }

    if (scope === 'today') {
      where.scheduledAt = { gte: dayStart, lt: dayEnd }
      orderBy = { scheduledAt: 'asc' }
    } else if (scope === 'upcoming') {
      where.scheduledAt = { gte: now }
      orderBy = { scheduledAt: 'asc' }
    } else if (fromParam || toParam) {
      const range: Prisma.DateTimeFilter = {}
      if (fromParam) {
        const f = parseDayStart(fromParam)
        if (f) range.gte = f
      }
      if (toParam) {
        const t = parseDayStart(toParam)
        if (t) range.lt = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)
      }
      where.scheduledAt = range
      orderBy = { scheduledAt: 'asc' }
    }

    const [todayCount, appointments] = await Promise.all([
      db.appointment.count({
        where: { ...baseWhere, scheduledAt: { gte: dayStart, lt: dayEnd } },
      }),
      db.appointment.findMany({
        where,
        orderBy,
        take: 200,
        include: {
          lead: {
            select: {
              id: true,
              leadNumber: true,
              customer: { select: { name: true, phone: true, address: true, city: true } },
            },
          },
          admin: { select: { id: true, name: true } },
        },
      }),
    ])

    const mapped = appointments.map((a) => ({
      id: a.id,
      scheduledAt: a.scheduledAt,
      status: a.status,
      notes: a.notes,
      createdAt: a.createdAt,
      lead: { id: a.lead.id, leadNumber: a.lead.leadNumber },
      customer: a.lead.customer,
      admin: a.admin ? { id: a.admin.id, name: a.admin.name } : null,
    }))

    return Response.json({ appointments: mapped, todayCount })
  } catch (e) {
    return jsonError(e)
  }
}
