import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { db } from '@/lib/db'
import { ApiError, audit, jsonError, requireUser } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/appointments/[id]/otp
 * Handle site visit OTP generation and customer verification.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser()
    const { id } = await context.params
    const body = await req.json()
    const { action, otp, visitNotes } = body

    const appointment = await db.appointment.findUnique({
      where: { id },
      include: {
        lead: { include: { customer: true } },
      },
    })
    if (!appointment) throw new ApiError(404, 'Appointment not found')

    if (action === 'generate') {
      const otpCode = String(randomInt(100000, 999999))
      const updated = await db.appointment.update({
        where: { id },
        data: {
          otpCode,
          otpVerified: false,
          checkInTime: new Date(),
        },
      })

      await audit(
        user,
        'GENERATE_VISIT_OTP',
        'APPOINTMENT',
        id,
        `Generated visit OTP for customer ${appointment.lead.customer.name}`
      )

      return NextResponse.json({
        message: 'OTP generated for site visit verification',
        customerPhone: appointment.lead.customer.phone,
        // In local/dev environments we return the otp for testing:
        devOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      })
    }

    if (action === 'verify') {
      if (!otp || String(otp).trim() !== appointment.otpCode) {
        throw new ApiError(400, 'Invalid or expired OTP. Please enter the correct 6-digit code.')
      }

      const updated = await db.appointment.update({
        where: { id },
        data: {
          otpVerified: true,
          otpVerifiedAt: new Date(),
          status: 'DONE',
          visitNotes: visitNotes?.trim() || appointment.notes,
        },
      })

      // Also advance lead status to MEETING_DONE if currently in consultation/scheduled
      if (['NEW', 'CONTACTED', 'CONSULTATION_SCHEDULED'].includes(appointment.lead.status)) {
        await db.lead.update({
          where: { id: appointment.leadId },
          data: { status: 'MEETING_DONE' },
        })
      }

      await audit(
        user,
        'VERIFY_VISIT_OTP',
        'APPOINTMENT',
        id,
        `Customer site visit verified with OTP for ${appointment.lead.customer.name}`
      )

      return NextResponse.json({
        success: true,
        message: 'Site visit verified successfully with OTP',
        appointment: updated,
      })
    }

    throw new ApiError(400, 'Invalid action. Supported: generate, verify')
  } catch (err) {
    return jsonError(err)
  }
}

