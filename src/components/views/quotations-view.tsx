'use client'

/**
 * AURAVIX BATH STUDIO — Quotations list view.
 * Search + status tabs + quote cards (View / Duplicate / Download PDF / Share).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Bath,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Share2,
} from 'lucide-react'

import { apiGet, apiPost, useApi, useDebounced } from '@/lib/client'
import { useNav } from '@/lib/nav'
import { areaLabel, fmtDate, formatINR } from '@/lib/format'
import { quoteStatusMeta, versionTypeLabels } from '@/lib/status'
import { downloadQuotationPdf } from '@/lib/pdf'
import QuotationPreview, {
  buildQuotationPreviewData,
  type QuotationLike,
  type QuotationPreviewData,
} from '@/components/quotation/quotation-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types (per Quotations 2-c contract)
// ---------------------------------------------------------------------------

interface QuotationListItem {
  id: string
  quotationNumber: string
  versionNumber: number
  versionType: string
  status: string
  totalPayable: number
  grossValue: number
  totalArea: number
  validityDate: string
  createdAt: string
  customer: { id: string; name: string; phone: string }
  createdBy: { name: string }
  bathroomCount: number
}

interface QuotationsResponse {
  total: number
  quotations: QuotationListItem[]
}

interface DetailResponse {
  quotation: QuotationLike
}

interface SettingsResponse {
  settings: Record<string, string>
}

const PAGE_SIZE = 10

const STATUS_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'QUOTE_SHARED', label: 'Shared' },
  { value: 'TC_ACCEPTED', label: 'Accepted' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

// ---------------------------------------------------------------------------
// Quote card
// ---------------------------------------------------------------------------

function QuoteCard({
  quote,
  busy,
  onView,
  onDuplicate,
  onDownload,
  onShare,
}: {
  quote: QuotationListItem
  busy: boolean
  onView: () => void
  onDuplicate: () => void
  onDownload: () => void
  onShare: () => void
}) {
  const meta = quoteStatusMeta[quote.status]
  return (
    <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onView}
              className="font-mono text-sm font-bold text-foreground transition-colors hover:text-primary"
            >
              {quote.quotationNumber}
            </button>
            <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
              V{quote.versionNumber}
            </span>
            {versionTypeLabels[quote.versionType] ? (
              <span className="text-xs text-muted-foreground">{versionTypeLabels[quote.versionType]}</span>
            ) : null}
            <Badge variant="outline" className={meta?.badge}>
              {meta?.label ?? quote.status}
            </Badge>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold text-foreground">{quote.customer.name}</p>
          <p className="text-xs text-muted-foreground">{quote.customer.phone}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Payable</p>
          <p className="text-lg font-extrabold text-primary">{formatINR(quote.totalPayable)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Ruler className="size-3.5 text-primary/70" />
          {areaLabel(quote.totalArea)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Bath className="size-3.5 text-primary/70" />
          {quote.bathroomCount} Bathroom{quote.bathroomCount === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="size-3.5 text-primary/70" />
          Valid till {fmtDate(quote.validityDate)}
        </span>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Created {fmtDate(quote.createdAt)} · By {quote.createdBy.name}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" className="min-h-11 gap-1.5 text-xs" onClick={onView}>
          <Eye className="size-4" />
          View
        </Button>
        <Button variant="outline" className="min-h-11 gap-1.5 text-xs" onClick={onDuplicate} disabled={busy}>
          <Copy className="size-4" />
          Duplicate
        </Button>
        <Button variant="outline" className="min-h-11 gap-1.5 text-xs" onClick={onDownload} disabled={busy}>
          <Download className="size-4" />
          Download PDF
        </Button>
        <Button variant="outline" className="min-h-11 gap-1.5 text-xs" onClick={onShare}>
          <Share2 className="size-4" />
          Share
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function QuotationsView() {
  const { navigate } = useNav()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('ALL')
  const [page, setPage] = useState(1)
  const [busyId, setBusyId] = useState<string | null>(null)

  const debouncedSearch = useDebounced(search, 350)

  const listPath = useMemo(() => {
    const qs = new URLSearchParams()
    if (tab !== 'ALL') qs.set('status', tab)
    if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim())
    const query = qs.toString()
    return `/api/quotations${query ? `?${query}` : ''}`
  }, [tab, debouncedSearch])

  const { data, error, loading, refresh } = useApi<QuotationsResponse>(listPath)

  const quotations = data?.quotations ?? []
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageQuotes = quotations.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset pagination whenever filters change.
  useEffect(() => {
    setPage(1)
  }, [tab, debouncedSearch])

  // ----- Direct PDF download (hidden off-screen capture node) -----

  const previewRef = useRef<HTMLDivElement>(null)
  const [pdfData, setPdfData] = useState<QuotationPreviewData | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const downloadPdf = async (quote: QuotationListItem) => {
    if (pdfBusy) return
    setPdfBusy(true)
    setBusyId(quote.id)
    try {
      const [detail, settingsRes] = await Promise.all([
        apiGet<DetailResponse>(`/api/quotations/${quote.id}`),
        apiGet<SettingsResponse>('/api/settings'),
      ])
      if (!detail?.quotation) throw new Error('Quotation could not be loaded')
      setPdfData(
        buildQuotationPreviewData({
          quotation: detail.quotation,
          settings: settingsRes?.settings ?? {},
          preparedBy: detail.quotation.createdBy?.name ?? quote.createdBy.name,
        })
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare the PDF')
      setPdfBusy(false)
      setBusyId(null)
    }
  }

  useEffect(() => {
    if (!pdfData || !previewRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        // Wait two frames so the hidden preview is fully painted.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
        if (!previewRef.current || cancelled) return
        const filename = `${pdfData.quotationNumber}-0${pdfData.versionNumber}.pdf`
        await downloadQuotationPdf(previewRef.current, filename)
        if (!cancelled) toast.success(`Downloaded ${filename}`)
      } catch {
        if (!cancelled) toast.error('Could not generate the PDF. Please try again.')
      } finally {
        if (!cancelled) {
          setPdfData(null)
          setPdfBusy(false)
          setBusyId(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfData])

  // ----- Actions -----

  const duplicateQuote = async (quote: QuotationListItem) => {
    setBusyId(quote.id)
    try {
      const res = await apiPost<{ quotation: { id: string; quotationNumber: string } }>(
        `/api/quotations/${quote.id}/duplicate`
      )
      toast.success(`Duplicated as ${res.quotation.quotationNumber}`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not duplicate the quotation')
    } finally {
      setBusyId(null)
    }
  }

  const shareQuote = async (quote: QuotationListItem) => {
    const url = `${window.location.origin}${window.location.pathname}#/quotation-detail?id=${quote.id}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${quote.quotationNumber} — AURAVIX BATH STUDIO`,
          text: `Bathroom renovation quotation for ${quote.customer.name}`,
          url,
        })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success('Quote link copied to clipboard')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('Could not share the quotation')
    }
  }

  // ----- Render -----

  return (
    <div className="space-y-4 p-4 md:space-y-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">Quotations</h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Create, publish and track bathroom renovation quotations.
          </p>
        </div>
        <Button
          onClick={() => navigate('quotation-wizard', {})}
          className="min-h-11 gap-2 font-semibold shadow-sm transition-transform active:scale-[0.99]"
        >
          <Plus className="size-4" />
          New Quotation
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Quote #, customer name or mobile..."
          className="min-h-11 pl-9"
          aria-label="Search quotations"
        />
      </div>

      {/* Status tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto">
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="min-h-9 shrink-0 px-3 text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Error */}
      {error ? (
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load quotations</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => refresh()} className="mt-2 min-h-11 gap-2 font-semibold">
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </Card>
      ) : loading ? (
        /* Loading skeletons */
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-5 w-10 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
              <Skeleton className="mt-4 h-3 w-64" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((__, j) => (
                  <Skeleton key={j} className="h-11 rounded-lg" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : quotations.length === 0 ? (
        /* Empty state */
        <Card className="gap-0 rounded-2xl border-dashed p-10 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-orange-50">
              <FileText className="size-7 text-primary" />
            </div>
            {search || tab !== 'ALL' ? (
              <>
                <p className="text-base font-bold text-foreground">No quotations found</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Try a different search term or status filter.
                </p>
                <Button
                  variant="outline"
                  className="mt-1 min-h-11"
                  onClick={() => {
                    setSearch('')
                    setTab('ALL')
                  }}
                >
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-foreground">No quotations yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Create your first bathroom renovation quotation — pick a lead, choose a package and share a
                  professional quote in minutes.
                </p>
                <Button
                  onClick={() => navigate('quotation-wizard', {})}
                  className="mt-1 min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
                >
                  <Plus className="size-4" />
                  New Quotation
                </Button>
              </>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* Quote cards */}
          <div className="space-y-4">
            {pageQuotes.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                busy={busyId === quote.id || (pdfBusy && busyId === quote.id)}
                onView={() => navigate('quotation-detail', { id: quote.id })}
                onDuplicate={() => duplicateQuote(quote)}
                onDownload={() => downloadPdf(quote)}
                onShare={() => shareQuote(quote)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pageCount > 1 ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 gap-1"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
                Prev
              </Button>
              <p className="text-xs font-medium text-muted-foreground">
                Page {safePage} of {pageCount}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 gap-1"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* Hidden PDF capture node */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 w-[794px]">
        <div ref={previewRef} className={cn(!pdfData && 'hidden')}>
          {pdfData ? <QuotationPreview data={pdfData} /> : null}
        </div>
      </div>
    </div>
  )
}
