'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  BookUser,
  ChevronRight,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react'

import { useApi, useDebounced } from '@/lib/client'
import { formatINR, initialsOf } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { quoteStatusMeta } from '@/lib/status'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (per GET /api/customers contract)
// ---------------------------------------------------------------------------

interface LastQuote {
  quotationNumber: string
  totalPayable: number
  status: string
}

interface CustomerItem {
  id: string
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string | null
  pincode: string | null
  createdAt: string
  leadCount: number
  quoteCount: number
  lastQuote: LastQuote | null
}

const PAGE_SIZE = 10

export default function CustomersView() {
  const { navigate } = useNav()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)
  const [page, setPage] = useState(1)

  const query = useMemo(() => {
    const qs = new URLSearchParams()
    if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
    return qs.toString()
  }, [debouncedSearch])

  const { data, error, loading, refresh } = useApi<{ customers: CustomerItem[] }>(
    `/api/customers?${query}`
  )

  const customers = useMemo(() => data?.customers ?? [], [data])
  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const pageCustomers = customers.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const rangeStart = customers.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1
  const rangeEnd = Math.min(current * PAGE_SIZE, customers.length)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Customers
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Everyone you have created a lead or quote for, in one place.
        </p>
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
          placeholder="Search by name, phone or email..."
          className="h-11 pl-10"
          aria-label="Search customers"
        />
      </div>

      {/* Error state */}
      {error && (
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load customers</p>
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
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Cards grid */}
      {!error && !loading && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {pageCustomers.map((c) => {
              const lastQuoteMeta = c.lastQuote
                ? (quoteStatusMeta[c.lastQuote.status]?.badge ??
                  'bg-stone-100 text-stone-700 border-stone-200')
                : undefined
              return (
                <Card key={c.id} className="gap-0 overflow-hidden rounded-2xl p-0 shadow-sm">
                  <button
                    type="button"
                    onClick={() => navigate('customer-detail', { id: c.id })}
                    className="w-full p-4 text-left transition-colors hover:bg-muted/40 sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-base font-bold text-primary">
                          {initialsOf(c.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-bold text-foreground">{c.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {c.leadCount} Lead{c.leadCount === 1 ? '' : 's'}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              {c.quoteCount} Quote{c.quoteCount === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>

                    <div className="mt-3 space-y-1.5 text-sm">
                      <div className="flex min-h-8 items-center gap-2.5 text-foreground">
                        <Phone className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{c.phone}</span>
                      </div>
                      {c.email && (
                        <div className="flex min-h-8 items-center gap-2.5">
                          <Mail className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-muted-foreground">{c.email}</span>
                        </div>
                      )}
                      {(c.address || c.city) && (
                        <div className="flex items-start gap-2.5">
                          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate text-muted-foreground">
                            {[c.address, c.city, c.pincode].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    {c.lastQuote && (
                      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-muted p-3">
                        <FileText className="size-4 shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-xs font-bold text-foreground">
                            {c.lastQuote.quotationNumber}
                          </p>
                          <p className="text-xs text-muted-foreground">Last quote</p>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-primary">
                          {formatINR(c.lastQuote.totalPayable)}
                        </span>
                        <Badge variant="outline" className={lastQuoteMeta}>
                          {quoteStatusMeta[c.lastQuote.status]?.label ?? c.lastQuote.status}
                        </Badge>
                      </div>
                    )}
                  </button>
                </Card>
              )
            })}
          </div>

          {customers.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-50 text-primary">
                <BookUser className="size-6" />
              </div>
              <p className="font-bold text-foreground">No customers found</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Customers appear here once you create leads or quotations for them.
              </p>
            </div>
          )}

          {customers.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {customers.length}
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
    </div>
  )
}
