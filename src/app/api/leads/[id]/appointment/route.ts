import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ApiError, audit, isSuperAdmin, jsonError, requireUser } from '@/lib/auth'

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/** Parse 'YYYY-MM-DD' as server-local midnight; anything else via Date(). Returns null when invalid. */
function parseFlexibleDate(value: string): Date | null {
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (dayOnly) {
    return new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]))
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

interface ScheduleAppointmentBody {
  scheduledAt?: string
  notes?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser()
    const { id } = await params

    const lead = await db.lead.findUnique({
      where: { id },
      select: { id: true, leadNumber: true, assignedAdminId: true },
    })
    if (!lead) throw new ApiError(404, 'Lead not found')
    if (!isSuperAdmin(user) && lead.assignedAdminId !== user.id) {
      throw new ApiError(403, 'You do not have access to this lead')
    }

    const body = await readJson<ScheduleAppointmentBody>(request)
    if (!body?.scheduledAt) throw new ApiError(400, 'scheduledAt is required')
    const scheduledAt = parseFlexibleDate(body.scheduledAt)
    if (!scheduledAt) throw new ApiError(400, 'Invalid scheduledAt')

    const appointment = await db.appointment.create({
      data: {
        leadId: id,
        adminId: user.id,
        scheduledAt,
        status: 'SCHEDULED',
        notes: body.notes?.trim() || null,
      },
    })

    await db.lead.update({
      where: { id },
      data: { status: 'CONSULTATION_SCHEDULED', appointmentDate: scheduledAt },
    })

    await audit(
      user,
      'APPOINTMENT_CREATE',
      'APPOINTMENT',
      appointment.id,
      `Scheduled consultation for ${lead.leadNumber}`
    )

    return Response.json(
      {
        appointment: {
          ...appointment,
          lead: { id: lead.id, leadNumber: lead.leadNumber },
          admin: { id: user.id, name: user.name },
        },
      },
      { status: 201 }
    )
  } catch (e) {
    return jsonError(e)
  }
}
