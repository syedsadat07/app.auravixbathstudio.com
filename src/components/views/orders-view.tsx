'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Bath,
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileBadge,
  FileCheck,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Snowflake,
  User,
  type LucideIcon,
} from 'lucide-react'

import { apiPatch, useApi, useDebounced } from '@/lib/client'
import { fmtDate, formatINR, initialsOf } from '@/lib/format'
import { useNav } from '@/lib/nav'
import { quoteStatusMeta, versionTypeLabels } from '@/lib/status'
import { cn } from '@/lib/utils'

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (per GET /api/orders contract)
// ---------------------------------------------------------------------------

interface OrderCustomer {
  name: string
  phone: string
  email: string | null
  address: string | null
  city: string | null
}

interface OrderQuoteStatusFlags {
  quotePublished: boolean
  tcAccepted: boolean
  paymentReceived: boolean
  orderFreeze: boolean
}

interface OrderQuote {
  id: string
  quotationNumber: string
  versionNumber: number
  versionType: string
  status: string
  totalPayable: number
  grossValue: number
  publishedAt: string
  bathroomCount: number
  statusFlags: OrderQuoteStatusFlags
}

interface OrderItem {
  leadId: string
  leadNumber: string
  leadStatus: string
  panAdded?: boolean
  customer: OrderCustomer
  createdAt: string
  adviserName: string | null
  quote: OrderQuote
  otherVersionsCount: number
}

interface OrdersResponse {
  total: number
  orders: OrderItem[]
}

// ---------------------------------------------------------------------------
// Quote status pipeline chip
// ---------------------------------------------------------------------------

interface StageChip {
  label: string
  icon: LucideIcon
  done: boolean
  action: (() => void) | null
}

function StagePill({
  stage,
  disabled,
}: {
  stage: StageChip
  disabled?: boolean
}) {
  const Icon = stage.icon
  const isDone = stage.done
  const isActionable = !!stage.action && !disabled
  return (
    <Button
      type="button"
      disabled={!isActionable}
      onClick={stage.action ?? undefined}
      className={cn(
        'min-h-11 gap-1.5 rounded-full border px-4 text-xs font-semibold md:min-h-9',
        isDone && 'border-green-600 bg-green-600 text-white hover:bg-green-600',
        isActionable &&
          'border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        !isDone && !isActionable && 'border-border bg-background text-muted-foreground'
      )}
    >
      <Icon className="size-3.5" />
      {stage.label}
      {isDone && <CheckCircle2 className="size-3.5" />}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Order card
// ---------------------------------------------------------------------------

function OrderCard({
  order,
  onStatusChange,
}: {
  order: OrderItem
  onStatusChange: (quoteId: string, status: string, successMessage: string) => Promise<void>
}) {
  const { navigate } = useNav()
  const quote = order.quote
  const flags = quote.statusFlags
  const qMeta = quoteStatusMeta[quote.status]

  const [confirmAction, setConfirmAction] = useState<{ status: string; label: string } | null>(null)
  const [saving, setSaving] = useState(false)

  function advance(status: string, successMessage: string) {
    void onStatusChange(quote.id, status, successMessage).catch(() => undefined)
  }

  const stages: StageChip[] = [
    {
      label: 'Quote Published',
      icon: CheckCircle2,
      done: flags.quotePublished && quote.status !== 'PUBLISHED' && quote.status !== 'QUOTE_SHARED',
      action:
        quote.status === 'PUBLISHED'
          ? () => advance('QUOTE_SHARED', 'Quote marked as shared with the customer')
          : null,
    },
    {
      label: 'T&C Accepted',
      icon: FileCheck,
      done: flags.tcAccepted,
      action:
        quote.status === 'PUBLISHED' || quote.status === 'QUOTE_SHARED'
          ? () => advance('TC_ACCEPTED', 'T&C accepted recorded')
          : null,
    },
    {
      label: 'Payment Received',
      icon: Banknote,
      done: flags.paymentReceived,
      action:
        quote.status === 'TC_ACCEPTED' || quote.status === 'PAYMENT_PENDING'
          ? () => setConfirmAction({ status: 'PAYMENT_RECEIVED', label: 'Payment Received' })
          : null,
    },
    {
      label: 'Order Freeze',
      icon: Snowflake,
      done: flags.orderFreeze,
      action:
        quote.status === 'PAYMENT_RECEIVED' || quote.status === 'ORDER_CONFIRMED'
          ? () => setConfirmAction({ status: 'ORDER_FREEZE', label: 'Order Freeze' })
          : null,
    },
  ]

  const address = [order.customer.address, order.customer.city].filter(Boolean).join(', ')

  return (
    <Card className="gap-0 rounded-2xl p-4 shadow-sm sm:p-5">
      {/* Header: avatar + name + lead pill + signup/PAN chips */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-base font-bold text-primary">
            {initialsOf(order.customer.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-bold text-foreground">{order.customer.name}</p>
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700">
                {order.leadNumber}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.customer.phone}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
            Signup
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 border-stone-200 text-muted-foreground',
              order.panAdded && 'border-green-200 bg-green-50 text-green-700'
            )}
          >
            <CreditCard className="size-3" />
            PAN Added
          </Badge>
        </div>
      </div>

      {/* Contact rows */}
      <div className="mt-3 space-y-1.5 text-sm">
        <a
          href={`tel:${order.customer.phone}`}
          className="flex min-h-8 items-center gap-2.5 text-foreground transition-colors hover:text-primary"
        >
          <Phone className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{order.customer.phone}</span>
        </a>
        {order.customer.email && (
          <div className="flex min-h-8 items-center gap-2.5">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-muted-foreground">{order.customer.email}</span>
          </div>
        )}
      </div>

      {/* Grey details panel */}
      <div className="mt-3 space-y-2 rounded-xl bg-muted p-3 text-sm">
        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-foreground">{address || 'No address on file'}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Calendar className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Created: <span className="font-medium text-foreground">{fmtDate(order.createdAt)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">
            Adviser: <span className="font-medium text-foreground">{order.adviserName ?? 'Unassigned'}</span>
          </span>
        </div>
      </div>

      {/* Active quote panel */}
      <div className="mt-4 rounded-xl border border-primary/25 bg-orange-50/40 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <FileBadge className="size-3.5" />
              Active Quote
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md border bg-background px-2 py-1 font-mono text-sm font-bold text-foreground">
                {quote.quotationNumber}
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                {quote.versionNumber}.{' '}
                {versionTypeLabels[quote.versionType] ?? quote.versionType}
              </span>
              <Badge variant="outline" className={qMeta?.badge}>
                {qMeta?.label ?? quote.status}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 xl:shrink-0">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Payable
              </p>
              <p className="mt-0.5 text-xl font-extrabold tracking-tight text-primary">
                {formatINR(quote.totalPayable)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Gross Value
              </p>
              <p className="mt-0.5 text-sm font-bold text-foreground">
                {formatINR(quote.grossValue)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Published
              </p>
              <p className="mt-0.5 text-sm font-bold text-foreground">{fmtDate(quote.publishedAt)}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Bath className="size-3" />
                Bathrooms
              </p>
              <p className="mt-0.5 text-sm font-bold text-foreground">{quote.bathroomCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status pipeline chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {stages.map((stage) => (
          <StagePill key={stage.label} stage={stage} />
        ))}
      </div>

      {/* Other versions + view quote */}
      <div className="mt-4 space-y-2">
        {order.otherVersionsCount > 0 && (
          <Collapsible>
            <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground md:min-h-9">
              {order.otherVersionsCount} other quote version
              {order.otherVersionsCount === 1 ? '' : 's'}
              <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="pb-1 pt-1 text-center text-xs text-muted-foreground">
                {order.otherVersionsCount} earlier version
                {order.otherVersionsCount === 1 ? '' : 's'} of this quote exist
                {order.otherVersionsCount === 1 ? 's' : ''} — open the quote to see its full
                version history.
              </p>
            </CollapsibleContent>
          </Collapsible>
        )}
        <Button
          variant="outline"
          className="w-full min-h-11 font-semibold"
          onClick={() => navigate('quotation-detail', { id: quote.id })}
        >
          View Quote
        </Button>
      </div>

      {/* Confirm payment / freeze */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {confirmAction?.label.toLowerCase() ?? 'action'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.status === 'PAYMENT_RECEIVED'
                ? `This records the payment of ${formatINR(quote.totalPayable)} for ${quote.quotationNumber}.`
                : `This freezes the order for ${quote.quotationNumber} — production planning can begin.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={saving}>
              Back
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 font-semibold"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault()
                if (!confirmAction) return
                setSaving(true)
                void onStatusChange(quote.id, confirmAction.status, `${confirmAction.label} recorded`)
                  .catch(() => undefined)
                  .finally(() => {
                    setSaving(false)
                    setConfirmAction(null)
                  })
              }}
            >
              {saving ? 'Saving…' : `Confirm ${confirmAction?.label ?? ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// OrdersView
// ---------------------------------------------------------------------------

export default function OrdersView() {
  const { navigate } = useNav()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search)

  const query = useMemo(() => {
    const qs = new URLSearchParams()
    if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
    return qs.toString()
  }, [debouncedSearch])

  const { data, error, loading, refresh } = useApi<OrdersResponse>(`/api/orders?${query}`)

  const orders = useMemo(() => data?.orders ?? [], [data])
  const total = data?.total ?? 0

  async function handleStatusChange(
    quoteId: string,
    status: string,
    successMessage: string
  ): Promise<void> {
    try {
      await apiPatch(`/api/quotations/${quoteId}/status`, { status })
      toast.success(successMessage)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update quote status')
      throw err
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:space-y-6 md:p-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary md:text-3xl">Orders</h1>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
            {total} Order{total === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Leads with confirmed quotes and their order status.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, Lead ID, or Quote #..."
          className="h-11 pl-10"
          aria-label="Search orders"
        />
      </div>

      {/* Error state */}
      {error && (
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load orders</p>
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
            <Skeleton key={i} className="h-80 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Orders */}
      {!error && !loading && (
        <>
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.leadId} order={order} onStatusChange={handleStatusChange} />
            ))}
          </div>

          {orders.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-orange-50 text-primary">
                <ShoppingBag className="size-6" />
              </div>
              <p className="font-bold text-foreground">
                {debouncedSearch.trim() ? 'No orders match your search' : 'No orders yet'}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {debouncedSearch.trim()
                  ? 'Try a different name, lead ID or quote number.'
                  : 'Quotes move here after T&C / payment — share a quote and record the T&C acceptance to get started.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
