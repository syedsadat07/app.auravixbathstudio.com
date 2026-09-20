import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
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

const APPOINTMENT_STATUSES = ['SCHEDULED', 'DONE', 'CANCELLED'] as const

interface UpdateAppointmentBody {
  status?: string
  notes?: string | null
  scheduledAt?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser()
    const { id } = await params

    const appt = await db.appointment.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, leadNumber: true, status: true, assignedAdminId: true } },
      },
    })
    if (!appt) throw new ApiError(404, 'Appointment not found')
    if (!isSuperAdmin(user) && appt.lead.assignedAdminId !== user.id) {
      throw new ApiError(403, 'You do not have access to this appointment')
    }

    const body = await readJson<UpdateAppointmentBody>(request)

    const data: Prisma.AppointmentUncheckedUpdateInput = {}

    if (body?.status !== undefined) {
      if (!APPOINTMENT_STATUSES.includes(body.status as (typeof APPOINTMENT_STATUSES)[number])) {
        throw new ApiError(400, 'Status must be SCHEDULED, DONE or CANCELLED')
      }
      data.status = body.status
    }
    if (body?.notes !== undefined) {
      data.notes = body.notes?.trim() || null
    }
    if (body?.scheduledAt !== undefined) {
      if (!body.scheduledAt) throw new ApiError(400, 'scheduledAt cannot be empty')
      const parsed = parseFlexibleDate(body.scheduledAt)
      if (!parsed) throw new ApiError(400, 'Invalid scheduledAt')
      data.scheduledAt = parsed
    }

    // DONE → advance the lead to MEETING_DONE (only from an earlier stage)
    if (
      body?.status === 'DONE' &&
      ['NEW', 'CONTACTED', 'CONSULTATION_SCHEDULED'].includes(appt.lead.status)
    ) {
      await db.lead.update({
        where: { id: appt.lead.id },
        data: { status: 'MEETING_DONE' },
      })
    }

    await audit(
      user,
      'APPOINTMENT_UPDATE',
      'APPOINTMENT',
      id,
      `Appointment for ${appt.lead.leadNumber}${body?.status ? ` → ${body.status}` : ' updated'}`
    )

    // Re-fetch so the response reflects the post-update lead status too
    const appointment = await db.appointment.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            leadNumber: true,
            status: true,
            customer: { select: { name: true, phone: true, address: true, city: true } },
          },
        },
        admin: { select: { id: true, name: true } },
      },
    })

    return Response.json({ appointment })
  } catch (e) {
    return jsonError(e)
  }
}
