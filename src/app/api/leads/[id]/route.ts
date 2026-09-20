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

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'CONSULTATION_SCHEDULED',
  'MEETING_DONE',
  'QUOTE_PREPARING',
  'QUOTE_SHARED',
  'FOLLOW_UP',
  'CONVERTED',
  'CLOSED_LOST',
] as const

async function fetchFullLead(id: string) {
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          city: true,
          pincode: true,
        },
      },
      assignedAdmin: { select: { id: true, name: true } },
      appointments: {
        orderBy: { scheduledAt: 'desc' },
        include: { admin: { select: { id: true, name: true } } },
      },
      quotations: {
        orderBy: { createdAt: 'desc' },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
      },
    },
  })
  if (!lead) return null

  return {
    id: lead.id,
    leadNumber: lead.leadNumber,
    status: lead.status,
    lostReason: lead.lostReason,
    source: lead.source,
    notes: lead.notes,
    appointmentDate: lead.appointmentDate,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    customer: lead.customer,
    assignedAdmin: lead.assignedAdmin,
    appointments: lead.appointments.map((a) => ({
      id: a.id,
      scheduledAt: a.scheduledAt,
      status: a.status,
      notes: a.notes,
      createdAt: a.createdAt,
      admin: a.admin ? { id: a.admin.id, name: a.admin.name } : null,
    })),
    quotations: lead.quotations.map((q) => {
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
    }),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser()
    const { id } = await params

    const existing = await db.lead.findUnique({ where: { id }, select: { assignedAdminId: true } })
    if (!existing) throw new ApiError(404, 'Lead not found')
    if (!isSuperAdmin(user) && existing.assignedAdminId !== user.id) {
      throw new ApiError(403, 'You do not have access to this lead')
    }

    const lead = await fetchFullLead(id)
    if (!lead) throw new ApiError(404, 'Lead not found')
    return Response.json({ lead })
  } catch (e) {
    return jsonError(e)
  }
}

interface UpdateLeadBody {
  status?: string
  lostReason?: string | null
  assignedAdminId?: string | null
  notes?: string | null
  appointmentDate?: string | null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser()
    const { id } = await params

    const lead = await db.lead.findUnique({
      where: { id },
      include: { customer: { select: { name: true } } },
    })
    if (!lead) throw new ApiError(404, 'Lead not found')
    if (!isSuperAdmin(user) && lead.assignedAdminId !== user.id) {
      throw new ApiError(403, 'You do not have access to this lead')
    }

    const body = await readJson<UpdateLeadBody>(request)

    const data: Prisma.LeadUncheckedUpdateInput = {}
    let newStatus: string | null = null
    let parsedAppointment: Date | null = null
    let appointmentProvided = false

    // Only SUPER_ADMIN may reassign leads
    if (body?.assignedAdminId !== undefined) {
      if (!isSuperAdmin(user)) {
        throw new ApiError(403, 'Only Super Admins can reassign leads')
      }
      if (body.assignedAdminId === null) {
        data.assignedAdminId = null
      } else {
        const target = await db.user.findUnique({ where: { id: body.assignedAdminId } })
        if (!target) throw new ApiError(400, 'Assigned admin not found')
        data.assignedAdminId = body.assignedAdminId
      }
    }

    if (body?.status !== undefined) {
      if (!LEAD_STATUSES.includes(body.status as (typeof LEAD_STATUSES)[number])) {
        throw new ApiError(400, 'Invalid lead status')
      }
      newStatus = body.status
      data.status = body.status
    }

    if (body?.lostReason !== undefined) {
      data.lostReason = body.lostReason?.trim() || null
    }

    if (newStatus === 'CLOSED_LOST') {
      const reason = (data.lostReason as string | null | undefined) ?? lead.lostReason
      if (!reason) throw new ApiError(400, 'A lost reason is required to close a lead as lost')
    }

    if (body?.notes !== undefined) {
      data.notes = body.notes?.trim() || null
    }

    if (body?.appointmentDate !== undefined) {
      appointmentProvided = true
      if (body.appointmentDate) {
        const parsed = parseFlexibleDate(body.appointmentDate)
        if (!parsed) throw new ApiError(400, 'Invalid appointmentDate')
        parsedAppointment = parsed
        data.appointmentDate = parsed
      } else {
        data.appointmentDate = null
      }
    }

    await db.lead.update({ where: { id }, data })

    // CONSULTATION_SCHEDULED + appointmentDate → upsert the Appointment for that date
    if (newStatus === 'CONSULTATION_SCHEDULED' && appointmentProvided && parsedAppointment) {
      const existingAppt = await db.appointment.findFirst({
        where: { leadId: id, scheduledAt: parsedAppointment },
      })
      if (existingAppt) {
        await db.appointment.update({
          where: { id: existingAppt.id },
          data: { status: 'SCHEDULED', adminId: user.id },
        })
      } else {
        await db.appointment.create({
          data: {
            leadId: id,
            adminId: user.id,
            scheduledAt: parsedAppointment,
            status: 'SCHEDULED',
            notes: 'Consultation scheduled',
          },
        })
      }
    }

    // Audits
    if (newStatus && newStatus !== lead.status) {
      await audit(
        user,
        'LEAD_STATUS_UPDATE',
        'LEAD',
        id,
        `${lead.status} → ${newStatus}`
      )
      if (newStatus === 'CONVERTED') {
        await audit(
          user,
          'LEAD_CONVERT',
          'LEAD',
          id,
          `Lead ${lead.leadNumber} (${lead.customer.name}) marked CONVERTED`
        )
      }
    }

    const fullLead = await fetchFullLead(id)
    if (!fullLead) throw new ApiError(404, 'Lead not found')
    return Response.json({ lead: fullLead })
  } catch (e) {
    return jsonError(e)
  }
}
