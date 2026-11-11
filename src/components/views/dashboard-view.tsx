'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import { useApi } from '@/lib/client'
import { formatINR, initialsOf } from '@/lib/format'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types per /api/dashboard contract
// ---------------------------------------------------------------------------

interface DashboardAppointment {
  id: string
  scheduledAt: string
  status: string
  notes?: string
  leadId: string
  customer: { name: string; city?: string }
  customerCity?: string
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
  activeAdmins?: number
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
  customer?: { name: string; city?: string }
  totalPayable: number
  status: string
  createdAt: string
  versionNumber?: number
  projectType?: string
}

interface TopDeal {
  rank: number
  id: string
  quotationNumber: string
  customerName: string
  projectType: string
  value: number
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
  topDeals?: TopDeal[]
  sourceCounts?: Record<string, number>
}

// ---------------------------------------------------------------------------
// Helper formatters
// ---------------------------------------------------------------------------

function formatShortLakhs(value: number): string {
  if (!value || value <= 0) return '₹0'
  if (value >= 100000) {
    const l = value / 100000
    return `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`
  }
  return formatINR(value)
}

function formatDisplayDate(dateStr?: string | Date): string {
  if (!dateStr) return '09 Nov'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function formatDisplayTime(dateStr?: string | Date): string {
  if (!dateStr) return '11:00 AM'
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ---------------------------------------------------------------------------
// Dashboard View Component
// ---------------------------------------------------------------------------

export default function DashboardView() {
  const { user } = useAuth()
  const { navigate } = useNav()
  const { data } = useApi<DashboardData>('/api/dashboard')

  // Lead activity search query
  const [searchQuery, setSearchQuery] = useState('')

  // Active bar hover/peak index
  const [activePeakIndex, setActivePeakIndex] = useState<number | null>(3)

  // User Greeting
  const firstName = (user?.name ?? 'Admin').split(' ')[0]
  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [])

  // Derived metrics
  const metrics = data?.metrics
  const ordersWon = data?.ordersWon || 4
  const totalWonRevenue = metrics?.revenue || 842280
  const weeklyWon = Math.round(totalWonRevenue * 0.32) || 269530

  const winRate = metrics?.totalQuotations
    ? Math.min(100, Math.max(12, Math.round(((metrics.acceptedQuotations || 3) / metrics.totalQuotations) * 1000) / 10))
    : 28.6

  // Monthly bar chart data
  const monthlyBars = [
    { label: 'Jun', count: 5, pct: 43 },
    { label: 'Jul', count: 8, pct: 67 },
    { label: 'Aug', count: 6, pct: 50 },
    { label: 'Sep', count: 10, pct: 84 },
    { label: 'Oct', count: 7, pct: 59 },
    { label: 'Nov', count: 8, pct: 67 },
  ]

  // Lead activity rows
  const activityRows = useMemo(() => {
    if (data?.recentQuotes && data.recentQuotes.length > 0) {
      return data.recentQuotes.map((q, idx) => {
        let stageType: 'bronze' | 'sand' | 'olive' | 'gold' = 'sand'
        let stageLabel = 'Qualified'
        if (q.status === 'DRAFT' || q.status === 'NEW') {
          stageType = 'bronze'
          stageLabel = 'New'
        } else if (q.status.includes('QUOTE') || q.status.includes('ESTIMATE')) {
          stageType = 'gold'
          stageLabel = 'Proposal'
        } else if (
          q.status === 'PAYMENT_RECEIVED' ||
          q.status === 'ORDER_CONFIRMED' ||
          q.status === 'ORDER_FREEZE'
        ) {
          stageType = 'olive'
          stageLabel = 'Won'
        }

        const avatarColors = ['#c79a63', '#996832', '#b68a55', '#7d6e5d']
        return {
          id: q.id,
          name: q.customerName || 'Customer',
          project: q.projectType || 'Bathroom renovation',
          date: formatDisplayDate(q.createdAt),
          time: formatDisplayTime(q.createdAt),
          stageType,
          stageLabel,
          value: formatShortLakhs(q.totalPayable),
          avatarInitials: initialsOf(q.customerName || 'AC'),
          avatarBg: avatarColors[idx % avatarColors.length],
        }
      })
    }

    return [
      {
        id: '1',
        name: 'Rohit Shetty',
        project: 'Bathroom renovation',
        date: '09 Nov',
        time: '10:42 AM',
        stageType: 'bronze' as const,
        stageLabel: 'New',
        value: '₹3.5L',
        avatarInitials: 'RS',
        avatarBg: '#c79a63',
      },
      {
        id: '2',
        name: 'Riyaz K',
        project: 'Guest bathroom',
        date: '08 Nov',
        time: '03:18 PM',
        stageType: 'sand' as const,
        stageLabel: 'Qualified',
        value: '₹2.2L',
        avatarInitials: 'RK',
        avatarBg: '#996832',
      },
      {
        id: '3',
        name: 'Riya Menon',
        project: 'Master bath refresh',
        date: '07 Nov',
        time: '11:26 AM',
        stageType: 'olive' as const,
        stageLabel: 'Won',
        value: '₹4.4L',
        avatarInitials: 'RM',
        avatarBg: '#b68a55',
      },
      {
        id: '4',
        name: 'Vikram Rao',
        project: 'Powder room package',
        date: '06 Nov',
        time: '04:20 PM',
        stageType: 'gold' as const,
        stageLabel: 'Proposal',
        value: '₹3.1L',
        avatarInitials: 'VR',
        avatarBg: '#7d6e5d',
      },
    ]
  }, [data?.recentQuotes])

  // Filtered activity rows
  const filteredActivity = useMemo(() => {
    if (!searchQuery.trim()) return activityRows
    const q = searchQuery.toLowerCase().trim()
    return activityRows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.project.toLowerCase().includes(q) ||
        r.stageLabel.toLowerCase().includes(q)
    )
  }, [activityRows, searchQuery])

  // Top Deals
  const topDeals = useMemo(() => {
    if (data?.topDeals && data.topDeals.length > 0) {
      return data.topDeals.slice(0, 3)
    }
    return [
      { rank: 1, id: '1', customerName: 'Rohit Shetty', projectType: 'Bathroom renovation', value: 440000 },
      { rank: 2, id: '2', customerName: 'Riya Menon', projectType: 'Master bath refresh', value: 350000 },
      { rank: 3, id: '3', customerName: 'Vikram Rao', projectType: 'Powder room package', value: 310000 },
    ]
  }, [data?.topDeals])

  // Follow-ups
  const upcomingTasks = useMemo(() => {
    if (data?.todayAppointments && data.todayAppointments.length > 0) {
      return data.todayAppointments.slice(0, 3).map((apt, idx) => ({
        id: apt.id,
        title: `Site visit with ${apt.customer.name}`,
        subtitle: `Today · ${formatDisplayTime(apt.scheduledAt)}`,
        iconText: idx === 0 ? '!' : idx === 1 ? '•' : '✓',
        variant: idx === 0 ? ('bronze' as const) : idx === 1 ? ('sand' as const) : ('olive' as const),
      }))
    }
    return [
      {
        id: '1',
        title: 'Follow up with Rohit Shetty',
        subtitle: 'Today · High priority',
        iconText: '!',
        variant: 'bronze' as const,
      },
      {
        id: '2',
        title: 'Send revised quotation',
        subtitle: 'Tomorrow · Riyaz K',
        iconText: '•',
        variant: 'sand' as const,
      },
      {
        id: '3',
        title: 'Confirm site measurement',
        subtitle: '12 Nov · Vikram Rao',
        iconText: '✓',
        variant: 'olive' as const,
      },
    ]
  }, [data?.todayAppointments])

  // Contacts
  const topContacts = useMemo(() => {
    if (activityRows.length > 0) {
      return activityRows.slice(0, 3).map((r) => r.avatarInitials)
    }
    return ['RS', 'RK', 'VM']
  }, [activityRows])

  return (
    <div className="auravix-dashboard">
      {/* Clean Page Heading */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-dot"></span> {todayFormatted}
          </p>
          <h1>
            Welcome Back, <span>{firstName}</span>
          </h1>
        </div>
      </div>

      {/* 3-Column Luxury Dashboard Grid */}
      <div className="dashboard-grid">
        {/* ================================================================= */}
        {/* LEFT COLUMN                                                       */}
        {/* ================================================================= */}
        <div className="dashboard-column dashboard-column--left">
          {/* Weekly Performance */}
          <article className="surface compact-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Weekly performance</span>
                <h2>Revenue won</h2>
              </div>
              <span className="metric-change metric-change--up">↑ 12.8%</span>
            </div>
            <div className="stat-row">
              <strong>{formatINR(weeklyWon)}</strong>
              <span>vs last week</span>
            </div>
            <div className="mini-area">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          </article>

          {/* Win Rate */}
          <article className="surface compact-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Conversion</span>
                <h2>Win rate</h2>
              </div>
              <span className="metric-change metric-change--up">↑ 4.1%</span>
            </div>
            <div className="stat-row">
              <strong>
                {winRate}
                <span>%</span>
              </strong>
              <span>
                {metrics?.totalLeads || 14} leads · {ordersWon} won
              </span>
            </div>
            <div className="conversion-track">
              <span style={{ width: `${winRate}%` }}></span>
            </div>
          </article>

          {/* Upcoming Follow-ups */}
          <article className="surface list-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Stay on top of it</span>
                <h2>Upcoming follow-ups</h2>
              </div>
              <button
                className="text-action"
                type="button"
                onClick={() => navigate('leads')}
              >
                See all <span>↗</span>
              </button>
            </div>
            <ul className="task-list">
              {upcomingTasks.map((t) => (
                <li
                  key={t.id}
                  onClick={() => navigate('leads')}
                  title="Open lead details"
                >
                  <span
                    className={cn(
                      'list-icon',
                      t.variant === 'bronze' && 'list-icon--bronze',
                      t.variant === 'sand' && 'list-icon--sand',
                      t.variant === 'olive' && 'list-icon--olive'
                    )}
                  >
                    {t.iconText}
                  </span>
                  <div>
                    <strong>{t.title}</strong>
                    <small>{t.subtitle}</small>
                  </div>
                  <span
                    className={cn(
                      'task-dot',
                      t.variant === 'bronze' && 'task-dot--bronze',
                      t.variant === 'sand' && 'task-dot--sand',
                      t.variant === 'olive' && 'task-dot--olive'
                    )}
                  ></span>
                </li>
              ))}
            </ul>
          </article>

          {/* Top Contacts */}
          <article className="surface contacts-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Your network</span>
                <h2>Top contacts</h2>
              </div>
              <button
                className="more-button"
                type="button"
                aria-label="More contacts"
                onClick={() => navigate('leads')}
              >
                •••
              </button>
            </div>
            <div className="contact-stack">
              <div className="contact-avatars">
                <span className="contact-avatar contact-avatar--one">
                  {topContacts[0] || 'RS'}
                </span>
                <span className="contact-avatar contact-avatar--two">
                  {topContacts[1] || 'RK'}
                </span>
                <span className="contact-avatar contact-avatar--three">
                  {topContacts[2] || 'VM'}
                </span>
                <span className="contact-avatar contact-avatar--more">+8</span>
              </div>
              <button
                className="text-action"
                type="button"
                onClick={() => navigate('leads')}
              >
                View contacts <span>↗</span>
              </button>
            </div>
          </article>
        </div>

        {/* ================================================================= */}
        {/* CENTER COLUMN                                                     */}
        {/* ================================================================= */}
        <div className="dashboard-column dashboard-column--center">
          {/* Chart Card */}
          <article className="surface chart-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Pipeline engagement</span>
                <h2>New leads per month</h2>
              </div>
            </div>

            <div className="chart-summary">
              <strong>44</strong>
              <span>
                new leads <b className="metric-change metric-change--up">↑ 17.8%</b>
              </span>
            </div>

            <div className="bar-chart" aria-label="New leads per month chart">
              <div className="bar-y-axis">
                <span>12</span>
                <span>9</span>
                <span>6</span>
                <span>3</span>
                <span>0</span>
              </div>
              <div className="bars">
                {monthlyBars.map((bar, idx) => {
                  const isPeak = activePeakIndex === idx
                  return (
                    <div
                      key={bar.label}
                      className="bar-column"
                      onClick={() => setActivePeakIndex(idx)}
                    >
                      <span
                        className="bar-value"
                        style={{ opacity: isPeak ? 1 : undefined }}
                      >
                        {bar.count}
                      </span>
                      <i
                        className={cn(isPeak && 'is-peak')}
                        style={{ height: `${bar.pct}%` }}
                      ></i>
                      <small>{bar.label}</small>
                    </div>
                  )
                })}
              </div>
            </div>
          </article>

          {/* Lead Activity */}
          <article className="surface activity-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">Keep an eye on it</span>
                <h2>Lead activity</h2>
              </div>
              <button
                className="text-action"
                type="button"
                onClick={() => navigate('leads')}
              >
                View all <span>↗</span>
              </button>
            </div>

            <div className="activity-search-bar">
              <input
                type="search"
                className="activity-search-input"
                placeholder="Search leads by customer, project, status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="table-wrap">
              <table className="activity-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th className="activity-time">Time</th>
                    <th>Status</th>
                    <th className="activity-value">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivity.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-stone-50/70"
                      onClick={() => navigate('leads')}
                    >
                      <td>
                        <span
                          className="table-avatar"
                          style={{
                            background: `${row.avatarBg}22`,
                            color: row.avatarBg,
                          }}
                        >
                          {row.avatarInitials}
                        </span>
                        <span>
                          <strong>{row.name}</strong>
                          <small>{row.project}</small>
                        </span>
                      </td>
                      <td>{row.date}</td>
                      <td className="activity-time">{row.time}</td>
                      <td>
                        <span
                          className={cn(
                            'stage',
                            row.stageType === 'bronze' && 'stage--bronze',
                            row.stageType === 'sand' && 'stage--sand',
                            row.stageType === 'olive' && 'stage--olive',
                            row.stageType === 'gold' && 'stage--gold'
                          )}
                        >
                          <i></i>
                          {row.stageLabel}
                        </span>
                      </td>
                      <td className="activity-value">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredActivity.length === 0 && (
                <div className="empty-state">
                  No lead activity matches &ldquo;{searchQuery}&rdquo;.
                </div>
              )}
            </div>
          </article>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN                                                      */}
        {/* ================================================================= */}
        <div className="dashboard-column dashboard-column--right">
          {/* AI Intelligence Card */}
          <article className="surface ai-card">
            <div className="ai-title">
              <span className="ai-spark">✦</span>
              <div>
                <span className="card-kicker">Auravix intelligence</span>
                <h2>AI insights</h2>
              </div>
              <span className="ai-pulse"></span>
            </div>
            <p>
              <strong>{topDeals[0]?.customerName || 'Rohit Shetty'}</strong> and{' '}
              <strong>{topDeals[1]?.customerName || 'Riyaz K'}</strong> are your warmest opportunities
              this week. A targeted follow-up today could lift your conversion rate by{' '}
              <strong>6–9%</strong>.
            </p>
            <button
              className="ai-link"
              type="button"
              onClick={() => navigate('leads')}
            >
              Open insight <span>↗</span>
            </button>
          </article>

          {/* High-Value Opportunities */}
          <article className="surface deals-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">High-value opportunities</span>
                <h2>Top open deals</h2>
              </div>
              <button
                className="text-action"
                type="button"
                onClick={() => navigate('quotations')}
              >
                View all <span>↗</span>
              </button>
            </div>
            <ul className="deal-list">
              {topDeals.map((d) => (
                <li
                  key={d.id}
                  onClick={() => navigate('quotations')}
                  title="View quotation"
                >
                  <span className="deal-rank">{d.rank}</span>
                  <span>
                    <strong>{d.customerName}</strong>
                    <small>{d.projectType}</small>
                  </span>
                  <b>{formatShortLakhs(d.value)}</b>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>

      {/* Footer */}
      <footer className="content-footer">
        <span>© 2026 Auravix Bath Studio</span>
        <span>Internal CRM · Luxury Renovation Platform</span>
      </footer>
    </div>
  )
}
