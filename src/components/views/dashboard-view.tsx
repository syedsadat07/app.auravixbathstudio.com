'use client'

import {
  Activity,
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Contact,
  FileText,
  IndianRupee,
  RefreshCw,
  Send,
  Target,
  UserCog,
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
import { useNav } from '@/lib/nav'
import { useApi } from '@/lib/client'
import { fmtTime, formatINR } from '@/lib/format'
import { quoteStatusMeta } from '@/lib/status'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Types (per /api/dashboard contract)
// ---------------------------------------------------------------------------

interface DashboardAppointment {
  id: string
  scheduledAt: string
  status: string
  customer: { name: string }
  customerCity: string
  leadId: string
}

interface DashboardMetrics {
  totalLeads: number
  activeLeads: number
  totalQuotations: number
  publishedQuotations: number
  acceptedQuotations: number
  convertedLeads: number
  quotationValue: number
  revenue: number
  activeAdmins: number
  totalCustomers: number
}

interface MonthlyPoint {
  label: string
  leads: number
  quotes: number
  revenue: number
}

interface RecentQuote {
  id: string
  quotationNumber: string
  customerName: string
  totalPayable: number
  status: string
  createdAt: string
}

interface DashboardData {
  todayAppointments: DashboardAppointment[]
  todayCount: number
  followUps: number
  ordersWon: number
  ordersTarget: number
  metrics: DashboardMetrics
  monthly: MonthlyPoint[]
  recentQuotes: RecentQuote[]
}

const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN')

// ---------------------------------------------------------------------------
// Chart tooltip (revenue in INR, leads as plain count)
// ---------------------------------------------------------------------------

function ChartTooltip(props: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string | number; value?: number | string }>
}) {
  const { active, label, payload } = props
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.name === 'Revenue' ? '#f2620f' : '#d6d3d1' }}
          />
          <span>{entry.name}:</span>
          <span className="font-semibold text-foreground">
            {entry.name === 'Revenue' ? formatINR(Number(entry.value)) : (entry.value ?? 0)}
          </span>
        </p>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

interface MetricConfig {
  label: string
  value: string
  icon: LucideIcon
  accent?: string
  superOnly?: boolean
}

function MetricCard({ metric }: { metric: MetricConfig }) {
  const Icon = metric.icon
  return (
    <Card className="gap-0 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {metric.label}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
      <p
        className={cn(
          'mt-2 truncate text-xl font-extrabold tracking-tight md:text-2xl',
          metric.accent
        )}
        title={metric.value}
      >
        {metric.value}
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// DashboardView
// ---------------------------------------------------------------------------

export default function DashboardView() {
  const { user, isSuperAdmin } = useAuth()
  const { navigate } = useNav()
  const { data, error, loading, refresh } = useApi<DashboardData>('/api/dashboard')

  const firstName = (user?.name ?? 'there').split(' ')[0]
  const metrics = data?.metrics
  const ordersTarget = Number(data?.ordersTarget) || 0
  const ordersWon = Number(data?.ordersWon) || 0
  const progressPct = ordersTarget > 0 ? Math.min(100, Math.round((ordersWon / ordersTarget) * 100)) : 0

  const metricConfigs: MetricConfig[] = metrics
    ? [
        { label: 'Total Leads', value: num(metrics.totalLeads), icon: Users },
        { label: 'Active Leads', value: num(metrics.activeLeads), icon: Activity },
        { label: 'Total Quotations', value: num(metrics.totalQuotations), icon: FileText },
        { label: 'Published', value: num(metrics.publishedQuotations), icon: Send },
        { label: 'Accepted', value: num(metrics.acceptedQuotations), icon: CheckCircle2 },
        { label: 'Quotation Value', value: formatINR(metrics.quotationValue), icon: IndianRupee },
        { label: 'Revenue', value: formatINR(metrics.revenue), icon: Wallet, accent: 'text-primary' },
        { label: 'Total Customers', value: num(metrics.totalCustomers), icon: Contact },
        ...(isSuperAdmin
          ? [{ label: 'Active Admins', value: num(metrics.activeAdmins), icon: UserCog } as MetricConfig]
          : []),
      ]
    : []

  const extraAppointments = Math.max(0, (data?.todayAppointments.length ?? 0) - 2)

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-60 md:h-9 md:w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-44 rounded-2xl md:h-40" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
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
            <p className="font-bold text-foreground">Failed to load dashboard</p>
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
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Welcome Back, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Here&apos;s your schedule for today.
        </p>
      </div>

      {/* Appointments hero */}
      <section className="hero-gradient rounded-2xl p-5 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Calendar className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
              Appointments
            </p>
            <p className="text-lg font-bold leading-snug">
              {data?.todayCount ?? 0} appointment{(data?.todayCount ?? 0) === 1 ? '' : 's'} scheduled.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {(data?.todayAppointments ?? []).slice(0, 2).map((appt) => (
            <div
              key={appt.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/10 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{appt.customer?.name ?? 'Customer'}</p>
                <p className="truncate text-xs text-white/70">
                  {[appt.customerCity, fmtTime(appt.scheduledAt)].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('lead-detail', { id: appt.leadId })}
                className="h-10 shrink-0 rounded-lg bg-white/15 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/25"
              >
                View
              </button>
            </div>
          ))}
          {extraAppointments > 0 && (
            <p className="px-1 text-xs font-medium text-white/70">
              +{extraAppointments} more appointment{extraAppointments === 1 ? '' : 's'}
            </p>
          )}
          {(data?.todayAppointments ?? []).length === 0 && (
            <p className="rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white/80">
              No appointments today — a good day to chase follow-ups.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate('appointments')}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white/15 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/25"
        >
          View all appointments
          <ArrowRight className="size-3.5" />
        </button>
      </section>

      {/* Follow-ups + Orders Won */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="gap-0 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quote Follow-ups
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight">
                {num(data?.followUps)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Quotes pending follow-up</p>
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary">
              <FileText className="size-5" />
            </div>
          </div>
        </Card>

        <Card className="gap-0 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Orders Won
              </p>
              <p className="mt-2 text-3xl font-extrabold tracking-tight">
                {num(ordersWon)} <span className="text-lg font-bold text-muted-foreground">/ {num(ordersTarget)}</span>
              </p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">Target for this month</p>
              <Progress
                value={progressPct}
                className="h-2 bg-stone-200 [&>div]:bg-green-500"
                aria-label={`${progressPct}% of monthly target`}
              />
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Target className="size-5" />
            </div>
          </div>
        </Card>
      </section>

      {/* Metrics grid */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {metricConfigs.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </section>

      {/* Monthly chart */}
      <Card className="gap-0 rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-foreground">Last 6 Months</p>
            <p className="text-xs text-muted-foreground">Revenue &amp; leads trend</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-[#f2620f]" />
              Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-[#d6d3d1]" />
              Leads
            </span>
          </div>
        </div>
        {(data?.monthly ?? []).length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            No monthly data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data?.monthly ?? []} barGap={2} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
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
              <Bar dataKey="leads" name="Leads" fill="#d6d3d1" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey="revenue" name="Revenue" fill="#f2620f" radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Recent quotations */}
      <Card className="gap-0 rounded-2xl p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-foreground">Recent Quotations</p>
          <button
            type="button"
            onClick={() => navigate('quotations')}
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline md:min-h-0"
          >
            View all
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="divide-y divide-border">
          {(data?.recentQuotes ?? []).map((q) => {
            const meta = quoteStatusMeta[q.status]
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => navigate('quotation-detail', { id: q.id })}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{q.quotationNumber}</p>
                  <p className="truncate text-xs text-muted-foreground">{q.customerName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                  <Badge variant="outline" className={meta?.badge}>
                    {meta?.label ?? q.status}
                  </Badge>
                  <span className="w-24 text-right text-sm font-bold text-primary sm:w-28">
                    {formatINR(q.totalPayable)}
                  </span>
                </div>
              </button>
            )
          })}
          {(data?.recentQuotes ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No quotations yet — create your first quote from a lead.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
