'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, ChevronDown, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useApi, useDebounced } from '@/lib/client'
import { fmtDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (per /api/audit-logs contract) — Super Admin only
// ---------------------------------------------------------------------------

interface AuditLog {
  id: string
  userName: string
  userRole: string
  action: string
  entity: string | null
  entityId: string | null
  details: string | null
  createdAt: string
}

const PAGE_SIZE = 50

/** Timeline dot color by action group. */
function dotColor(action: string): string {
  const a = action.toUpperCase()
  if (a.includes('PRICE') || a.includes('PACKAGE')) return 'bg-[#f2620f]'
  if (a.includes('ADMIN')) return 'bg-[#232327]'
  if (a.includes('QUOTE')) return 'bg-violet-500'
  if (a.includes('LEAD') || a.includes('APPOINTMENT')) return 'bg-green-500'
  if (a.includes('LOGIN')) return 'bg-stone-300'
  return 'bg-stone-400'
}

// ---------------------------------------------------------------------------
// AuditLogsView
// ---------------------------------------------------------------------------

export default function AuditLogsView() {
  const { isSuperAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const q = useDebounced(search, 350)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, loading, error, refresh } = useApi<{ logs: AuditLog[] }>(
    `/api/audit-logs?search=${encodeURIComponent(q)}&limit=${limit}`
  )
  const logs = data?.logs ?? []
  const hasMore = logs.length >= limit

  if (!isSuperAdmin) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Access denied</p>
            <p className="text-sm text-muted-foreground">
              Only Super Admins can view audit logs.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // Loading skeleton (full-page only on first load; load-more keeps the list visible)
  if (loading && logs.length === 0) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36 md:h-9 md:w-44" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11" />
        <Card className="gap-0 rounded-2xl p-5">
          <div className="space-y-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-4 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Error state (only when nothing is rendered yet)
  if (error && logs.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load audit logs</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => refresh()} className="mt-2 min-h-11 gap-2 font-semibold">
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Audit Logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Every sensitive action across the system.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user, action or details..."
          aria-label="Search audit logs"
          className="h-11 pl-9"
        />
      </div>

      {/* Logs */}
      {logs.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-orange-50">
              <ShieldCheck className="size-6 text-primary" />
            </div>
            <p className="font-bold text-foreground">No activity yet</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'No logs match your search.' : 'Sensitive actions will appear here as they happen.'}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="gap-0 rounded-2xl p-5">
          <div className="relative">
            {/* timeline line */}
            <div
              className="absolute bottom-3 left-[7px] top-3 w-px bg-border"
              aria-hidden="true"
            />
            <div className="space-y-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="relative flex flex-col gap-1 rounded-xl py-3 pl-7 pr-1 transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <span
                    className={cn(
                      'absolute left-0 top-[17px] size-[15px] rounded-full border-2 border-background shadow-sm',
                      dotColor(log.action)
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] tracking-tight"
                      >
                        {log.action}
                      </Badge>
                      {log.entity && (
                        <Badge variant="secondary" className="text-[10px]">
                          {log.entity}
                        </Badge>
                      )}
                    </div>
                    {log.details && (
                      <p className="mt-1 text-sm font-medium leading-snug text-foreground">
                        {log.details}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-sm font-bold text-foreground">{log.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.userRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'} ·{' '}
                      {fmtDateTime(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center border-t pt-4">
              <Button
                variant="outline"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                className="min-h-11 gap-2 font-semibold"
              >
                <ChevronDown className="size-4" />
                Load more
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Auto toast hint on query failures while paging */}
      {loading && logs.length > 0 && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading activity…
        </p>
      )}
    </div>
  )
}
