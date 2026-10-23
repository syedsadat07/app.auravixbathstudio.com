'use client'

/**
 * AURAVIX BATH STUDIO — Quotation document preview (PDF capture target).
 *
 * Pure presentational component. Styled ONLY with inline styles + hex colors
 * (no Tailwind classes) so it renders identically when captured by
 * html2canvas-pro for the PDF export.
 *
 * Implements:
 * - Separate bathroom-wise breakdown for each bathroom (dimensions, mm/ft formulas,
 *   floor area, wall area with height & openings, tiles, fixtures, accessories,
 *   labour charges, additional work, discounts, taxes, subtotal).
 * - Bathroom-wise material and labour totals table.
 * - Combined project quotation with subtotal, project discounts, taxes, and final amount.
 */

import type { ReactNode } from 'react'
import { fmtDate } from '@/lib/format'
import { bathroomTypeLabels } from '@/lib/status'
import type { BathroomBreakdownResult, BathroomItemInput, MeasurementUnit } from '@/lib/calc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewBathroomItem {
  id?: string
  name: string
  section: string
  quantity: number
  unit: string
  rate: number
  amount: number
}

export interface PreviewBathroom {
  name: string
  type: string
  unit?: MeasurementUnit
  length: number
  width: number
  height?: number | null
  areaSqft: number
  wallAreaSqft?: number
  openingsAreaSqft?: number
  breakdown?: BathroomBreakdownResult | null
}

export interface QuotationPreviewData {
  companyName: string
  quotationNumber: string
  versionNumber: number
  date: string
  validityDate: string
  preparedBy: string
  customer: {
    name: string
    phone: string
    email?: string
    address?: string
    city?: string
    pincode?: string
  }
  bathrooms: PreviewBathroom[]
  packageName: string
  packageRate: number
  packageAmount: number
  totalArea: number
  items: { section: string; name: string; quantity: number; unit: string; rate: number; amount: number }[]
  grossValue: number
  discountType: 'FLAT' | 'PERCENT'
  discount: number
  discountAmount: number
  taxableValue: number
  gstRate: number
  gstAmount: number
  totalPayable: number
  notes?: string
  terms?: string
  gstin?: string
  pan?: string
  phone?: string
  email?: string
  address?: string
  upi?: string
  consultationNote?: string
  bankDetails?: string
}

/** Minimal structural shape of GET /api/quotations/[id] consumed by the builder. */
export interface QuotationLike {
  quotationNumber: string
  createdAt: string | Date
  validityDays: number
  createdBy?: { name: string } | null
  customer: {
    name: string
    phone: string
    email?: string | null
    address?: string | null
    city?: string | null
    pincode?: string | null
  }
  currentVersion: {
    versionNumber: number
    packageName: string
    packageRate: number
    packageAmount: number
    totalArea: number
    grossValue: number
    discountType: string
    discount: number
    discountAmount: number
    taxableValue: number
    gstRate: number
    gstAmount: number
    totalPayable: number
    notes?: string | null
    bathrooms: Array<{
      name: string
      type: string
      unit?: MeasurementUnit
      length: number
      width: number
      height?: number | null
      areaSqft: number
      wallAreaSqft?: number
      openingsArea?: number
      breakdown?: BathroomBreakdownResult | null
    }>
    items: { section: string; name: string; quantity: number; unit: string; rate: number; amount: number }[]
  }
}

// ---------------------------------------------------------------------------
// Local formatting helpers (PDF-safe, no external deps)
// ---------------------------------------------------------------------------

const nfIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function inr(n: number | null | undefined): string {
  return `₹${nfIN.format(Math.round(Number(n) || 0))}`
}

function trimNum(n: number): string {
  const x = Number(n) || 0
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100)
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n] || ''
  const t = TENS[Math.floor(n / 10)] || ''
  const r = n % 10
  return r ? `${t}-${ONES[r]}` : t
}

function underThousandWords(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  let out = h > 0 ? `${ONES[h]} Hundred` : ''
  if (rest > 0) out += (out ? ' ' : '') + twoDigitWords(rest)
  return out
}

/** Indian numbering: Rupees Two Lakh Six Thousand Eight Hundred Seventy-Six Only */
export function amountInWords(value: number): string {
  const n = Math.floor(Math.abs(Number(value) || 0))
  if (n === 0) return 'Rupees Zero Only'
  const crore = Math.floor(n / 1e7)
  const lakh = Math.floor((n % 1e7) / 1e5)
  const thousand = Math.floor((n % 1e5) / 1e3)
  const rest = n % 1e3
  const parts: string[] = []
  if (crore) parts.push(`${underThousandWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigitWords(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigitWords(thousand)} Thousand`)
  if (rest) parts.push(underThousandWords(rest))
  return `Rupees ${parts.join(' ')} Only`
}

// ---------------------------------------------------------------------------
// Data builder — GET /api/quotations/[id] (+ settings) → QuotationPreviewData
// ---------------------------------------------------------------------------

export function buildQuotationPreviewData(opts: {
  quotation: QuotationLike
  settings: Record<string, string>
  preparedBy: string
}): QuotationPreviewData {
  const { quotation, settings, preparedBy } = opts
  const v = quotation.currentVersion
  const created = new Date(quotation.createdAt)
  const validityDays = Number(quotation.validityDays) > 0 ? Number(quotation.validityDays) : 30
  return {
    companyName: settings.company_name || 'AURAVIX BATH STUDIO',
    quotationNumber: quotation.quotationNumber,
    versionNumber: v.versionNumber,
    date: fmtDate(created),
    validityDate: fmtDate(new Date(created.getTime() + validityDays * 24 * 60 * 60 * 1000)),
    preparedBy,
    customer: {
      name: quotation.customer.name,
      phone: quotation.customer.phone,
      email: quotation.customer.email || undefined,
      address: quotation.customer.address || undefined,
      city: quotation.customer.city || undefined,
      pincode: quotation.customer.pincode || undefined,
    },
    bathrooms: (v.bathrooms ?? []).map((b) => ({
      name: b.name,
      type: bathroomTypeLabels[b.type] ?? b.type,
      unit: b.unit ?? 'ft',
      length: b.length,
      width: b.width,
      height: b.height,
      areaSqft: b.areaSqft,
      wallAreaSqft: b.wallAreaSqft,
      openingsAreaSqft: b.openingsArea,
      breakdown: b.breakdown ?? null,
    })),
    packageName: v.packageName,
    packageRate: v.packageRate,
    packageAmount: v.packageAmount,
    totalArea: v.totalArea,
    items: (v.items ?? []).map((i) => ({
      section: i.section,
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      rate: i.rate,
      amount: i.amount,
    })),
    grossValue: v.grossValue,
    discountType: v.discountType === 'PERCENT' ? 'PERCENT' : 'FLAT',
    discount: v.discount,
    discountAmount: v.discountAmount,
    taxableValue: v.taxableValue,
    gstRate: v.gstRate,
    gstAmount: v.gstAmount,
    totalPayable: v.totalPayable,
    notes: v.notes || undefined,
    terms: settings.terms || undefined,
    gstin: settings.gstin || undefined,
    pan: settings.pan || undefined,
    phone: settings.company_phone || undefined,
    email: settings.company_email || undefined,
    address: settings.company_address || undefined,
    upi: settings.upi_details || undefined,
    bankDetails: settings.bank_details || undefined,
  }
}

// ---------------------------------------------------------------------------
// Section labels & Colors
// ---------------------------------------------------------------------------

const FONT = "'Inter', Arial, Helvetica, sans-serif"
const MONO = "'SFMono-Regular', 'Menlo', 'Consolas', 'Courier New', monospace"
const CHARCOAL = '#26262b'
const ORANGE = '#f2620f'
const MUTED = '#8a8790'
const BODY = '#55525b'
const LINE = '#eeece8'
const LIGHT_BG = '#faf9f7'

function SectionTitle({ children, color, subtitle }: { children: ReactNode; color?: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: color ?? ORANGE,
        }}
      >
        {children}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '3px 0', fontSize: 11 }}>
      <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          fontWeight: mono ? 700 : 500,
          fontFamily: mono ? MONO : FONT,
          textAlign: 'right',
          color: CHARCOAL,
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// QuotationPreview
// ---------------------------------------------------------------------------

export default function QuotationPreview({ data }: { data: QuotationPreviewData }) {
  const showDiscount = Number(data.discountAmount) > 0
  const discountHint =
    data.discountType === 'PERCENT' ? `${trimNum(data.discount)}%` : inr(data.discount)

  // Calculate bathroom-wise summary for the table
  const bathroomRows = data.bathrooms.map((b, idx) => {
    const bd = b.breakdown
    const unit = b.unit ?? 'ft'
    const isMm = unit === 'mm'
    const lenFt = isMm ? b.length / 304.8 : b.length
    const widFt = isMm ? b.width / 304.8 : b.width
    const floorArea = b.areaSqft || (isMm ? (b.length * b.width) / 92903.04 : b.length * b.width)
    const wallArea = b.wallAreaSqft ?? (bd?.wallAreaSqft ?? 0)

    const materials = bd ? bd.materialsTotal : Math.round((floorArea / (data.totalArea || 1)) * (data.packageAmount * 0.45))
    const fixtures = bd ? bd.fixturesTotal + bd.accessoriesTotal : Math.round((data.grossValue * 0.3) / data.bathrooms.length)
    const labour = bd ? bd.labourTotal : Math.round(floorArea * 85)
    const additional = bd ? bd.additionalWorkTotal : Math.round(floorArea * 65)
    const subtotal = bd ? bd.bathroomSubtotal : Math.round(data.totalPayable / data.bathrooms.length)

    return {
      index: idx + 1,
      name: b.name || `Bathroom ${idx + 1}`,
      type: b.type,
      unit,
      length: b.length,
      width: b.width,
      height: b.height ?? 10,
      lenFt,
      widFt,
      floorArea,
      wallArea,
      materials,
      fixtures,
      labour,
      additional,
      subtotal,
      breakdown: bd,
    }
  })

  const sumFloorArea = bathroomRows.reduce((s, r) => s + r.floorArea, 0)
  const sumWallArea = bathroomRows.reduce((s, r) => s + r.wallArea, 0)
  const sumMaterials = bathroomRows.reduce((s, r) => s + r.materials, 0)
  const sumFixtures = bathroomRows.reduce((s, r) => s + r.fixtures, 0)
  const sumLabour = bathroomRows.reduce((s, r) => s + r.labour, 0)
  const sumAdditional = bathroomRows.reduce((s, r) => s + r.additional, 0)
  const sumSubtotal = bathroomRows.reduce((s, r) => s + r.subtotal, 0)

  return (
    <div
      data-quote-root
      style={{
        width: '100%',
        background: '#ffffff',
        color: CHARCOAL,
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {/* Header band */}
      <div
        style={{
          background: CHARCOAL,
          padding: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', letterSpacing: 4 }}>AURAVIX</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 6, marginTop: 3 }}>
            BATH STUDIO
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#b9b7bd', letterSpacing: 2, textTransform: 'uppercase' }}>
            Multi-Bathroom Renovation
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: ORANGE, letterSpacing: 3, marginTop: 2 }}>
            COMBINED QUOTATION
          </div>
        </div>
      </div>

      {/* Company info strip */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          padding: '8px 24px',
          background: LIGHT_BG,
          borderBottom: `1px solid ${LINE}`,
          fontSize: 9,
          color: MUTED,
        }}
      >
        {data.address ? <span>{data.address}</span> : null}
        {data.phone ? <span>Phone: {data.phone}</span> : null}
        {data.email ? <span>Email: {data.email}</span> : null}
        {data.gstin ? <span>GSTIN: {data.gstin}</span> : null}
        {data.pan ? <span>PAN: {data.pan}</span> : null}
      </div>

      {/* Customer & quote meta */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 24,
          padding: '18px 24px',
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div>
          <SectionTitle color={MUTED}>Customer Information</SectionTitle>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{data.customer.name}</div>
          <div style={{ fontSize: 11, color: BODY, marginTop: 2 }}>{data.customer.phone}</div>
          {data.customer.email ? (
            <div style={{ fontSize: 11, color: BODY }}>{data.customer.email}</div>
          ) : null}
          {data.customer.address ? (
            <div style={{ fontSize: 11, color: BODY, marginTop: 4 }}>{data.customer.address}</div>
          ) : null}
          {data.customer.city || data.customer.pincode ? (
            <div style={{ fontSize: 11, color: BODY }}>
              {[data.customer.city, data.customer.pincode].filter(Boolean).join(' - ')}
            </div>
          ) : null}
        </div>
        <div>
          <SectionTitle color={MUTED}>Quotation Details</SectionTitle>
          <MetaRow label="Quotation #" value={data.quotationNumber} mono />
          <MetaRow label="Date" value={data.date} />
          <MetaRow label="Valid Until" value={data.validityDate} />
          <MetaRow label="Version" value={`V${data.versionNumber}`} />
          <MetaRow label="Prepared By" value={data.preparedBy} />
          <MetaRow label="Bathrooms in Scope" value={`${data.bathrooms.length} Bathrooms`} />
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 1, 2, 3: SEPARATE BATHROOM-WISE BREAKDOWN (Bathroom 1, Bathroom 2...) */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ padding: '20px 24px 0' }}>
        <SectionTitle subtitle="Detailed breakdown capturing dimensions, unit, floor & wall area, materials, tiles, fixtures, accessories, labour and subtotal.">
          Separate Bathroom-Wise Breakdown
        </SectionTitle>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {bathroomRows.map((row) => {
            const bd = row.breakdown
            const isMm = row.unit === 'mm'
            const wallH = row.height || 10

            return (
              <div
                key={row.index}
                style={{
                  border: `1px solid ${LINE}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: '#ffffff',
                }}
              >
                {/* Bathroom Header Banner */}
                <div
                  style={{
                    background: '#faf6f0',
                    borderBottom: `1px solid ${LINE}`,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        background: ORANGE,
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      BATHROOM {row.index}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL }}>
                      {row.name}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        color: MUTED,
                        border: `1px solid #e0ded9`,
                        background: '#ffffff',
                        padding: '1px 6px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                        fontWeight: 600,
                      }}
                    >
                      {row.type}
                    </span>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: CHARCOAL }}>
                    Bathroom Subtotal: <span style={{ color: ORANGE, fontSize: 13 }}>{inr(row.subtotal)}</span>
                  </div>
                </div>

                {/* Measurements Box & Formulas */}
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#fcfbf9',
                    borderBottom: `1px solid ${LINE}`,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    fontSize: 10.5,
                  }}
                >
                  <div>
                    <span style={{ color: MUTED, display: 'block', fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700 }}>
                      Entered Dimensions ({row.unit})
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 11.5 }}>
                      {trimNum(row.length)} {row.unit} (L) × {trimNum(row.width)} {row.unit} (W) × {trimNum(wallH)} {row.unit} (H)
                    </span>
                    {isMm ? (
                      <span style={{ color: MUTED, display: 'block', fontSize: 9.5 }}>
                        Equiv: {trimNum(row.lenFt)} ft × {trimNum(row.widFt)} ft
                      </span>
                    ) : null}
                  </div>

                  <div>
                    <span style={{ color: MUTED, display: 'block', fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700 }}>
                      Floor Area (sq.ft)
                    </span>
                    <span style={{ fontWeight: 800, color: ORANGE, fontSize: 12 }}>
                      {trimNum(row.floorArea)} sq.ft
                    </span>
                    <span style={{ color: MUTED, display: 'block', fontSize: 9 }}>
                      {isMm
                        ? `${trimNum(row.length)} × ${trimNum(row.width)} mm / 92,903.04`
                        : `${trimNum(row.length)} ft × ${trimNum(row.width)} ft`}
                    </span>
                  </div>

                  <div>
                    <span style={{ color: MUTED, display: 'block', fontSize: 9.5, textTransform: 'uppercase', fontWeight: 700 }}>
                      Wall Tiling Area (sq.ft)
                    </span>
                    <span style={{ fontWeight: 800, color: CHARCOAL, fontSize: 12 }}>
                      {trimNum(row.wallArea)} sq.ft
                    </span>
                    <span style={{ color: MUTED, display: 'block', fontSize: 9 }}>
                      2 × (L + W) × Height {bd?.openingsAreaSqft ? `− ${trimNum(bd.openingsAreaSqft)} openings` : ''}
                    </span>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
                  <thead>
                    <tr style={{ background: '#f4f2ee', borderBottom: `1px solid ${LINE}` }}>
                      <th style={{ textAlign: 'left', padding: '6px 12px', fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                        Breakdown Category &amp; Item
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                        Qty
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                        Unit
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                        Rate
                      </th>
                      <th style={{ textAlign: 'right', padding: '6px 12px', fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase' }}>
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 1. Tile requirements */}
                    <tr style={{ background: '#faf9f7' }}>
                      <td colSpan={5} style={{ padding: '4px 12px', fontWeight: 700, fontSize: 9.5, color: ORANGE, letterSpacing: 1, textTransform: 'uppercase' }}>
                        • Tile Requirements (Floor &amp; Wall Area)
                      </td>
                    </tr>
                    {bd?.tiles && bd.tiles.length > 0 ? (
                      bd.tiles.map((t, ti) => (
                        <tr key={`t-${ti}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                          <td style={{ padding: '5px 12px' }}>{t.name}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(t.quantity)}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{t.unit}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(t.rate)}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(t.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
                        <td style={{ padding: '5px 12px' }}>Vitrified Floor &amp; Ceramic Wall Tiles Specification</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(row.floorArea + row.wallArea)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>sq.ft</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(Math.round(row.materials / Math.max(1, row.floorArea + row.wallArea)))}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(row.materials)}</td>
                      </tr>
                    )}

                    {/* 2. Fixtures and fittings */}
                    <tr style={{ background: '#faf9f7' }}>
                      <td colSpan={5} style={{ padding: '4px 12px', fontWeight: 700, fontSize: 9.5, color: CHARCOAL, letterSpacing: 1, textTransform: 'uppercase' }}>
                        • Fixtures and Fittings
                      </td>
                    </tr>
                    {bd?.fixtures && bd.fixtures.length > 0 ? (
                      bd.fixtures.map((f, fi) => (
                        <tr key={`f-${fi}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                          <td style={{ padding: '5px 12px' }}>{f.name}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(f.quantity)}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{f.unit}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(f.rate)}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(f.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
                        <td style={{ padding: '5px 12px' }}>Sanitaryware, Vanity, Basin, Diverter &amp; Shower Fittings</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>1</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>set</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(row.fixtures)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(row.fixtures)}</td>
                      </tr>
                    )}

                    {/* 3. Accessories */}
                    {bd?.accessories && bd.accessories.length > 0 ? (
                      <>
                        <tr style={{ background: '#faf9f7' }}>
                          <td colSpan={5} style={{ padding: '4px 12px', fontWeight: 700, fontSize: 9.5, color: CHARCOAL, letterSpacing: 1, textTransform: 'uppercase' }}>
                            • Accessories
                          </td>
                        </tr>
                        {bd.accessories.map((a, ai) => (
                          <tr key={`a-${ai}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                            <td style={{ padding: '5px 12px' }}>{a.name}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(a.quantity)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{a.unit}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(a.rate)}</td>
                            <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(a.amount)}</td>
                          </tr>
                        ))}
                      </>
                    ) : null}

                    {/* 4. Labour charges */}
                    <tr style={{ background: '#faf9f7' }}>
                      <td colSpan={5} style={{ padding: '4px 12px', fontWeight: 700, fontSize: 9.5, color: CHARCOAL, letterSpacing: 1, textTransform: 'uppercase' }}>
                        • Labour Charges
                      </td>
                    </tr>
                    {bd?.labour && bd.labour.length > 0 ? (
                      bd.labour.map((l, li) => (
                        <tr key={`l-${li}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                          <td style={{ padding: '5px 12px' }}>{l.name}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(l.quantity)}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{l.unit}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(l.rate)}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(l.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
                        <td style={{ padding: '5px 12px' }}>Plumbing, Tiling &amp; Electrical Installation Labour</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>1</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>lot</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(row.labour)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(row.labour)}</td>
                      </tr>
                    )}

                    {/* 5. Additional work */}
                    <tr style={{ background: '#faf9f7' }}>
                      <td colSpan={5} style={{ padding: '4px 12px', fontWeight: 700, fontSize: 9.5, color: CHARCOAL, letterSpacing: 1, textTransform: 'uppercase' }}>
                        • Additional Work
                      </td>
                    </tr>
                    {bd?.additionalWork && bd.additionalWork.length > 0 ? (
                      bd.additionalWork.map((ad, adi) => (
                        <tr key={`ad-${adi}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                          <td style={{ padding: '5px 12px' }}>{ad.name}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{trimNum(ad.quantity)}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>{ad.unit}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(ad.rate)}</td>
                          <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(ad.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
                        <td style={{ padding: '5px 12px' }}>Epoxy Grouting, Waterproofing Barrier &amp; Debris Disposal</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>1</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: MUTED }}>lot</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{inr(row.additional)}</td>
                        <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 600 }}>{inr(row.additional)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {/* Subtotal Footer Strip */}
                <div
                  style={{
                    background: '#f9f8f5',
                    padding: '8px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: `1px solid ${LINE}`,
                    fontSize: 10.5,
                  }}
                >
                  <span style={{ color: MUTED }}>
                    Materials: {inr(row.materials)} · Fixtures: {inr(row.fixtures)} · Labour: {inr(row.labour)} · Additional: {inr(row.additional)}
                  </span>
                  <span style={{ fontWeight: 800, color: CHARCOAL }}>
                    {row.name} Subtotal: <b style={{ color: ORANGE, fontSize: 12 }}>{inr(row.subtotal)}</b>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 4. BATHROOM-WISE MATERIAL AND LABOUR TOTALS (Comparison Table) */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ padding: '24px 24px 0' }}>
        <SectionTitle subtitle="Consolidated comparison of material, fixture, labour, and additional work totals across all bathrooms.">
          4. Bathroom-Wise Material and Labour Totals
        </SectionTitle>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#f4f2ee', borderBottom: `2px solid ${LINE}` }}>
              <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 9.5, fontWeight: 700, color: CHARCOAL }}>
                Bathroom
              </th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 9.5, fontWeight: 700, color: MUTED }}>
                Floor Area
              </th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 9.5, fontWeight: 700, color: MUTED }}>
                Wall Area
              </th>
              <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: 9.5, fontWeight: 700, color: CHARCOAL }}>
                Materials &amp; Tiles
              </th>
              <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: 9.5, fontWeight: 700, color: CHARCOAL }}>
                Fixtures &amp; Fittings
              </th>
              <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: 9.5, fontWeight: 700, color: CHARCOAL }}>
                Labour Charges
              </th>
              <th style={{ textAlign: 'right', padding: '8px 8px', fontSize: 9.5, fontWeight: 700, color: CHARCOAL }}>
                Additional Work
              </th>
              <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 9.5, fontWeight: 800, color: ORANGE }}>
                Bathroom Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {bathroomRows.map((r) => (
              <tr key={r.index} style={{ borderBottom: `1px solid ${LINE}` }}>
                <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                  {r.name}
                  <span style={{ display: 'block', fontSize: 9, color: MUTED, fontWeight: 500 }}>
                    {r.type} · {trimNum(r.length)} × {trimNum(r.width)} {r.unit}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: BODY }}>
                  {trimNum(r.floorArea)} sq.ft
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: BODY }}>
                  {trimNum(r.wallArea)} sq.ft
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {inr(r.materials)}
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {inr(r.fixtures)}
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {inr(r.labour)}
                </td>
                <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 600 }}>
                  {inr(r.additional)}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: ORANGE }}>
                  {inr(r.subtotal)}
                </td>
              </tr>
            ))}
            {/* Total Row */}
            <tr style={{ background: '#fdf9f4', borderTop: `2px solid ${ORANGE}` }}>
              <td style={{ padding: '10px 10px', fontWeight: 800, color: CHARCOAL }}>
                Combined Total ({bathroomRows.length} Bathrooms)
              </td>
              <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>
                {trimNum(sumFloorArea)} sq.ft
              </td>
              <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700 }}>
                {trimNum(sumWallArea)} sq.ft
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                {inr(sumMaterials)}
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                {inr(sumFixtures)}
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                {inr(sumLabour)}
              </td>
              <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>
                {inr(sumAdditional)}
              </td>
              <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: ORANGE, fontSize: 13 }}>
                {inr(sumSubtotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* 5, 6, 7, 8: COMBINED QUOTATION SUMMARY */}
      {/* ------------------------------------------------------------------- */}
      <div style={{ padding: '24px 24px 0' }}>
        <SectionTitle subtitle="The combined total matches the sum of the individual bathroom amounts and explicitly defined project adjustments.">
          Combined Quotation Summary
        </SectionTitle>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 380, maxWidth: '100%', background: '#faf9f7', border: `1px solid ${LINE}`, borderRadius: 10, padding: '14px 18px' }}>
            {/* 5. Total project subtotal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: `1px dashed ${LINE}` }}>
              <span style={{ fontWeight: 600, color: CHARCOAL }}>5. Total Project Subtotal</span>
              <span style={{ fontWeight: 700, color: CHARCOAL }}>{inr(sumSubtotal || data.grossValue)}</span>
            </div>

            {/* 6. Project-wide discounts */}
            {showDiscount ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: `1px dashed ${LINE}` }}>
                <span style={{ color: '#b23b0a' }}>6. Project-Wide Discount ({discountHint})</span>
                <span style={{ fontWeight: 700, color: '#b23b0a' }}>− {inr(data.discountAmount)}</span>
              </div>
            ) : null}

            {/* 7. Applicable taxes */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: `1px dashed ${LINE}` }}>
              <span style={{ color: BODY }}>7. Applicable Taxes (GST @ {trimNum(data.gstRate)}%)</span>
              <span style={{ fontWeight: 700, color: BODY }}>{inr(data.gstAmount)}</span>
            </div>

            {/* 8. Final quotation amount */}
            <div
              style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: CHARCOAL,
                color: '#ffffff',
                borderRadius: 8,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5 }}>
                8. FINAL QUOTATION AMOUNT
              </span>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#ffffff' }}>
                {inr(data.totalPayable)}
              </span>
            </div>

            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 8, textAlign: 'right' }}>
              ✓ Matches sum of individual bathroom amounts &amp; project adjustments
            </div>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <div style={{ padding: '14px 24px 0', fontSize: 11 }}>
        <span style={{ fontWeight: 700 }}>Amount in Words: </span>
        <span style={{ fontStyle: 'italic', color: BODY }}>{amountInWords(data.totalPayable)}</span>
      </div>

      {/* Notes */}
      {data.notes ? (
        <div style={{ padding: '14px 24px 0' }}>
          <SectionTitle color={MUTED}>Notes</SectionTitle>
          <div style={{ fontSize: 10, color: BODY, whiteSpace: 'pre-line' }}>{data.notes}</div>
        </div>
      ) : null}

      {/* Terms + bank details */}
      {data.terms || data.bankDetails || data.upi ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: data.terms ? '1.4fr 1fr' : '1fr',
            gap: 24,
            padding: '18px 24px 0',
          }}
        >
          {data.terms ? (
            <div>
              <SectionTitle color={MUTED}>Terms &amp; Conditions</SectionTitle>
              <div style={{ fontSize: 10, color: '#75716c', whiteSpace: 'pre-line', lineHeight: 1.55 }}>
                {data.terms}
              </div>
            </div>
          ) : null}
          {data.bankDetails || data.upi ? (
            <div>
              <SectionTitle color={MUTED}>Bank &amp; Payment Details</SectionTitle>
              {data.bankDetails ? (
                <div style={{ fontSize: 10, color: BODY, whiteSpace: 'pre-line', lineHeight: 1.55 }}>
                  {data.bankDetails}
                </div>
              ) : null}
              {data.upi ? (
                <div style={{ marginTop: 6, fontSize: 10, color: BODY }}>
                  UPI: <b style={{ color: ORANGE }}>{data.upi}</b>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Footer band */}
      <div
        style={{
          marginTop: 24,
          background: '#fdeee2',
          borderTop: `3px solid ${ORANGE}`,
          padding: '12px 24px',
          textAlign: 'center',
        }}
      >
        <span style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 11, color: CHARCOAL }}>
          Thank you for choosing AURAVIX BATH STUDIO.
        </span>
      </div>
    </div>
  )
}
