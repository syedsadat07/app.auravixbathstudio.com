'use client'

import { useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react'

import { useApi } from '@/lib/client'
import { fmtDate, formatINR, initialsOf } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { leadStatusMeta, quoteStatusMeta, versionTypeLabels } from '@/lib/status'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (per GET /api/customers/[id] contract)
// ---------------------------------------------------------------------------

interface CustomerRecord {
  id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string | null
  pincode: string | null
  createdAt: string
}

interface CustomerLead {
  id: string
  leadNumber: string
  status: string
  lostReason: string | null
  source: string | null
  notes: string | null
  appointmentDate: string | null
  createdAt: string
  assignedAdmin: { id: string; name: string } | null
}

interface CustomerQuotation {
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
  versions: {
    id: string
    versionNumber: number
    versionType: string
    status: string
    totalPayable: number
    createdAt: string
  }[]
}

interface CustomerDetailResponse {
  customer: CustomerRecord
  leads: CustomerLead[]
  quotations: CustomerQuotation[]
}

export default function CustomerDetailView() {
  const { params, navigate } = useNav()
  const id = params.id

  const { data, error, loading, refresh } = useApi<CustomerDetailResponse>(
    id ? `/api/customers/${id}` : null
  )

  const [leadSearch, setLeadSearch] = useState('')

  const customer = data?.customer ?? null
  const leads = data?.leads ?? []
  const quotations = data?.quotations ?? []

  const filteredLeads = leadSearch.trim()
    ? leads.filter(
        (l) =>
          l.leadNumber.toLowerCase().includes(leadSearch.trim().toLowerCase()) ||
          (l.status ?? '').toLowerCase().includes(leadSearch.trim().toLowerCase())
      )
    : leads

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-44 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  // Error state
  if (error || !customer) {
    return (
      <div className="mx-auto max-w-6xl p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load customer</p>
            <p className="text-sm text-muted-foreground">{error ?? 'Customer not found'}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => navigate('customers')}>
                <ArrowLeft className="size-4" />
                Back to Customers
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

  const address = [customer.address, customer.city, customer.pincode].filter(Boolean).join(', ')

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Back */}
      <Button
        variant="ghost"
        className="-ml-2 min-h-11 gap-2 px-2 font-medium text-muted-foreground"
        onClick={() => navigate('customers')}
      >
        <ArrowLeft className="size-4" />
        Back to Customers
      </Button>

      {/* Contact card */}
      <Card className="gap-0 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14 border border-orange-100">
            <AvatarFallback className="bg-orange-50 text-xl font-bold text-primary">
              {initialsOf(customer.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground md:text-2xl">
              {customer.name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Customer since {fmtDate(customer.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-xl bg-muted p-4 text-sm sm:grid-cols-2">
          <a
            href={`tel:${customer.phone}`}
            className="flex min-h-9 items-center gap-2.5 transition-colors hover:text-primary"
          >
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{customer.phone}</span>
          </a>
          <div className="flex min-h-9 items-center gap-2.5">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{customer.email || 'No email added'}</span>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>{address || 'No address on file'}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span>
              {leads.length} lead{leads.length === 1 ? '' : 's'} · {quotations.length} quote
              {quotations.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </Card>

      {/* Leads + Quotations */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leads */}
        <Card className="gap-0 rounded-2xl p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-foreground">Leads</h2>
              <p className="text-xs text-muted-foreground">All leads linked to this customer</p>
            </div>
          </div>
          {leads.length > 3 && (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Filter by lead ID or status..."
                className="h-10 pl-9 text-sm"
                aria-label="Filter leads"
              />
            </div>
          )}
          <div className="space-y-2">
            {filteredLeads.length === 0 && (
              <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                {leads.length === 0 ? 'No leads for this customer yet.' : 'No matching leads.'}
              </p>
            )}
            {filteredLeads.map((lead) => {
              const meta = leadStatusMeta[lead.status]
              const sub =
                lead.status === 'CLOSED_LOST' && lead.lostReason
                  ? undefined
                  : meta?.sub
              return (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-foreground">{lead.leadNumber}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Created {fmtDate(lead.createdAt)}
                      {lead.assignedAdmin ? ` · ${lead.assignedAdmin.name}` : ''}
                      {sub ? ` · ${sub}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={meta?.badge}>
                      {meta?.label ?? lead.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 gap-1 md:min-h-8"
                      onClick={() => navigate('lead-detail', { id: lead.id })}
                    >
                      View
                      <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Quotations */}
        <Card className="gap-0 rounded-2xl p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="font-bold text-foreground">Quotations</h2>
            <p className="text-xs text-muted-foreground">Quotes prepared for this customer</p>
          </div>
          <div className="space-y-2">
            {quotations.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
                <FileText className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">No quotations for this customer yet.</p>
              </div>
            )}
            {quotations.map((q) => {
              const badge =
                quoteStatusMeta[q.status]?.badge ?? 'bg-stone-100 text-stone-700 border-stone-200'
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
    </div>
  )
}
