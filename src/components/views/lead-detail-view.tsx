'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CalendarClock,
  FilePlus2,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  StickyNote,
  User,
} from 'lucide-react'

import { apiPatch, apiPost, useApi } from '@/lib/client'
import { fmtDate, fmtDateTime, formatINR, initialsOf } from '@/lib/format'
import { useNav } from '@/lib/nav'
import {
  appointmentStatusMeta,
  leadStatusLabels,
  leadStatusMeta,
  LEAD_STATUSES,
  lostReasonLabels,
  quoteStatusMeta,
  versionTypeLabels,
} from '@/lib/status'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types (per GET /api/leads/[id] contract)
// ---------------------------------------------------------------------------

interface LeadCustomer {
  id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string | null
  pincode: string | null
}

interface AppointmentItem {
  id: string
  scheduledAt: string
  status: string
  notes: string | null
  createdAt: string
  admin: { id: string; name: string } | null
}

interface VersionSummary {
  id: string
  versionNumber: number
  versionType: string
  status: string
  totalPayable: number
  createdAt: string
}

interface QuotationItem {
  id: string
  quotationNumber: string
  createdAt: string
  status: string
  totalPayable: number
  grossValue: number
  currentVersion: {
    id: string
    versionNumber: number
    versionType: string
    status: string
    totalArea: number
    grossValue: number
    totalPayable: number
    createdAt: string
  } | null
  versions: VersionSummary[]
}

interface LeadDetail {
  id: string
  leadNumber: string
  status: string
  lostReason: string | null
  source: string | null
  notes: string | null
  appointmentDate: string | null
  createdAt: string
  updatedAt: string
  customer: LeadCustomer
  assignedAdmin: { id: string; name: string } | null
  appointments: AppointmentItem[]
  quotations: QuotationItem[]
}

function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LeadDetailView() {
  const { params, navigate } = useNav()
  const id = params.id

  const { data, error, loading, refresh } = useApi<{ lead: LeadDetail }>(
    id ? `/api/leads/${id}` : null
  )
  const lead = data?.lead ?? null

  // Status changer dialog
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusValue, setStatusValue] = useState('')
  const [lostReason, setLostReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  // Reschedule dialog
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleAt, setRescheduleAt] = useState('')
  const [rescheduleSaving, setRescheduleSaving] = useState(false)

  // Schedule appointment dialog
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)

  useEffect(() => {
    if (lead) {
      setStatusValue(lead.status)
      setLostReason(lead.lostReason ?? '')
      setRescheduleAt(toLocalInputValue(lead.appointmentDate))
    }
  }, [lead])

  async function handleStatusChange() {
    if (!lead || statusSaving) return
    if (statusValue === 'CLOSED_LOST' && !lostReason) {
      toast.error('Select a lost reason to close this lead as lost.')
      return
    }
    setStatusSaving(true)
    try {
      await apiPatch(`/api/leads/${lead.id}`, {
        status: statusValue,
        ...(statusValue === 'CLOSED_LOST' ? { lostReason } : {}),
      })
      toast.success(`Status updated to ${leadStatusLabels[statusValue] ?? statusValue}`)
      setStatusOpen(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update status')
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleReschedule() {
    if (!lead || rescheduleSaving) return
    if (!rescheduleAt) {
      toast.error('Pick a new date and time.')
      return
    }
    setRescheduleSaving(true)
    try {
      await apiPost(`/api/leads/${lead.id}/appointment`, {
        scheduledAt: new Date(rescheduleAt).toISOString(),
        notes: 'Rescheduled consultation',
      })
      toast.success('Appointment rescheduled')
      setRescheduleOpen(false)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reschedule')
    } finally {
      setRescheduleSaving(false)
    }
  }

  async function handleSchedule() {
    if (!lead || scheduleSaving) return
    if (!scheduleAt) {
      toast.error('Pick a date and time.')
      return
    }
    setScheduleSaving(true)
    try {
      await apiPost(`/api/leads/${lead.id}/appointment`, {
        scheduledAt: new Date(scheduleAt).toISOString(),
        notes: scheduleNotes.trim() || undefined,
      })
      toast.success('Appointment scheduled')
      setScheduleOpen(false)
      setScheduleAt('')
      setScheduleNotes('')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not schedule appointment')
    } finally {
      setScheduleSaving(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  // Error state
  if (error || !lead) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load lead</p>
            <p className="text-sm text-muted-foreground">{error ?? 'Lead not found'}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => navigate('leads')}>
                <ArrowLeft className="size-4" />
                Back to Leads
              </Button>
              <Button onClick={() => refresh()} className="min-h-11 gap-2 font-semibold">
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  const meta = leadStatusMeta[lead.status]
  const subLabel =
    lead.status === 'CLOSED_LOST'
      ? lead.lostReason
        ? (lostReasonLabels[lead.lostReason] ?? lead.lostReason)
        : undefined
      : meta?.sub
  const isScheduled = lead.status === 'CONSULTATION_SCHEDULED'
  const address = [lead.customer.address, lead.customer.city, lead.customer.pincode]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Back */}
      <Button
        variant="ghost"
        className="-ml-2 min-h-11 gap-2 px-2 font-medium text-muted-foreground"
        onClick={() => navigate('leads')}
      >
        <ArrowLeft className="size-4" />
        Back to Leads
      </Button>

      {/* Header card */}
      <Card className="gap-0 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="size-14 border border-orange-100 bg-orange-50">
              <AvatarFallback className="bg-orange-50 text-xl font-bold text-primary">
                {initialsOf(lead.customer.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
                  {lead.customer.name}
                </h1>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {lead.leadNumber}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={meta?.badge}>
                  {meta?.label ?? lead.status}
                </Badge>
                {subLabel && (
                  <span className="text-xs font-medium text-muted-foreground">{subLabel}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setStatusOpen(true)}>
              Update Status
            </Button>
            {isScheduled && (
              <Button variant="outline" className="min-h-11" onClick={() => setRescheduleOpen(true)}>
                <CalendarClock className="size-4" />
                Reschedule
              </Button>
            )}
            <Button className="min-h-11 font-semibold" onClick={() => navigate('quotation-wizard', { leadId: lead.id })}>
              <FilePlus2 className="size-4" />
              New Quote
            </Button>
          </div>
        </div>

        {/* Contact grid */}
        <div className="mt-5 grid gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-2">
          <a
            href={`tel:${lead.customer.phone}`}
            className="flex min-h-9 items-center gap-2.5 transition-colors hover:text-primary"
          >
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{lead.customer.phone}</span>
          </a>
          <div className="flex min-h-9 items-center gap-2.5">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{lead.customer.email || 'No email added'}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{address || 'No address on file'}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              Created: <span className="font-medium">{fmtDate(lead.createdAt)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <User className="size-4 shrink-0 text-muted-foreground" />
            <span>
              Adviser: <span className="font-medium">{lead.assignedAdmin?.name ?? 'Unassigned'}</span>
            </span>
          </div>
          {lead.appointmentDate && (
            <div className="flex items-center gap-2.5">
              <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
              <span>
                Appointment: <span className="font-medium">{fmtDateTime(lead.appointmentDate)}</span>
              </span>
            </div>
          )}
        </div>

        {lead.notes && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-dashed bg-orange-50/40 p-3 text-sm">
            <StickyNote className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground">{lead.notes}</p>
            </div>
          </div>
        )}
      </Card>

      {/* Appointments + Quotations */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Appointments */}
        <Card className="gap-0 rounded-2xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-foreground">Appointments</h2>
              <p className="text-xs text-muted-foreground">Site visits and consultations</p>
            </div>
            <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="size-4" />
              Schedule
            </Button>
          </div>
          <div className="space-y-2">
            {lead.appointments.length === 0 && (
              <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                No appointments yet — schedule the first site visit.
              </p>
            )}
            {lead.appointments.map((appt) => {
              const apptMeta = appointmentStatusMeta[appt.status]
              return (
                <div
                  key={appt.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-muted p-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <CalendarClock className="size-4 shrink-0 text-primary" />
                      {fmtDateTime(appt.scheduledAt)}
                    </p>
                    {appt.notes && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{appt.notes}</p>
                    )}
                    {appt.admin && (
                      <p className="mt-0.5 text-xs text-muted-foreground">by {appt.admin.name}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={apptMeta?.badge}>
                    {apptMeta?.label ?? appt.status}
                  </Badge>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Quotations */}
        <Card className="gap-0 rounded-2xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-foreground">Quotations</h2>
              <p className="text-xs text-muted-foreground">Quotes prepared for this lead</p>
            </div>
            <Button
              variant="outline"
              className="min-h-11 shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => navigate('quotation-wizard', { leadId: lead.id })}
            >
              <FilePlus2 className="size-4" />
              New Quote
            </Button>
          </div>
          <div className="space-y-2">
            {lead.quotations.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
                <FileText className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  No quotations yet — start with a New Quote.
                </p>
              </div>
            )}
            {lead.quotations.map((q) => {
              const badge = quoteStatusMeta[q.status]?.badge ?? 'bg-stone-100 text-stone-700 border-stone-200'
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => navigate('quotation-detail', { id: q.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-sm font-bold text-foreground">
                        {q.quotationNumber}
                      </p>
                      {q.currentVersion && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-stone-600">
                          V{q.currentVersion.versionNumber}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {q.currentVersion
                        ? (versionTypeLabels[q.currentVersion.versionType] ??
                          q.currentVersion.versionType)
                        : 'No version'}{' '}
                      · Created {fmtDate(q.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={badge}>
                      {quoteStatusMeta[q.status]?.label ?? q.status}
                    </Badge>
                    <span className="text-sm font-bold text-primary">
                      {formatINR(q.totalPayable)}
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Status changer dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Update lead status</DialogTitle>
            <DialogDescription>
              {lead.customer.name} · {lead.leadNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => {
                  setStatusValue(v)
                  if (v !== 'CLOSED_LOST') setLostReason('')
                }}
              >
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {leadStatusLabels[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {statusValue === 'CLOSED_LOST' && (
              <div className="space-y-2">
                <Label>Lost reason</Label>
                <Select value={lostReason} onValueChange={setLostReason}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(lostReasonLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={statusSaving} onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11 font-semibold" disabled={statusSaving} onClick={handleStatusChange}>
              {statusSaving ? 'Saving…' : 'Save Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule appointment</DialogTitle>
            <DialogDescription>
              {lead.customer.name} · {lead.leadNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="detail-reschedule-at">New date &amp; time</Label>
            <Input
              id="detail-reschedule-at"
              type="datetime-local"
              value={rescheduleAt}
              onChange={(e) => setRescheduleAt(e.target.value)}
              className="h-11"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={rescheduleSaving} onClick={() => setRescheduleOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11 font-semibold" disabled={rescheduleSaving} onClick={handleReschedule}>
              {rescheduleSaving ? 'Saving…' : 'Reschedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule appointment dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule appointment</DialogTitle>
            <DialogDescription>
              {lead.customer.name} · {lead.leadNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="detail-schedule-at">Date &amp; time</Label>
              <Input
                id="detail-schedule-at"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="detail-schedule-notes">Notes</Label>
              <Textarea
                id="detail-schedule-notes"
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                placeholder="Purpose of visit, what to prepare…"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="min-h-11" disabled={scheduleSaving} onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button className="min-h-11 font-semibold" disabled={scheduleSaving} onClick={handleSchedule}>
              {scheduleSaving ? 'Scheduling…' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
