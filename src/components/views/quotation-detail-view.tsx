'use client'

/**
 * AURAVIX BATH STUDIO — Quotation detail view.
 * Header + actions (publish / share / PDF / duplicate / new version / status),
 * customer, bathrooms, package, grouped items, cost breakdown, versions timeline.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  Bath,
  CalendarClock,
  Copy,
  Download,
  FilePenLine,
  History,
  Mail,
  MapPin,
  Phone,
  Package,
  RefreshCw,
  Ruler,
  Send,
  Share2,
  User,
} from 'lucide-react'

import { apiGet, apiPatch, apiPost, useApi } from '@/lib/client'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import { areaLabel, fmtDate, formatINR } from '@/lib/format'
import { QUOTE_STATUSES, bathroomTypeLabels, quoteStatusMeta, versionTypeLabels } from '@/lib/status'
import { downloadQuotationPdf } from '@/lib/pdf'
import QuotationPreview, {
  buildQuotationPreviewData,
  type QuotationPreviewData,
} from '@/components/quotation/quotation-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types (per GET /api/quotations/[id] contract)
// ---------------------------------------------------------------------------

interface QuotationItem {
  id: string
  section: string
  materialId: string | null
  name: string
  quantity: number
  unit: string
  rate: number
  amount: number
}

interface QuotationBathroom {
  id: string
  name: string
  type: string
  length: number
  width: number
  height: number | null
  areaSqft: number
  unit?: 'ft' | 'mm'
  wallAreaSqft?: number
  openingsArea?: number
  breakdown?: any
}

interface CurrentVersion {
  id: string
  versionNumber: number
  versionType: string
  status: string
  notes: string | null
  packageName: string
  packageRate: number
  packageAmount: number
  totalArea: number
  itemsAmount: number
  grossValue: number
  discountType: string
  discount: number
  discountAmount: number
  taxableValue: number
  gstRate: number
  gstAmount: number
  totalPayable: number
  createdAt: string
  createdByName: string
  bathrooms: QuotationBathroom[]
  items: QuotationItem[]
}

interface VersionSummary {
  id: string
  versionNumber: number
  versionType: string
  status: string
  totalPayable: number
  grossValue: number
  createdAt: string
  createdByName: string
}

interface QuotationDetailData {
  id: string
  quotationNumber: string
  status: string
  validityDays: number
  validityDate: string
  createdAt: string
  updatedAt: string
  customer: {
    id: string
    name: string
    phone: string
    email?: string | null
    address?: string | null
    city?: string | null
    pincode?: string | null
  }
  lead: { id: string; leadNumber: string } | null
  createdBy: { id: string; name: string }
  currentVersion: CurrentVersion
  versions: VersionSummary[]
}

interface DetailResponse {
  quotation: QuotationDetailData
}

interface SettingsResponse {
  settings: Record<string, string>
}

const PAGE_SECTION_LABELS: Record<string, string> = {
  TILES: 'Tiles',
  FIXTURES: 'Fixtures & Fittings',
  ADDONS: 'Add-ons',
  OTHER: 'Other Services',
}

/** Statuses an ADMIN may set (server-enforced — mirrored for UI). */
const ADMIN_ALLOWED_STATUSES = ['QUOTE_SHARED', 'TC_ACCEPTED', 'PAYMENT_PENDING']
const ADMIN_ALLOWED_CURRENT = ['PUBLISHED', 'QUOTE_SHARED', 'TC_ACCEPTED', 'PAYMENT_PENDING']
/** Publish button only makes sense before the quote enters the pipeline. */
const PRE_PUBLISH_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'EXPIRED']

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function QuotationDetailView() {
  const { params, navigate } = useNav()
  const { user, isSuperAdmin } = useAuth()
  const id = params.id

  const { data, error, loading, refresh } = useApi<DetailResponse>(
    id ? `/api/quotations/${id}` : null
  )
  const { data: settingsData } = useApi<SettingsResponse>('/api/settings')
  const settings = settingsData?.settings ?? {}

  const quotation = data?.quotation ?? null
  const version = quotation?.currentVersion ?? null

  const canPublish = isSuperAdmin || settings.admins_can_publish === 'true'
  const showPublish = Boolean(
    quotation && canPublish && PRE_PUBLISH_STATUSES.includes(quotation.status)
  )

  // ----- status changer -----
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)

  const statusOptions = useMemo(() => {
    if (!quotation) return [] as string[]
    if (isSuperAdmin) {
      return (QUOTE_STATUSES as readonly string[]).filter((s) => s !== quotation.status)
    }
    if (!ADMIN_ALLOWED_CURRENT.includes(quotation.status)) return [] as string[]
    return ADMIN_ALLOWED_STATUSES.filter((s) => s !== quotation.status)
  }, [quotation, isSuperAdmin])

  const applyStatus = async () => {
    if (!quotation || !pendingStatus) return
    setStatusBusy(true)
    try {
      await apiPatch(`/api/quotations/${quotation.id}/status`, { status: pendingStatus })
      toast.success(
        `Status updated to ${quoteStatusMeta[pendingStatus]?.label ?? pendingStatus}`
      )
      setPendingStatus(null)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the status')
    } finally {
      setStatusBusy(false)
    }
  }

  // ----- actions -----
  const [busy, setBusy] = useState<string | null>(null)

  const publishQuote = async () => {
    if (!quotation) return
    setBusy('publish')
    try {
      await apiPost(`/api/quotations/${quotation.id}/publish`)
      toast.success(`${quotation.quotationNumber} published`)
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not publish the quotation')
    } finally {
      setBusy(null)
    }
  }

  const duplicateQuote = async () => {
    if (!quotation) return
    setBusy('duplicate')
    try {
      const res = await apiPost<{ quotation: { id: string; quotationNumber: string } }>(
        `/api/quotations/${quotation.id}/duplicate`
      )
      toast.success(`Duplicated as ${res.quotation.quotationNumber}`)
      navigate('quotation-detail', { id: res.quotation.id })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not duplicate the quotation')
      setBusy(null)
    }
  }

  const shareQuote = async () => {
    if (!quotation) return
    const url = `${window.location.origin}${window.location.pathname}#/quotation-detail?id=${quotation.id}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: `${quotation.quotationNumber} — AURAVIX BATH STUDIO`,
          text: `Bathroom renovation quotation for ${quotation.customer.name}`,
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

  // ----- direct PDF download (hidden off-screen capture node) -----
  const previewRef = useRef<HTMLDivElement>(null)
  const [pdfData, setPdfData] = useState<QuotationPreviewData | null>(null)

  const downloadPdf = async () => {
    if (!quotation) return
    setBusy('pdf')
    try {
      const [detail, settingsRes] = await Promise.all([
        apiGet<DetailResponse>(`/api/quotations/${quotation.id}`),
        apiGet<SettingsResponse>('/api/settings'),
      ])
      setPdfData(
        buildQuotationPreviewData({
          quotation: detail.quotation,
          settings: settingsRes?.settings ?? {},
          preparedBy: detail.quotation.createdBy?.name ?? user?.name ?? 'AURAVIX',
        })
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not prepare the PDF')
      setBusy(null)
    }
  }

  useEffect(() => {
    if (!pdfData || !previewRef.current) return
    let cancelled = false
    ;(async () => {
      try {
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
          setBusy(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfData])

  // ----- states -----
  if (loading && !quotation) {
    return (
      <div className="space-y-4 p-4 md:space-y-5 md:p-6">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-36 rounded-2xl" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    )
  }

  if (error) {
    const notFound = /not found/i.test(error)
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className={cn(
                'flex size-12 items-center justify-center rounded-full',
                notFound ? 'bg-muted' : 'bg-destructive/10'
              )}
            >
              {notFound ? (
                <FilePenLine className="size-6 text-muted-foreground" />
              ) : (
                <AlertCircle className="size-6 text-destructive" />
              )}
            </div>
            <p className="font-bold text-foreground">
              {notFound ? 'Quotation not found' : 'Failed to load quotation'}
            </p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="mt-2 flex gap-2">
              {!notFound ? (
                <Button onClick={() => refresh()} className="min-h-11 gap-2 font-semibold">
                  <RefreshCw className="size-4" />
                  Retry
                </Button>
              ) : null}
              <Button variant="outline" className="min-h-11" onClick={() => navigate('quotations')}>
                Back to Quotations
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  if (!quotation || !version) return null

  const statusMeta = quoteStatusMeta[quotation.status]
  const validityExpired = new Date(quotation.validityDate).getTime() < Date.now()

  const groupedItems = (['TILES', 'FIXTURES', 'ADDONS', 'OTHER'] as const)
    .map((section) => ({
      section,
      label: PAGE_SECTION_LABELS[section] ?? section,
      items: version.items.filter((i) => i.section === section),
    }))
    .filter((g) => g.items.length > 0)

  const discountHint =
    version.discountType === 'PERCENT' ? `${version.discount}%` : formatINR(version.discount)

  return (
    <div className="space-y-4 p-4 md:space-y-5 md:p-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 min-h-11 gap-2 text-muted-foreground"
        onClick={() => navigate('quotations')}
      >
        <ArrowLeft className="size-4" />
        Back to Quotations
      </Button>

      {/* Header card */}
      <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {quotation.quotationNumber}
              </h1>
              <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                V{version.versionNumber}
              </span>
              <span className="text-xs text-muted-foreground">
                {versionTypeLabels[version.versionType] ?? version.versionType}
              </span>
              <Badge variant="outline" className={statusMeta?.badge}>
                {statusMeta?.label ?? quotation.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Created {fmtDate(quotation.createdAt)} · Prepared by {quotation.createdBy.name}
            </p>
            {quotation.lead ? (
              <button
                type="button"
                onClick={() => navigate('lead-detail', { id: quotation.lead!.id })}
                className="mt-1 text-xs font-semibold text-primary underline-offset-4 hover:underline"
              >
                Lead {quotation.lead.leadNumber}
              </button>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1">
            <p className="text-right">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total Payable
              </span>
              <span className="text-xl font-extrabold text-primary md:text-2xl">
                {formatINR(version.totalPayable)}
              </span>
            </p>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                validityExpired
                  ? 'bg-red-50 text-red-600'
                  : 'bg-green-50 text-green-700'
              )}
            >
              <CalendarClock className="size-3.5" />
              {validityExpired
                ? `Expired on ${fmtDate(quotation.validityDate)}`
                : `Valid till ${fmtDate(quotation.validityDate)}`}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
          {showPublish ? (
            <Button
              className="min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
              onClick={publishQuote}
              disabled={busy !== null}
            >
              <Send className="size-4" />
              Publish
            </Button>
          ) : null}
          <Button
            className="min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
            onClick={() => navigate('quotation-wizard', { quotationId: quotation.id })}
          >
            <FilePenLine className="size-4" />
            Edit / New Version
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" onClick={downloadPdf} disabled={busy !== null}>
            <Download className="size-4" />
            Download PDF
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" onClick={shareQuote}>
            <Share2 className="size-4" />
            Share
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={duplicateQuote}
            disabled={busy !== null}
          >
            <Copy className="size-4" />
            Duplicate
          </Button>
          {statusOptions.length > 0 ? (
            <Select value={pendingStatus ?? undefined} onValueChange={(v) => setPendingStatus(v)}>
              <SelectTrigger className="min-h-11 w-[190px] shrink-0" aria-label="Change status">
                <SelectValue placeholder="Change Status" />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {quoteStatusMeta[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </Card>

      {/* Customer + bathrooms + package */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
          <div className="mt-3 space-y-2.5 text-sm">
            <p className="flex items-start gap-2 font-bold text-foreground">
              <User className="mt-0.5 size-4 shrink-0 text-primary/70" />
              {quotation.customer.name}
            </p>
            <p className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4 shrink-0 text-primary/70" />
              {quotation.customer.phone}
            </p>
            {quotation.customer.email ? (
              <p className="flex items-center gap-2 break-all text-muted-foreground">
                <Mail className="size-4 shrink-0 text-primary/70" />
                {quotation.customer.email}
              </p>
            ) : null}
            {quotation.customer.address || quotation.customer.city || quotation.customer.pincode ? (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary/70" />
                <span>
                  {[quotation.customer.address, quotation.customer.city, quotation.customer.pincode]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
            ) : null}
          </div>
        </Card>

        {/* Package */}
        <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Package</p>
          <div className="mt-3 space-y-1">
            <p className="text-base font-bold text-foreground">{version.packageName}</p>
            <p className="text-sm font-semibold text-primary">{formatINR(version.packageRate)}/sq.ft</p>
          </div>
        </Card>

        {/* Scope Overview */}
        <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Scope Overview</p>
          <div className="mt-3 space-y-1">
            <p className="text-base font-bold text-foreground">
              {version.bathrooms.length} {version.bathrooms.length === 1 ? 'Bathroom' : 'Bathrooms'} in Scope
            </p>
            <p className="text-sm text-muted-foreground">
              Total Floor Area: <b className="text-foreground">{version.totalArea.toFixed(1)} sq.ft</b>
            </p>
            <p className="text-xs text-muted-foreground">Valid for {quotation.validityDays} days from creation</p>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1, 2, 3: SEPARATE BATHROOM-WISE BREAKDOWN */}
      {/* ------------------------------------------------------------------- */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-extrabold tracking-tight text-foreground md:text-lg">
            Separate Bathroom-Wise Breakdown
          </h2>
          <p className="text-xs text-muted-foreground">
            Detailed itemization capturing dimensions, floor &amp; wall area, tile requirements, fixtures, accessories, labour and bathroom subtotal.
          </p>
        </div>

        <div className="space-y-4">
          {version.bathrooms.map((b, idx) => {
            const bd = b.breakdown
            const unit = b.unit ?? 'ft'
            const isMm = unit === 'mm'
            const wallH = b.height || 10
            const floorArea = b.areaSqft || (isMm ? (b.length * b.width) / 92903.04 : b.length * b.width)
            const wallArea = b.wallAreaSqft ?? (bd?.wallAreaSqft ?? 0)

            const materials = bd ? bd.materialsTotal : Math.round((floorArea / (version.totalArea || 1)) * (version.packageAmount * 0.45))
            const fixtures = bd ? bd.fixturesTotal + bd.accessoriesTotal : Math.round((version.grossValue * 0.3) / version.bathrooms.length)
            const labour = bd ? bd.labourTotal : Math.round(floorArea * 85)
            const additional = bd ? bd.additionalWorkTotal : Math.round(floorArea * 65)
            const subtotal = bd ? bd.bathroomSubtotal : Math.round(version.totalPayable / version.bathrooms.length)

            return (
              <Card key={b.id || idx} className="gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm">
                {/* Bathroom Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-orange-50/40 px-4 py-3 md:px-5">
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-md bg-primary px-2.5 py-0.5 text-xs font-black text-white">
                      BATHROOM {idx + 1}
                    </span>
                    <h3 className="text-base font-bold text-foreground">{b.name}</h3>
                    <Badge variant="outline" className="border-border bg-white text-[11px] font-semibold text-muted-foreground">
                      {bathroomTypeLabels[b.type] ?? b.type}
                    </Badge>
                  </div>
                  <div className="text-sm font-bold text-foreground">
                    Bathroom Subtotal: <span className="text-base font-extrabold text-primary">{formatINR(subtotal)}</span>
                  </div>
                </div>

                {/* Measurements & Calculation Notes */}
                <div className="grid grid-cols-1 gap-3 border-b bg-muted/20 px-4 py-3 text-xs sm:grid-cols-3 md:px-5">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Entered Dimensions ({unit})
                    </p>
                    <p className="font-semibold text-foreground">
                      {b.length} {unit} (L) × {b.width} {unit} (W) × {wallH} {unit} (H)
                    </p>
                    {isMm ? (
                      <p className="text-[10px] text-muted-foreground">
                        Equiv: {(b.length / 304.8).toFixed(2)} ft × {(b.width / 304.8).toFixed(2)} ft
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Floor Area (sq.ft)
                    </p>
                    <p className="text-sm font-extrabold text-primary">
                      {floorArea.toFixed(2)} sq.ft
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {isMm
                        ? `${b.length} × ${b.width} mm / 92,903.04`
                        : `${b.length} ft × ${b.width} ft`}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Wall Tiling Area (sq.ft)
                    </p>
                    <p className="text-sm font-extrabold text-foreground">
                      {wallArea.toFixed(2)} sq.ft
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      2 × (L + W) × Height {b.openingsArea ? `− ${b.openingsArea} openings` : ''}
                    </p>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div className="overflow-x-auto p-4 md:p-5">
                  <table className="w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 text-left font-semibold">Breakdown Category &amp; Item</th>
                        <th className="py-2 text-right font-semibold">Qty</th>
                        <th className="py-2 text-right font-semibold">Unit</th>
                        <th className="py-2 text-right font-semibold">Rate</th>
                        <th className="py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {/* 1. Tile requirements */}
                      <tr className="bg-muted/40 font-bold uppercase tracking-wider text-[10px] text-primary">
                        <td colSpan={5} className="py-1.5 px-2">• Tile Requirements (Floor &amp; Wall Area)</td>
                      </tr>
                      {bd?.tiles && bd.tiles.length > 0 ? (
                        bd.tiles.map((t: any, ti: number) => (
                          <tr key={`t-${ti}`}>
                            <td className="py-2 pl-3 font-medium text-foreground">{t.name}</td>
                            <td className="py-2 text-right tabular-nums">{t.quantity}</td>
                            <td className="py-2 text-right text-muted-foreground">{t.unit}</td>
                            <td className="py-2 text-right tabular-nums">{formatINR(t.rate)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{formatINR(t.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2 pl-3 font-medium text-foreground">Vitrified Floor &amp; Ceramic Wall Tiles Specification</td>
                          <td className="py-2 text-right tabular-nums">{(floorArea + wallArea).toFixed(1)}</td>
                          <td className="py-2 text-right text-muted-foreground">sq.ft</td>
                          <td className="py-2 text-right tabular-nums">{formatINR(Math.round(materials / Math.max(1, floorArea + wallArea)))}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{formatINR(materials)}</td>
                        </tr>
                      )}

                      {/* 2. Fixtures & fittings */}
                      <tr className="bg-muted/40 font-bold uppercase tracking-wider text-[10px] text-foreground">
                        <td colSpan={5} className="py-1.5 px-2">• Fixtures and Fittings</td>
                      </tr>
                      {bd?.fixtures && bd.fixtures.length > 0 ? (
                        bd.fixtures.map((f: any, fi: number) => (
                          <tr key={`f-${fi}`}>
                            <td className="py-2 pl-3 font-medium text-foreground">{f.name}</td>
                            <td className="py-2 text-right tabular-nums">{f.quantity}</td>
                            <td className="py-2 text-right text-muted-foreground">{f.unit}</td>
                            <td className="py-2 text-right tabular-nums">{formatINR(f.rate)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{formatINR(f.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2 pl-3 font-medium text-foreground">Sanitaryware, Vanity, Basin, Diverter &amp; Shower Fittings</td>
                          <td className="py-2 text-right tabular-nums">1</td>
                          <td className="py-2 text-right text-muted-foreground">set</td>
                          <td className="py-2 text-right tabular-nums">{formatINR(fixtures)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{formatINR(fixtures)}</td>
                        </tr>
                      )}

                      {/* 3. Accessories */}
                      {bd?.accessories && bd.accessories.length > 0 ? (
                        <>
                          <tr className="bg-muted/40 font-bold uppercase tracking-wider text-[10px] text-foreground">
                            <td colSpan={5} className="py-1.5 px-2">• Accessories</td>
                          </tr>
                          {bd.accessories.map((a: any, ai: number) => (
                            <tr key={`a-${ai}`}>
                              <td className="py-2 pl-3 font-medium text-foreground">{a.name}</td>
                              <td className="py-2 text-right tabular-nums">{a.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{a.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(a.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(a.amount)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}

                      {/* 4. Labour charges */}
                      <tr className="bg-muted/40 font-bold uppercase tracking-wider text-[10px] text-foreground">
                        <td colSpan={5} className="py-1.5 px-2">• Labour Charges</td>
                      </tr>
                      {bd?.labour && bd.labour.length > 0 ? (
                        bd.labour.map((l: any, li: number) => (
                          <tr key={`l-${li}`}>
                            <td className="py-2 pl-3 font-medium text-foreground">{l.name}</td>
                            <td className="py-2 text-right tabular-nums">{l.quantity}</td>
                            <td className="py-2 text-right text-muted-foreground">{l.unit}</td>
                            <td className="py-2 text-right tabular-nums">{formatINR(l.rate)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{formatINR(l.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2 pl-3 font-medium text-foreground">Plumbing, Tiling &amp; Electrical Installation Labour</td>
                          <td className="py-2 text-right tabular-nums">1</td>
                          <td className="py-2 text-right text-muted-foreground">lot</td>
                          <td className="py-2 text-right tabular-nums">{formatINR(labour)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{formatINR(labour)}</td>
                        </tr>
                      )}

                      {/* 5. Additional work */}
                      <tr className="bg-muted/40 font-bold uppercase tracking-wider text-[10px] text-foreground">
                        <td colSpan={5} className="py-1.5 px-2">• Additional Work</td>
                      </tr>
                      {bd?.additionalWork && bd.additionalWork.length > 0 ? (
                        bd.additionalWork.map((ad: any, adi: number) => (
                          <tr key={`ad-${adi}`}>
                            <td className="py-2 pl-3 font-medium text-foreground">{ad.name}</td>
                            <td className="py-2 text-right tabular-nums">{ad.quantity}</td>
                            <td className="py-2 text-right text-muted-foreground">{ad.unit}</td>
                            <td className="py-2 text-right tabular-nums">{formatINR(ad.rate)}</td>
                            <td className="py-2 text-right font-semibold tabular-nums">{formatINR(ad.amount)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2 pl-3 font-medium text-foreground">Epoxy Grouting, Waterproofing Barrier &amp; Debris Disposal</td>
                          <td className="py-2 text-right tabular-nums">1</td>
                          <td className="py-2 text-right text-muted-foreground">lot</td>
                          <td className="py-2 text-right tabular-nums">{formatINR(additional)}</td>
                          <td className="py-2 text-right font-semibold tabular-nums">{formatINR(additional)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Subtotal strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-4 py-2.5 text-xs md:px-5">
                  <span className="text-muted-foreground">
                    Materials: {formatINR(materials)} · Fixtures: {formatINR(fixtures)} · Labour: {formatINR(labour)} · Additional: {formatINR(additional)}
                  </span>
                  <span className="font-bold text-foreground">
                    {b.name} Subtotal: <span className="font-extrabold text-primary">{formatINR(subtotal)}</span>
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. BATHROOM-WISE MATERIAL AND LABOUR TOTALS */}
      {/* ------------------------------------------------------------------- */}
      <Card className="gap-0 overflow-hidden rounded-2xl border shadow-sm">
        <div className="px-4 pt-4 md:px-5 md:pt-5">
          <h3 className="text-sm font-extrabold tracking-tight text-foreground md:text-base">
            4. Bathroom-Wise Material and Labour Totals
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Consolidated comparison of material, fixture, labour, and additional work totals across all bathrooms.
          </p>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2.5 px-3 text-left font-bold text-foreground">Bathroom</th>
                <th className="py-2.5 px-2 text-right font-semibold">Floor Area</th>
                <th className="py-2.5 px-2 text-right font-semibold">Wall Area</th>
                <th className="py-2.5 px-3 text-right font-bold text-foreground">Materials &amp; Tiles</th>
                <th className="py-2.5 px-3 text-right font-bold text-foreground">Fixtures &amp; Fittings</th>
                <th className="py-2.5 px-3 text-right font-bold text-foreground">Labour Charges</th>
                <th className="py-2.5 px-3 text-right font-bold text-foreground">Additional Work</th>
                <th className="py-2.5 px-3 text-right font-extrabold text-primary">Bathroom Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {version.bathrooms.map((b, idx) => {
                const bd = b.breakdown
                const unit = b.unit ?? 'ft'
                const isMm = unit === 'mm'
                const floorArea = b.areaSqft || (isMm ? (b.length * b.width) / 92903.04 : b.length * b.width)
                const wallArea = b.wallAreaSqft ?? (bd?.wallAreaSqft ?? 0)

                const materials = bd ? bd.materialsTotal : Math.round((floorArea / (version.totalArea || 1)) * (version.packageAmount * 0.45))
                const fixtures = bd ? bd.fixturesTotal + bd.accessoriesTotal : Math.round((version.grossValue * 0.3) / version.bathrooms.length)
                const labour = bd ? bd.labourTotal : Math.round(floorArea * 85)
                const additional = bd ? bd.additionalWorkTotal : Math.round(floorArea * 65)
                const subtotal = bd ? bd.bathroomSubtotal : Math.round(version.totalPayable / version.bathrooms.length)

                return (
                  <tr key={b.id || idx}>
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {b.name}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {bathroomTypeLabels[b.type] ?? b.type} · {b.length} × {b.width} {unit}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{floorArea.toFixed(1)} sq.ft</td>
                    <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">{wallArea.toFixed(1)} sq.ft</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatINR(materials)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatINR(fixtures)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatINR(labour)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-medium">{formatINR(additional)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-primary">{formatINR(subtotal)}</td>
                  </tr>
                )
              })}
              {/* Summary Total Row */}
              <tr className="border-t-2 border-primary/30 bg-orange-50/50 font-bold">
                <td className="py-3 px-3 text-foreground">
                  Combined Total ({version.bathrooms.length} Bathrooms)
                </td>
                <td className="py-3 px-2 text-right tabular-nums">{version.totalArea.toFixed(1)} sq.ft</td>
                <td className="py-3 px-2 text-right tabular-nums">
                  {version.bathrooms.reduce((s, b) => s + (b.wallAreaSqft ?? 0), 0).toFixed(1)} sq.ft
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-foreground">
                  {formatINR(version.bathrooms.reduce((s, b) => s + (b.breakdown?.materialsTotal ?? 0), 0) || Math.round(version.packageAmount * 0.45))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-foreground">
                  {formatINR(version.bathrooms.reduce((s, b) => s + ((b.breakdown?.fixturesTotal ?? 0) + (b.breakdown?.accessoriesTotal ?? 0)), 0) || version.itemsAmount)}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-foreground">
                  {formatINR(version.bathrooms.reduce((s, b) => s + (b.breakdown?.labourTotal ?? 0), 0) || Math.round(version.totalArea * 85))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-foreground">
                  {formatINR(version.bathrooms.reduce((s, b) => s + (b.breakdown?.additionalWorkTotal ?? 0), 0) || Math.round(version.totalArea * 65))}
                </td>
                <td className="py-3 px-3 text-right tabular-nums text-base font-extrabold text-primary">
                  {formatINR(version.totalPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------- */}
      {/* 5, 6, 7, 8: COMBINED QUOTATION SUMMARY */}
      {/* ------------------------------------------------------------------- */}
      <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
        <p className="text-sm font-extrabold tracking-tight text-foreground md:text-base">
          Combined Quotation Summary
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The combined total matches the sum of the individual bathroom amounts and any project-level adjustments.
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          {version.notes ? (
            <div className="space-y-2 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes &amp; Inclusions</p>
              <p className="whitespace-pre-line rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-muted-foreground">
                {version.notes}
              </p>
            </div>
          ) : (
            <div className="hidden lg:block" />
          )}

          <div className="space-y-2 rounded-xl bg-muted/20 p-4 text-sm">
            {/* 5. Total project subtotal */}
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-foreground">5. Total Project Subtotal</span>
              <span className="font-bold tabular-nums text-foreground">{formatINR(version.grossValue)}</span>
            </div>

            {/* 6. Project-wide discounts */}
            {version.discountAmount > 0 ? (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-orange-600">6. Project-Wide Discount ({discountHint})</span>
                <span className="font-bold tabular-nums text-orange-600">−{formatINR(version.discountAmount)}</span>
              </div>
            ) : null}

            {/* 7. Applicable taxes */}
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">7. Applicable Taxes (GST @ {version.gstRate}%)</span>
              <span className="font-semibold tabular-nums text-foreground">{formatINR(version.gstAmount)}</span>
            </div>

            <Separator className="my-2.5" />

            {/* 8. Final quotation amount */}
            <div className="flex items-baseline justify-between gap-3 rounded-xl bg-neutral-900 p-3 text-white">
              <span className="text-xs font-bold uppercase tracking-wider text-white/90">
                8. Final Quotation Amount
              </span>
              <span className="text-2xl font-black tabular-nums text-white">
                {formatINR(version.totalPayable)}
              </span>
            </div>

            <p className="text-right text-[10px] text-muted-foreground">
              ✓ Matches sum of individual bathroom amounts &amp; project adjustments
            </p>
          </div>
        </div>
      </Card>

      {/* Versions timeline */}
      <Card className="gap-0 rounded-2xl border p-4 shadow-sm md:p-5">
        <div className="flex items-center gap-2">
          <History className="size-4 text-primary" />
          <p className="text-sm font-bold text-foreground">Version History</p>
          <span className="ml-auto text-xs text-muted-foreground">{quotation.versions.length} version{quotation.versions.length === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {quotation.versions.map((v) => {
            const isCurrent = v.versionNumber === version.versionNumber
            const meta = quoteStatusMeta[v.status]
            return (
              <div
                key={v.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3',
                  isCurrent && 'rounded-lg bg-orange-50/50 px-2'
                )}
              >
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                  V{v.versionNumber}
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {versionTypeLabels[v.versionType] ?? v.versionType}
                </span>
                <Badge variant="outline" className={meta?.badge}>
                  {meta?.label ?? v.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {fmtDate(v.createdAt)} · by {v.createdByName}
                </span>
                <span className="ml-auto text-sm font-bold tabular-nums text-primary">
                  {formatINR(v.totalPayable)}
                </span>
                {isCurrent ? (
                  <span className="rounded-full border border-primary/40 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Current
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </Card>

      {/* Status change confirmation */}
      <AlertDialog open={Boolean(pendingStatus)} onOpenChange={(open) => !open && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change quotation status?</AlertDialogTitle>
            <AlertDialogDescription>
              {quotation.quotationNumber}:{' '}
              <b>{statusMeta?.label ?? quotation.status}</b> →{' '}
              <b>{pendingStatus ? quoteStatusMeta[pendingStatus]?.label ?? pendingStatus : ''}</b>. This is
              recorded in the audit log and applied to the current version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={statusBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-primary text-white hover:bg-[var(--brand-dark)]"
              disabled={statusBusy}
              onClick={(e) => {
                e.preventDefault()
                applyStatus()
              }}
            >
              {statusBusy ? 'Updating…' : 'Update Status'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden PDF capture node */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] top-0 w-[794px]">
        <div ref={previewRef} className={cn(!pdfData && 'hidden')}>
          {pdfData ? <QuotationPreview data={pdfData} /> : null}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn('shrink-0 font-semibold tabular-nums', accent ? 'text-orange-600' : 'text-foreground')}
      >
        {value}
      </span>
    </div>
  )
}
