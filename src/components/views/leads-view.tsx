'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CalendarClock,
  Eye,
  FilePlus2,
  Mail,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User,
  Users,
  XCircle,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiPatch, apiPost, useApi, useDebounced } from '@/lib/client'
import { fmtDate, fmtDateTime, initialsOf } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { leadStatusMeta, lostReasonLabels } from '@/lib/status'
import { cn } from '@/lib/utils'

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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types (per /api/leads contract)
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

interface LeadActiveQuote {
  id: string
  quotationNumber: string
  versionNumber: number
  status: string
  totalPayable: number
  grossValue: number
}

interface Lead {
  id: string
  leadNumber: string
  status: string
  lostReason: string | null
  notes: string | null
  appointmentDate: string | null
  createdAt: string
  customer: LeadCustomer
  assignedAdmin: { id: string; name: string } | null
  activeQuote: LeadActiveQuote | null
}

interface LeadsResponse {
  total: number
  leads: Lead[]
}

interface UserOption {
  id: string
  name: string
}

type LeadTab = 'scheduled' | 'done' | 'all' | 'closed_lost'

const PAGE_SIZE = 10

const TABS: { value: LeadTab; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'done', label: 'Done' },
  { value: 'all', label: 'All' },
  { value: 'closed_lost', label: 'Closed Lost' },
]

const EMPTY_MESSAGES: Record<LeadTab, { title: string; body: string }> = {
  scheduled: {
    title: 'No scheduled consultations',
    body: 'Leads with a fixed appointment show up here. Create a lead with an appointment date or reschedule an existing one.',
  },
  done: {
    title: 'No completed meetings',
    body: 'Once a site visit is marked done, the lead moves into this list.',
  },
  all: {
    title: 'No leads found',
    body: 'Try a different search or clear the filters — or create your first lead.',
  },
  closed_lost: {
    title: 'No closed-lost leads',
    body: 'Leads marked as lost, along with their reason, appear here.',
  },
}

function mapsUrl(parts: (string | null | undefined)[]): string {
  const query = parts.filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** ISO string → value for <input type="datetime-local"> in the browser's local time. */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// LeadCard
// ---------------------------------------------------------------------------

interface LeadCardProps {
  lead: Lead
  tab: LeadTab
  onEditEmail: (lead: Lead) => void
  onReschedule: (lead: Lead) => void
  onLost: (lead: Lead) => void
}

function LeadCard({ lead, tab, onEditEmail, onReschedule, onLost }: LeadCardProps) {
  const { navigate } = useNav()
  const activeQuote = lead.activeQuote
  const meta = leadStatusMeta[lead.status]
  const subLabel =
    lead.status === 'CLOSED_LOST'
      ? lead.lostReason
        ? (lostReasonLabels[lead.lostReason] ?? lead.lostReason)
        : undefined
      : meta?.sub
  const address = [lead.customer.address, lead.customer.city, lead.customer.pincode]
    .filter(Boolean)
    .join(', ')

  return (
    <Card
      className={cn(
        'gap-0 rounded-2xl p-4 shadow-sm sm:p-5',
        tab === 'scheduled' && 'border-l-4 border-l-primary'
      )}
    >
      {/* Header: avatar + name + lead number + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-base font-bold text-primary">
            {initialsOf(lead.customer.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-foreground">{lead.customer.name}</p>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                {lead.leadNumber}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{lead.customer.phone}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant="outline" className={meta?.badge}>
            {meta?.label ?? lead.status}
          </Badge>
          {subLabel && <p className="text-[11px] font-medium text-muted-foreground">{subLabel}</p>}
        </div>
      </div>

      {/* Contact rows */}
      <div className="mt-3 space-y-1.5 text-sm">
        <a
          href={`tel:${lead.customer.phone}`}
          className="flex min-h-9 items-center gap-2.5 text-foreground transition-colors hover:text-primary"
        >
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{lead.customer.phone}</span>
        </a>
        <div className="flex min-h-9 items-center gap-2.5">
          <Mail className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-foreground" title={lead.customer.email ?? undefined}>
            {lead.customer.email || 'No email added'}
          </span>
          <button
            type="button"
            onClick={() => onEditEmail(lead)}
            aria-label={`Edit email for ${lead.customer.name}`}
            className="ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Address + dates panel */}
      <div className="mt-3 space-y-2 rounded-xl bg-muted p-3 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-foreground">{address || 'No address on file'}</span>
        </div>
        <div className="flex items-start gap-2.5">
          <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-foreground">
            {lead.appointmentDate ? fmtDateTime(lead.appointmentDate) : 'No appointment scheduled'}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Created: <span className="font-medium text-foreground">{fmtDate(lead.createdAt)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Adviser:{' '}
            <span className="font-medium text-foreground">
              {lead.assignedAdmin?.name ?? 'Unassigned'}
            </span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {activeQuote && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => navigate('quotation-detail', { id: activeQuote.id })}
          >
            <Eye className="size-4" />
            View Quote
          </Button>
        )}
        <Button
          variant="outline"
          className="min-h-11 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          onClick={() => navigate('quotation-wizard', { leadId: lead.id })}
        >
          <FilePlus2 className="size-4" />
          New Quote
        </Button>
        {lead.status === 'CONSULTATION_SCHEDULED' && (
          <>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => {
                const query = [lead.customer.address, lead.customer.city, lead.customer.pincode]
                  .filter(Boolean)
                  .join(', ')
                if (!query) {
                  toast.info('No address on file for this lead.')
                  return
                }
                window.open(mapsUrl([query]), '_blank', 'noopener,noreferrer')
              }}
            >
              <Navigation className="size-4" />
              Navigate
            </Button>
            <Button variant="outline" className="min-h-11" onClick={() => onReschedule(lead)}>
              <Calendar className="size-4" />
              Reschedule
            </Button>
            <Button
              variant="outline"
              className="min-h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onLost(lead)}
            >
              <XCircle className="size-4" />
              Lost Prospect
            </Button>
          </>
        )}
      </div>
      <Button
        className="mt-2 min-h-11 w-full font-semibold"
        onClick={() => navigate('lead-detail', { id: lead.id })}
      >
        {lead.status === 'CLOSED_LOST' ? 'View Details' : 'Start Consultation'}
        <ArrowRight className="size-4" />
      </Button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// LeadsView
// ---------------------------------------------------------------------------

export default function LeadsView() {
  const { isSuperAdmin } = useAuth()
  const { navigate } = useNav()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [tab, setTab] = useState<LeadTab>('scheduled')
  const [adviserId, setAdviserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)

  // Dialog state
  const [newOpen, setNewOpen] = useState(false)
  const [emailLead, setEmailLead] = useState<Lead | null>(null)
  const [rescheduleLead, setRescheduleLead] = useState<Lead | null>(null)
  const [lostLead, setLostLead] = useState<Lead | null>(null)

  const query = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set('tab', tab)
    if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
    if (isSuperAdmin && adviserId) qs.set('adviserId', adviserId)
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    return qs.toString()
  }, [tab, debouncedSearch, isSuperAdmin, adviserId, from, to])

  const { data, error, loading, refresh } = useApi<LeadsResponse>(`/api/leads?${query}`)
  const { data: usersData } = useApi<{ users: UserOption[] }>(
    isSuperAdmin ? '/api/users' : null,
    [isSuperAdmin]
  )

  const leads = useMemo(() => data?.leads ?? [], [data])
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const pageLeads = leads.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const rangeStart = leads.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(current * PAGE_SIZE, leads.length)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
              My Leads
            </h1>
            <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
              {total} Total
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Manage your assigned site visits and potential customers.
          </p>
        </div>
        <Button className="min-h-11 font-semibold" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" />
          New Lead
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          placeholder="Search by Name, Mobile or Lead ID..."
          className="h-11 pl-10"
          aria-label="Search leads"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => { setTab(v as LeadTab); setPage(1) }}>
        <TabsList className="h-11 w-full justify-start overflow-x-auto rounded-xl bg-muted p-1 sm:w-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-9 flex-1 px-4 sm:flex-none sm:px-5">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <Button
          variant="outline"
          className="min-h-11 flex-1"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-4" />
          {filtersOpen ? 'Hide Filters' : 'Filters'}
        </Button>
        {(adviserId || from || to) && (
          <Button
            variant="ghost"
            className="min-h-11 text-muted-foreground"
            onClick={() => {
              setAdviserId('')
              setFrom('')
              setTo('')
              setPage(1)
            }}
          >
            Clear
          </Button>
        )}
      </div>
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2 lg:grid-cols-4',
          filtersOpen ? 'grid' : 'hidden md:grid'
        )}
      >
        {isSuperAdmin && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Adviser</Label>
            <Select
              value={adviserId || 'all'}
              onValueChange={(v) => {
                setAdviserId(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="All advisers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All advisers</SelectItem>
                {(usersData?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">From date</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">To date</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
            className="h-11"
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load leads</p>
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
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      )}

      {/* List */}
      {!error && !loading && (
        <>
          <div className="space-y-4">
            {pageLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                tab={tab}
                onEditEmail={(l) => setEmailLead(l)}
                onReschedule={(l) => setRescheduleLead(l)}
                onLost={(l) => setLostLead(l)}
              />
            ))}
          </div>

          {leads.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-50 text-primary">
                <Users className="size-6" />
              </div>
              <p className="font-bold text-foreground">{EMPTY_MESSAGES[tab].title}</p>
              <p className="max-w-sm text-sm text-muted-foreground">{EMPTY_MESSAGES[tab].body}</p>
              <Button className="mt-1 min-h-11 font-semibold" onClick={() => setNewOpen(true)}>
                <Plus className="size-4" />
                New Lead
              </Button>
            </div>
          )}

          {leads.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 md:min-h-9"
                  disabled={current <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 md:min-h-9"
                  disabled={current >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next ›
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New lead dialog */}
      <NewLeadDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={async (lead) => {
          setNewOpen(false)
          toast.success(`Lead ${lead.leadNumber} created`)
          await refresh()
          navigate('lead-detail', { id: lead.id })
        }}
      />

      {/* Edit email dialog */}
      <EditEmailDialog
        lead={emailLead}
        onClose={() => setEmailLead(null)}
        onSaved={async () => {
          setEmailLead(null)
          toast.success('Email updated')
          await refresh()
        }}
      />

      {/* Reschedule dialog */}
      <RescheduleDialog
        lead={rescheduleLead}
        onClose={() => setRescheduleLead(null)}
        onSaved={async () => {
          setRescheduleLead(null)
          toast.success('Appointment rescheduled')
          await refresh()
        }}
      />

      {/* Lost prospect dialog */}
      <LostDialog
        lead={lostLead}
        onClose={() => setLostLead(null)}
        onSaved={async () => {
          setLostLead(null)
          toast.success('Lead closed as lost')
          await refresh()
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// New lead dialog
// ---------------------------------------------------------------------------

interface CreatedLead {
  id: string
  leadNumber: string
}

function NewLeadDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (lead: CreatedLead) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [pincode, setPincode] = useState('')
  const [appointmentAt, setAppointmentAt] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setCity('')
    setPincode('')
    setAppointmentAt('')
    setNotes('')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    if (!name.trim() || !phone.trim()) {
      toast.error('Name and mobile number are required.')
      return
    }
    setSubmitting(true)
    try {
      const res = await apiPost<{ lead: CreatedLead }>('/api/leads', {
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          pincode: pincode.trim() || undefined,
        },
        appointmentDate: appointmentAt ? new Date(appointmentAt).toISOString() : null,
        notes: notes.trim() || undefined,
      })
      reset()
      await onCreated(res.lead)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create lead')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!submitting) onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
          <DialogDescription>
            Add a potential customer. An appointment can be scheduled right away.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Name *</Label>
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer name"
                className="h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-phone">Mobile *</Label>
              <Input
                id="lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                className="h-11"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@email.com"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-address">Address</Label>
            <Input
              id="lead-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House / street / area"
              className="h-11"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-city">City</Label>
              <Input
                id="lead-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-pincode">Pincode</Label>
              <Input
                id="lead-pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="Pincode"
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-appointment">Appointment date &amp; time (optional)</Label>
            <Input
              id="lead-appointment"
              type="datetime-local"
              value={appointmentAt}
              onChange={(e) => setAppointmentAt(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Requirements, preferences, follow-ups…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="min-h-11 font-semibold" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit email dialog
// ---------------------------------------------------------------------------

function EditEmailDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (lead) setValue(lead.customer.email ?? '')
  }, [lead])

  async function handleSave() {
    if (!lead || submitting) return
    setSubmitting(true)
    try {
      await apiPatch(`/api/customers/${lead.customer.id}`, { email: value.trim() || null })
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={!!lead}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit email</DialogTitle>
          <DialogDescription>
            Update the email address for {lead?.customer.name ?? 'this customer'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="edit-email">Email</Label>
          <Input
            id="edit-email"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="customer@email.com"
            className="h-11"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11 font-semibold" disabled={submitting} onClick={handleSave}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Reschedule dialog
// ---------------------------------------------------------------------------

function RescheduleDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (lead) setValue(toLocalInputValue(lead.appointmentDate))
  }, [lead])

  async function handleSave() {
    if (!lead || submitting) return
    if (!value) {
      toast.error('Pick a new date and time.')
      return
    }
    setSubmitting(true)
    try {
      await apiPost(`/api/leads/${lead.id}/appointment`, {
        scheduledAt: new Date(value).toISOString(),
        notes: 'Rescheduled consultation',
      })
      setValue('')
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reschedule')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={!!lead}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {lead ? `${lead.customer.name} · ${lead.leadNumber}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reschedule-at">New date &amp; time</Label>
          <Input
            id="reschedule-at"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-11"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button className="min-h-11 font-semibold" disabled={submitting} onClick={handleSave}>
            {submitting ? 'Saving…' : 'Reschedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Lost prospect dialog
// ---------------------------------------------------------------------------

function LostDialog({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    if (!lead || submitting) return
    if (!reason) {
      toast.error('Select a lost reason.')
      return
    }
    setSubmitting(true)
    try {
      await apiPatch(`/api/leads/${lead.id}`, { status: 'CLOSED_LOST', lostReason: reason })
      setReason('')
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not close lead')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={!!lead}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark as lost prospect</DialogTitle>
          <DialogDescription>
            {lead
              ? `${lead.customer.name} · ${lead.leadNumber} — this closes the lead.`
              : 'This closes the lead.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Lost reason</Label>
          <Select value={reason} onValueChange={setReason}>
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
        <DialogFooter>
          <Button variant="outline" className="min-h-11" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="min-h-11 font-semibold"
            disabled={submitting}
            onClick={handleSave}
          >
            {submitting ? 'Closing…' : 'Close as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
