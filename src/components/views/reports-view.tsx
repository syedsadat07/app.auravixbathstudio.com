'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarRange,
  CheckCircle2,
  FileText,
  Info,
  RefreshCw,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useAuth } from '@/lib/auth-context'
import { useApi } from '@/lib/client'
import { formatINR } from '@/lib/format'
import { leadStatusLabels, quoteStatusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ---------------------------------------------------------------------------
// Types (per /api/reports contract)
// ---------------------------------------------------------------------------

interface ReportsData {
  leadsByStatus: { status: string; count: number }[]
  quotesByStatus: { status: string; count: number; value: number }[]
  revenueByMonth: { month: string; revenue: number }[]
  adviserPerformance: { id: string; name: string; leads: number; quotes: number; won: number; value: number }[]
  packageMix: { name: string; count: number; area: number }[]
}

const WON_STATUSES = ['ORDER_CONFIRMED', 'ORDER_FREEZE', 'PAYMENT_RECEIVED']

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toISODate(d)
}

const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN')

const fmtArea = (n: number | null | undefined) => {
  const v = Number(n) || 0
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

// ---------------------------------------------------------------------------
// Chart tooltip (revenue in INR, counts as plain numbers)
// ---------------------------------------------------------------------------

function ChartTooltip(props: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string | number; value?: number | string; dataKey?: string | number }>
}) {
  const { active, label, payload } = props
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && <p className="mb-1 font-semibold text-foreground">{label}</p>}
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.name === 'Revenue' ? '#f2620f' : '#a8a29e' }}
          />
          <span>{entry.name}:</span>
          <span className="font-semibold text-foreground">
            {entry.name === 'Revenue' ? formatINR(Number(entry.value)) : num(Number(entry.value))}
          </span>
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatConfig {
  label: string
  value: string
  icon: LucideIcon
  accent?: string
}

function StatCard({ stat }: { stat: StatConfig }) {
  const Icon = stat.icon
  return (
    <Card className="gap-0 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {stat.label}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
      <p
        className={cn('mt-2 truncate text-xl font-extrabold tracking-tight md:text-2xl', stat.accent)}
        title={stat.value}
      >
        {stat.value}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ReportsView
// ---------------------------------------------------------------------------

export default function ReportsView() {
  const { isSuperAdmin } = useAuth()

  const [from, setFrom] = useState(daysAgoISO(90))
  const [to, setTo] = useState(toISODate(new Date()))

  const query = useMemo(() => {
    const sp = new URLSearchParams()
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)
    return `/api/reports?${sp.toString()}`
  }, [from, to])

  const { data, loading, error, refresh } = useApi<ReportsData>(query)

  const totalLeads = (data?.leadsByStatus ?? []).reduce((sum, l) => sum + (Number(l.count) || 0), 0)
  const totalQuotes = (data?.quotesByStatus ?? []).reduce((sum, q) => sum + (Number(q.count) || 0), 0)
  const ordersWon = (data?.quotesByStatus ?? [])
    .filter((q) => WON_STATUSES.includes(q.status))
    .reduce((sum, q) => sum + (Number(q.count) || 0), 0)
  const revenue = (data?.revenueByMonth ?? []).reduce((sum, m) => sum + (Number(m.revenue) || 0), 0)

  const stats: StatConfig[] = [
    { label: 'Total Leads', value: num(totalLeads), icon: Users },
    { label: 'Quotations', value: num(totalQuotes), icon: FileText },
    { label: 'Orders Won', value: num(ordersWon), icon: CheckCircle2 },
    { label: 'Revenue', value: formatINR(revenue), icon: Wallet, accent: 'text-primary' },
  ]

  const revenueChartData = (data?.revenueByMonth ?? []).map((m) => ({
    label: m.month,
    revenue: Number(m.revenue) || 0,
  }))

  const quotesChartData = (data?.quotesByStatus ?? []).map((q) => ({
    label: quoteStatusMeta[q.status]?.label ?? q.status,
    count: Number(q.count) || 0,
  }))

  const leadsChartData = (data?.leadsByStatus ?? []).map((l) => ({
    label: leadStatusLabels[l.status] ?? l.status,
    count: Number(l.count) || 0,
  }))

  const advisers = useMemo(
    () => [...(data?.adviserPerformance ?? [])].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)),
    [data]
  )

  const packageMax = Math.max(0, ...(data?.packageMix ?? []).map((p) => Number(p.area) || 0))

  function setQuickRange(days: number) {
    setFrom(daysAgoISO(days))
    setTo(toISODate(new Date()))
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 md:h-9 md:w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load reports</p>
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
          Reports
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Leads, quotations and revenue analytics.
        </p>
        {!isSuperAdmin && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Info className="size-3.5" />
            Showing your performance.
          </p>
        )}
      </div>

      {/* Date range */}
      <Card className="gap-0 rounded-2xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="rep-from">From</Label>
              <Input
                id="rep-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="rep-to">To</Label>
              <Input
                id="rep-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <CalendarRange className="size-3.5" />
              Quick picks:
            </span>
            {[30, 90, 365].map((d) => (
              <Button
                key={d}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickRange(d)}
                className="min-h-11 md:min-h-9"
              >
                Last {d} days
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Stat cards */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <StatCard key={s.label} stat={s} />
        ))}
      </section>

      {/* Revenue by month */}
      <Card className="gap-0 rounded-2xl p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-foreground">Revenue by Month</p>
          <p className="text-xs text-muted-foreground">Payments received in the selected period</p>
        </div>
        {revenueChartData.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
            No revenue recorded in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={revenueChartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e8e4de" strokeDasharray="4 4" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                dy={8}
                tick={{ fontSize: 11, fill: '#75716c' }}
              />
              <YAxis hide />
              <Tooltip cursor={{ fill: 'rgba(38, 38, 43, 0.05)' }} content={<ChartTooltip />} />
              <Bar
                dataKey="revenue"
                name="Revenue"
                fill="#f2620f"
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Quotes & leads status charts */}
      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 rounded-2xl p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-foreground">Quotations by Status</p>
            <p className="text-xs text-muted-foreground">Latest quotation status distribution</p>
          </div>
          {quotesChartData.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              No quotations in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart
                data={quotesChartData}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#e8e4de" strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  height={54}
                  angle={-30}
                  textAnchor="end"
                  tick={{ fontSize: 10, fill: '#75716c' }}
                />
                <YAxis hide />
                <Tooltip cursor={{ fill: 'rgba(38, 38, 43, 0.05)' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="count"
                  name="Quotations"
                  fill="#a8a29e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="gap-0 rounded-2xl p-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-foreground">Leads by Status</p>
            <p className="text-xs text-muted-foreground">Pipeline breakdown for the period</p>
          </div>
          {leadsChartData.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              No leads in this period.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart
                data={leadsChartData}
                layout="vertical"
                margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} stroke="#e8e4de" strokeDasharray="4 4" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={116}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#75716c' }}
                />
                <Tooltip cursor={{ fill: 'rgba(38, 38, 43, 0.05)' }} content={<ChartTooltip />} />
                <Bar
                  dataKey="count"
                  name="Leads"
                  fill="#22c55e"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      {/* Adviser performance */}
      <Card className="gap-0 rounded-2xl p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-foreground">Adviser Performance</p>
          <p className="text-xs text-muted-foreground">Ranked by quotation value won</p>
        </div>
        {advisers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No adviser activity in this period.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Adviser</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Quotations</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advisers.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-semibold text-foreground">{a.name}</TableCell>
                    <TableCell className="text-right">{num(a.leads)}</TableCell>
                    <TableCell className="text-right">{num(a.quotes)}</TableCell>
                    <TableCell className="text-right">{num(a.won)}</TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {formatINR(a.value)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Package mix */}
      <Card className="gap-0 rounded-2xl p-5">
        <div className="mb-4">
          <p className="text-sm font-bold text-foreground">Package Mix</p>
          <p className="text-xs text-muted-foreground">Quoted area by package</p>
        </div>
        {(data?.packageMix ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No package quotations in this period.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(data?.packageMix ?? []).map((p) => {
              const pct = packageMax > 0 ? Math.max(2, Math.round(((Number(p.area) || 0) / packageMax) * 100)) : 0
              return (
                <div key={p.name} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-extrabold uppercase tracking-widest text-foreground">
                      {p.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.count} quotes</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{fmtArea(p.area)} sq.ft total</p>
                  <Progress value={pct} className="mt-3 h-2 bg-stone-200" aria-label={`${p.name} share`} />
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
