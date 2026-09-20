'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  StickyNote,
  XCircle,
} from 'lucide-react'

import { apiPatch, useApi } from '@/lib/client'
import { fmtDate, fmtTime } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { appointmentStatusMeta } from '@/lib/status'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Types (per GET /api/appointments contract)
// ---------------------------------------------------------------------------

interface AppointmentItem {
  id: string
  scheduledAt: string
  status: string
  notes: string | null
  createdAt: string
  lead: { id: string; leadNumber: string }
  customer: { name: string; phone: string; address: string | null; city: string | null }
  admin: { id: string; name: string } | null
}

interface AppointmentsResponse {
  appointments: AppointmentItem[]
  todayCount: number
}

type Scope = 'today' | 'upcoming' | 'all'

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'all', label: 'All' },
]

const EMPTY_MESSAGES: Record<Scope, string> = {
  today: 'No appointments today — a good day to chase follow-ups.',
  upcoming: 'No upcoming appointments. Schedule one from a lead.',
  all: 'No appointments found.',
}

export default function AppointmentsView() {
  const { navigate } = useNav()

  const [scope, setScope] = useState<Scope>('today')
  const [date, setDate] = useState('')
  const [cancelTarget, setCancelTarget] = useState<AppointmentItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const query = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set('scope', scope)
    if (scope === 'today' && date) qs.set('date', date)
    return qs.toString()
  }, [scope, date])

  const { data, error, loading, refresh } = useApi<AppointmentsResponse>(`/api/appointments?${query}`)

  const appointments = useMemo(() => data?.appointments ?? [], [data])
  const todayCount = data?.todayCount ?? 0

  async function updateStatus(appt: AppointmentItem, status: 'DONE' | 'CANCELLED') {
    if (busyId) return
    setBusyId(appt.id)
    try {
      await apiPatch(`/api/appointments/${appt.id}`, { status })
      toast.success(
        status === 'DONE'
          ? `Visit to ${appt.customer.name} marked done`
          : `Appointment with ${appt.customer.name} cancelled`
      )
      setCancelTarget(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update appointment')
    } finally {
      setBusyId(null)
    }
  }

  function openMaps(appt: AppointmentItem) {
    const queryStr = [appt.customer.address, appt.customer.city].filter(Boolean).join(', ')
    if (!queryStr) {
      toast.info('No address on file for this appointment.')
      return
    }
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`,
      '_blank',
      'noopener,noreferrer'
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Appointments
          </h1>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
            {todayCount} Today
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Site visits and consultations schedule.
        </p>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as Scope)}
        >
          <TabsList className="h-11 rounded-xl bg-muted p-1">
            {SCOPES.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="min-h-9 px-5">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {scope === 'today' && (
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 pl-9"
              aria-label="Pick a day"
            />
          </div>
        )}
        {(scope === 'today' && date) && (
          <Button
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            onClick={() => setDate('')}
          >
            Reset to today
          </Button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load appointments</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => refresh()} className="mt-2 min-h-11 gap-2 font-semibold">
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Loading skeletons */}
      {!error && loading && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      )}

      {/* List */}
      {!error && !loading && (
        <>
          <div className="space-y-4">
            {appointments.map((appt) => {
              const meta = appointmentStatusMeta[appt.status]
              const scheduled = appt.status === 'SCHEDULED'
              return (
                <Card key={appt.id} className="gap-0 rounded-2xl p-4 shadow-sm sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row">
                    {/* Date-time block */}
                    <div className="flex w-full shrink-0 flex-row items-center justify-center gap-2 rounded-xl bg-orange-50 px-4 py-3 sm:w-24 sm:flex-col sm:gap-0.5 sm:px-2 sm:py-4">
                      <span className="text-lg font-extrabold leading-tight text-primary">
                        {fmtTime(appt.scheduledAt)}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {fmtDate(appt.scheduledAt)}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">{appt.customer.name}</p>
                          <a
                            href={`tel:${appt.customer.phone}`}
                            className="mt-0.5 flex min-h-8 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                          >
                            <Phone className="size-3.5 shrink-0" />
                            {appt.customer.phone}
                          </a>
                        </div>
                        <Badge variant="outline" className={meta?.badge}>
                          {meta?.label ?? appt.status}
                        </Badge>
                      </div>

                      {(appt.customer.address || appt.customer.city) && (
                        <p className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          {[appt.customer.address, appt.customer.city].filter(Boolean).join(', ')}
                        </p>
                      )}

                      {appt.notes && (
                        <p className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
                          <StickyNote className="mt-0.5 size-3.5 shrink-0" />
                          {appt.notes}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => navigate('lead-detail', { id: appt.lead.id })}
                          className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        >
                          {appt.lead.leadNumber}
                        </button>
                        {appt.admin && (
                          <span className="text-[11px] text-muted-foreground">
                            Adviser: {appt.admin.name}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      {scheduled && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Button
                            variant="outline"
                            className="min-h-11 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                            disabled={busyId === appt.id}
                            onClick={() => updateStatus(appt, 'DONE')}
                          >
                            <CheckCircle2 className="size-4" />
                            Mark Done
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={busyId === appt.id}
                            onClick={() => setCancelTarget(appt)}
                          >
                            <XCircle className="size-4" />
                            Cancel
                          </Button>
                          <Button
                            variant="outline"
                            className="col-span-2 min-h-11 sm:col-span-1"
                            onClick={() => openMaps(appt)}
                          >
                            <Navigation className="size-4" />
                            Navigate
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {appointments.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-50 text-primary">
                <CalendarClock className="size-6" />
              </div>
              <p className="font-bold text-foreground">
                {scope === 'today' && date
                  ? `Nothing scheduled on ${fmtDate(date)}`
                  : EMPTY_MESSAGES[scope]}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {scope === 'today'
                  ? 'Appointments for the selected day appear here.'
                  : 'Appointments are created from leads — schedule one from a lead card or the lead detail page.'}
              </p>
            </div>
          )}

          {appointments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Showing {appointments.length} appointment{appointments.length === 1 ? '' : 's'}
              {scope === 'today' ? (date ? ` on ${fmtDate(date)}` : ' today') : scope === 'upcoming' ? ' upcoming' : ''}
            </p>
          )}
        </>
      )}

      {/* Cancel confirm */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `The ${fmtDate(cancelTarget.scheduledAt)} visit to ${cancelTarget.customer.name} (${cancelTarget.lead.leadNumber}) will be marked as cancelled.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">Keep</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-red-600 font-semibold text-white hover:bg-red-700"
              disabled={busyId === cancelTarget?.id}
              onClick={(e) => {
                e.preventDefault()
                if (cancelTarget) void updateStatus(cancelTarget, 'CANCELLED')
              }}
            >
              {busyId === cancelTarget?.id ? 'Cancelling…' : 'Cancel Appointment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
