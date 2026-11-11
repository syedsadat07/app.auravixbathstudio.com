'use client'

/**
 * AURAVIX BATH STUDIO — Quotation document preview (PDF capture target).
 *
 * Multi-page A4 portrait layout with explicit [data-pdf-page] containers.
 * Styled ONLY with inline styles + hex colors (no Tailwind classes) so it renders
 * identically when captured by html2canvas-pro for the PDF export or printed.
 *
 * Implements:
 * - A4 portrait pagination (width: 794px, height: 1123px per page).
 * - Pixel-perfect table column alignments (Description, Qty, Unit, Rate, Amount).
 * - Right-aligned numeric and currency values with tabular numbers.
 * - Bathroom 1 on Page 1; Bathroom 2, Totals & Summary on Page 2; Milestones, Terms & Sign-off on Page 3.
 * - Zero overlapping footers with centered "Page X of Y • Auravix Bath Studio Quotation".
 * - Zero orphaned headings; all section headers kept with their respective contents.
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
  brand?: string | null
  sku?: string | null
  imageUrl?: string | null
  quantity: number
  unit: string
  rate: number
  installCost?: number
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
  companyLogo?: string
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
  projectAddress?: string
  bathrooms: PreviewBathroom[]
  packageName: string
  packageRate: number
  packageAmount: number
  totalArea: number
  items: {
    section: string
    name: string
    brand?: string | null
    sku?: string | null
    imageUrl?: string | null
    quantity: number
    unit: string
    rate: number
    installCost?: number
    amount: number
  }[]
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
    items: {
      section: string
      name: string
      brand?: string | null
      sku?: string | null
      imageUrl?: string | null
      quantity: number
      unit: string
      rate: number
      installCost?: number
      amount: number
    }[]
  }
}

// ---------------------------------------------------------------------------
// Formatting Helpers
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
// Data Builder
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
    companyLogo: settings.company_logo || '/brand/logo.png',
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
    projectAddress:
      [quotation.customer.address, quotation.customer.city, quotation.customer.pincode]
        .filter(Boolean)
        .join(', ') || undefined,
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
    items: (v.items ?? []).map((i: any) => ({
      section: i.section,
      name: i.name,
      brand: i.brand ?? null,
      sku: i.sku ?? null,
      imageUrl: i.imageUrl ?? null,
      quantity: i.quantity,
      unit: i.unit,
      rate: i.rate,
      installCost: i.installCost ?? 0,
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
// Design Constants
// ---------------------------------------------------------------------------

const FONT = "'Inter', Arial, Helvetica, sans-serif"
const MONO = "'SFMono-Regular', 'Menlo', 'Consolas', 'Courier New', monospace"
const CHARCOAL = '#26262b'
const ORANGE = '#c79a63'
const MUTED = '#8a8790'
const BODY = '#55525b'
const LINE = '#eeece8'
const LIGHT_BG = '#faf9f7'

function SectionTitle({
  children,
  color,
  subtitle,
}: {
  children: ReactNode
  color?: string
  subtitle?: string
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: color ?? ORANGE,
        }}
      >
        {children}
      </div>
      {subtitle ? (
        <div style={{ fontSize: 9, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>{subtitle}</div>
      ) : null}
    </div>
  )
}

function MetaRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '2.5px 0',
        fontSize: 10.5,
      }}
    >
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

function PageRunningHeader({
  quotationNumber,
  versionNumber,
  subtitle,
}: {
  quotationNumber: string
  versionNumber: number
  subtitle?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 24px',
        background: '#faf6f0',
        borderBottom: `1px solid ${LINE}`,
        fontSize: 9,
        color: MUTED,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: CHARCOAL, letterSpacing: 1.5 }}>
          AURAVIX BATH STUDIO
        </span>
        <span style={{ color: ORANGE, fontWeight: 700 }}>•</span>
        <span>Combined Quotation</span>
      </div>
      <div style={{ fontWeight: 600, color: CHARCOAL }}>
        Ref: <span style={{ fontFamily: MONO, fontWeight: 700 }}>{quotationNumber}</span> (V
        {versionNumber})
        {subtitle ? <span style={{ color: MUTED, marginLeft: 8 }}>· {subtitle}</span> : null}
      </div>
    </div>
  )
}

function PageFooter({
  pageNumber,
  totalPages,
}: {
  pageNumber: number
  totalPages: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 11,
        left: 0,
        width: '100%',
        textAlign: 'center',
        fontSize: 8.5,
        color: '#8a8790',
        pointerEvents: 'none',
      }}
    >
      Page {pageNumber} of {totalPages} • Auravix Bath Studio Quotation
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bathroom Card Component
// ---------------------------------------------------------------------------

function BathroomCard({
  row,
  isContinued,
}: {
  row: {
    index: number
    name: string
    type: string
    unit: string
    length: number
    width: number
    height: number
    lenFt: number
    widFt: number
    floorArea: number
    wallArea: number
    materials: number
    fixtures: number
    labour: number
    additional: number
    subtotal: number
    breakdown?: BathroomBreakdownResult | null
  }
  isContinued?: boolean
}) {
  const bd = row.breakdown
  const isMm = row.unit === 'mm'
  const wallH = row.height || 10

  return (
    <div
      style={{
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#ffffff',
      }}
    >
      {/* Banner */}
      <div
        style={{
          background: '#faf6f0',
          borderBottom: `1px solid ${LINE}`,
          padding: '8px 12px',
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
              fontSize: 9.5,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 4,
            }}
          >
            BATHROOM {row.index}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: CHARCOAL }}>
            {row.name} {isContinued ? '– Continued' : ''}
          </span>
          <span
            style={{
              fontSize: 9,
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
          Bathroom Subtotal:{' '}
          <span style={{ color: ORANGE, fontSize: 12.5, fontWeight: 800 }}>
            {inr(row.subtotal)}
          </span>
        </div>
      </div>

      {/* Measurements Box & Formulas */}
      <div
        style={{
          padding: '8px 12px',
          background: '#fcfbf9',
          borderBottom: `1px solid ${LINE}`,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          fontSize: 10,
        }}
      >
        <div>
          <span
            style={{
              color: MUTED,
              display: 'block',
              fontSize: 8.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Entered Dimensions ({row.unit})
          </span>
          <span style={{ fontWeight: 700, fontSize: 11 }}>
            {trimNum(row.length)} {row.unit} (L) × {trimNum(row.width)} {row.unit} (W) ×{' '}
            {trimNum(wallH)} {row.unit} (H)
          </span>
          {isMm ? (
            <span style={{ color: MUTED, display: 'block', fontSize: 8.5 }}>
              Equiv: {trimNum(row.lenFt)} ft × {trimNum(row.widFt)} ft
            </span>
          ) : null}
        </div>

        <div>
          <span
            style={{
              color: MUTED,
              display: 'block',
              fontSize: 8.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Floor Area (sq.ft)
          </span>
          <span style={{ fontWeight: 800, color: ORANGE, fontSize: 11.5 }}>
            {trimNum(row.floorArea)} sq.ft
          </span>
          <span style={{ color: MUTED, display: 'block', fontSize: 8.5 }}>
            {isMm
              ? `${trimNum(row.length)} × ${trimNum(row.width)} mm / 92,903.04`
              : `${trimNum(row.length)} ft × ${trimNum(row.width)} ft`}
          </span>
        </div>

        <div>
          <span
            style={{
              color: MUTED,
              display: 'block',
              fontSize: 8.5,
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Wall Tiling Area (sq.ft)
          </span>
          <span style={{ fontWeight: 800, color: CHARCOAL, fontSize: 11.5 }}>
            {trimNum(row.wallArea)} sq.ft
          </span>
          <span style={{ color: MUTED, display: 'block', fontSize: 8.5 }}>
            2 × (L + W) × Height{' '}
            {bd?.openingsAreaSqft ? `− ${trimNum(bd.openingsAreaSqft)} openings` : ''}
          </span>
        </div>
      </div>

      {/* Items Breakdown Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10 }}>
        <colgroup>
          <col style={{ width: '48%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '15%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f4f2ee', borderBottom: `1px solid ${LINE}` }}>
            <th
              style={{
                textAlign: 'left',
                padding: '5px 12px',
                fontSize: 8.5,
                fontWeight: 700,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              Breakdown Category &amp; Item
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '5px 8px',
                fontSize: 8.5,
                fontWeight: 700,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              Qty
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '5px 8px',
                fontSize: 8.5,
                fontWeight: 700,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              Unit
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '5px 8px',
                fontSize: 8.5,
                fontWeight: 700,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              Rate
            </th>
            <th
              style={{
                textAlign: 'right',
                padding: '5px 12px',
                fontSize: 8.5,
                fontWeight: 700,
                color: MUTED,
                textTransform: 'uppercase',
              }}
            >
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 1. Tile requirements */}
          <tr style={{ background: '#faf9f7' }}>
            <td
              colSpan={5}
              style={{
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: 9,
                color: ORANGE,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              • Tile Requirements (Floor &amp; Wall Area)
            </td>
          </tr>
          {bd?.tiles && bd.tiles.length > 0 ? (
            bd.tiles.map((t, ti) => (
              <tr key={`t-${ti}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                <td style={{ padding: '4.5px 12px' }}>{t.name}</td>
                <td
                  style={{
                    padding: '4.5px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(t.quantity)}
                </td>
                <td style={{ padding: '4.5px 8px', textAlign: 'right', color: MUTED }}>{t.unit}</td>
                <td
                  style={{
                    padding: '4.5px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(t.rate)}
                </td>
                <td
                  style={{
                    padding: '4.5px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(t.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
              <td style={{ padding: '4.5px 12px' }}>
                Vitrified Floor &amp; Ceramic Wall Tiles Specification
              </td>
              <td
                style={{
                  padding: '4.5px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {trimNum(row.floorArea + row.wallArea)}
              </td>
              <td style={{ padding: '4.5px 8px', textAlign: 'right', color: MUTED }}>sq.ft</td>
              <td
                style={{
                  padding: '4.5px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(Math.round(row.materials / Math.max(1, row.floorArea + row.wallArea)))}
              </td>
              <td
                style={{
                  padding: '4.5px 12px',
                  textAlign: 'right',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.materials)}
              </td>
            </tr>
          )}

          {/* 2. Fixtures and fittings */}
          <tr style={{ background: '#faf9f7' }}>
            <td
              colSpan={5}
              style={{
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: 9,
                color: CHARCOAL,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              • Fixtures and Fittings
            </td>
          </tr>
          {bd?.fixtures && bd.fixtures.length > 0 ? (
            bd.fixtures.map((f, fi) => (
              <tr key={`f-${fi}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                <td style={{ padding: '4.5px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {f.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.imageUrl}
                        alt={f.name}
                        crossOrigin="anonymous"
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 3,
                          objectFit: 'cover',
                          border: '1px solid #e0ded9',
                          flexShrink: 0,
                          background: '#ffffff',
                        }}
                      />
                    ) : null}
                    <div>
                      <div style={{ fontWeight: 600, color: CHARCOAL }}>{f.name}</div>
                      {f.brand || f.sku ? (
                        <div style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>
                          {[f.brand && `Brand: ${f.brand}`, f.sku && `SKU: ${f.sku}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td
                  style={{
                    padding: '4.5px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(f.quantity)}
                </td>
                <td style={{ padding: '4.5px 8px', textAlign: 'right', color: MUTED }}>{f.unit}</td>
                <td
                  style={{
                    padding: '4.5px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(f.rate)}
                </td>
                <td
                  style={{
                    padding: '4.5px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(f.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
              <td style={{ padding: '4.5px 12px' }}>
                <div style={{ fontWeight: 600, color: CHARCOAL }}>
                  Sanitaryware, Vanity, Basin, Diverter &amp; Shower Fittings
                </div>
                <div style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>
                  Premium Ceramic &amp; Brass Fixtures Specification
                </div>
              </td>
              <td
                style={{
                  padding: '4.5px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                1
              </td>
              <td style={{ padding: '4.5px 8px', textAlign: 'right', color: MUTED }}>set</td>
              <td
                style={{
                  padding: '4.5px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.fixtures)}
              </td>
              <td
                style={{
                  padding: '4.5px 12px',
                  textAlign: 'right',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.fixtures)}
              </td>
            </tr>
          )}

          {/* 3. Accessories */}
          {bd?.accessories && bd.accessories.length > 0 ? (
            <>
              <tr style={{ background: '#faf9f7' }}>
                <td
                  colSpan={5}
                  style={{
                    padding: '4px 12px',
                    fontWeight: 700,
                    fontSize: 9,
                    color: CHARCOAL,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                  }}
                >
                  • Accessories
                </td>
              </tr>
              {bd.accessories.map((a, ai) => (
                <tr key={`a-${ai}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                  <td style={{ padding: '4px 12px' }}>{a.name}</td>
                  <td
                    style={{
                      padding: '4px 8px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {trimNum(a.quantity)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: MUTED }}>{a.unit}</td>
                  <td
                    style={{
                      padding: '4px 8px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(a.rate)}
                  </td>
                  <td
                    style={{
                      padding: '4px 12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(a.amount)}
                  </td>
                </tr>
              ))}
            </>
          ) : null}

          {/* 4. Labour charges */}
          <tr style={{ background: '#faf9f7' }}>
            <td
              colSpan={5}
              style={{
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: 9,
                color: CHARCOAL,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              • Labour Charges
            </td>
          </tr>
          {bd?.labour && bd.labour.length > 0 ? (
            bd.labour.map((l, li) => (
              <tr key={`l-${li}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                <td style={{ padding: '4px 12px' }}>{l.name}</td>
                <td
                  style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(l.quantity)}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: MUTED }}>{l.unit}</td>
                <td
                  style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(l.rate)}
                </td>
                <td
                  style={{
                    padding: '4px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(l.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
              <td style={{ padding: '4px 12px' }}>
                Plumbing, Tiling &amp; Electrical Installation Labour
              </td>
              <td
                style={{
                  padding: '4px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                1
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: MUTED }}>lot</td>
              <td
                style={{
                  padding: '4px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.labour)}
              </td>
              <td
                style={{
                  padding: '4px 12px',
                  textAlign: 'right',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.labour)}
              </td>
            </tr>
          )}

          {/* 5. Additional work */}
          <tr style={{ background: '#faf9f7' }}>
            <td
              colSpan={5}
              style={{
                padding: '4px 12px',
                fontWeight: 700,
                fontSize: 9,
                color: CHARCOAL,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
              }}
            >
              • Additional Work
            </td>
          </tr>
          {bd?.additionalWork && bd.additionalWork.length > 0 ? (
            bd.additionalWork.map((ad, adi) => (
              <tr key={`ad-${adi}`} style={{ borderBottom: `1px solid #f2f0eb` }}>
                <td style={{ padding: '4px 12px' }}>{ad.name}</td>
                <td
                  style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(ad.quantity)}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: MUTED }}>{ad.unit}</td>
                <td
                  style={{
                    padding: '4px 8px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(ad.rate)}
                </td>
                <td
                  style={{
                    padding: '4px 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(ad.amount)}
                </td>
              </tr>
            ))
          ) : (
            <tr style={{ borderBottom: `1px solid #f2f0eb` }}>
              <td style={{ padding: '4px 12px' }}>
                Epoxy Grouting, Waterproofing Barrier &amp; Debris Disposal
              </td>
              <td
                style={{
                  padding: '4px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                1
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right', color: MUTED }}>lot</td>
              <td
                style={{
                  padding: '4px 8px',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.additional)}
              </td>
              <td
                style={{
                  padding: '4px 12px',
                  textAlign: 'right',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {inr(row.additional)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Subtotal Footer Strip */}
      <div
        style={{
          background: '#f9f8f5',
          padding: '6px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: `1px solid ${LINE}`,
          fontSize: 9.5,
        }}
      >
        <span style={{ color: MUTED }}>
          Materials: {inr(row.materials)} · Fixtures: {inr(row.fixtures)} · Labour: {inr(row.labour)}{' '}
          · Additional: {inr(row.additional)}
        </span>
        <span style={{ fontWeight: 800, color: CHARCOAL }}>
          {row.name} Subtotal:{' '}
          <b style={{ color: ORANGE, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
            {inr(row.subtotal)}
          </b>
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main QuotationPreview Component
// ---------------------------------------------------------------------------

export default function QuotationPreview({ data }: { data: QuotationPreviewData }) {
  const showDiscount = Number(data.discountAmount) > 0
  const discountHint =
    data.discountType === 'PERCENT' ? `${trimNum(data.discount)}%` : inr(data.discount)

  // Calculate bathroom-wise summary for each bathroom
  const bathroomRows = data.bathrooms.map((b, idx) => {
    const bd = b.breakdown
    const unit = b.unit ?? 'ft'
    const isMm = unit === 'mm'
    const lenFt = isMm ? b.length / 304.8 : b.length
    const widFt = isMm ? b.width / 304.8 : b.width
    const floorArea = b.areaSqft || (isMm ? (b.length * b.width) / 92903.04 : b.length * b.width)
    const wallArea = b.wallAreaSqft ?? (bd?.wallAreaSqft ?? 0)

    const materials = bd
      ? bd.materialsTotal
      : Math.round((floorArea / (data.totalArea || 1)) * (data.packageAmount * 0.45))
    const fixtures = bd
      ? bd.fixturesTotal + bd.accessoriesTotal
      : Math.round((data.grossValue * 0.3) / data.bathrooms.length)
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

  // Standard 3-page layout for 2 bathrooms; scales dynamically if 1 or more
  const totalPages = Math.max(3, bathroomRows.length > 2 ? bathroomRows.length + 1 : 3)

  const pageContainerStyle: React.CSSProperties = {
    width: 794,
    height: 1123,
    minHeight: 1123,
    maxHeight: 1123,
    position: 'relative',
    background: '#ffffff',
    color: CHARCOAL,
    fontFamily: FONT,
    fontSize: 11.5,
    lineHeight: 1.45,
    boxSizing: 'border-box',
    overflow: 'hidden',
    paddingBottom: 42,
  }

  return (
    <div data-quote-root style={{ width: 794, margin: '0 auto' }}>
      {/* =================================================================== */}
      {/* PAGE 1: Header, Meta, and Bathroom 1 Breakdown                      */}
      {/* =================================================================== */}
      <div data-pdf-page="1" className="pdf-page" style={pageContainerStyle}>
        {/* Header band */}
        <div
          style={{
            background: CHARCOAL,
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {data.companyLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.companyLogo}
                alt="Auravix Logo"
                crossOrigin="anonymous"
                style={{
                  height: 40,
                  width: 'auto',
                  maxWidth: 150,
                  objectFit: 'contain',
                  borderRadius: 4,
                  background: '#ffffff',
                  padding: '3px 8px',
                }}
              />
            ) : null}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', letterSpacing: 4 }}>
                AURAVIX
              </div>
              <div
                style={{ fontSize: 9.5, fontWeight: 700, color: ORANGE, letterSpacing: 5.5, marginTop: 1 }}
              >
                BATH STUDIO
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                color: '#b9b7bd',
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Multi-Bathroom Renovation
            </div>
            <div
              style={{ fontSize: 16, fontWeight: 800, color: ORANGE, letterSpacing: 2.5, marginTop: 2 }}
            >
              COMBINED QUOTATION
            </div>
          </div>
        </div>

        {/* Company info strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '3px 14px',
            padding: '6px 24px',
            background: LIGHT_BG,
            borderBottom: `1px solid ${LINE}`,
            fontSize: 8.5,
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
            gap: 20,
            padding: '14px 24px',
            borderBottom: `1px solid ${LINE}`,
          }}
        >
          <div>
            <SectionTitle color={MUTED}>Customer Information</SectionTitle>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{data.customer.name}</div>
            <div style={{ fontSize: 10.5, color: BODY, marginTop: 1 }}>{data.customer.phone}</div>
            {data.customer.email ? (
              <div style={{ fontSize: 10.5, color: BODY }}>{data.customer.email}</div>
            ) : null}
            {data.customer.address ? (
              <div style={{ fontSize: 10.5, color: BODY, marginTop: 2 }}>{data.customer.address}</div>
            ) : null}
            {data.customer.city || data.customer.pincode ? (
              <div style={{ fontSize: 10.5, color: BODY }}>
                {[data.customer.city, data.customer.pincode].filter(Boolean).join(' - ')}
              </div>
            ) : null}
            {data.projectAddress ? (
              <div
                style={{
                  marginTop: 6,
                  padding: '5px 8px',
                  background: '#faf6f0',
                  borderLeft: `3px solid ${ORANGE}`,
                  borderRadius: '0 4px 4px 0',
                  fontSize: 10,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: CHARCOAL,
                    display: 'block',
                    fontSize: 8.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Project Site Address:
                </span>
                <span style={{ color: BODY }}>{data.projectAddress}</span>
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

        {/* Bathroom 1 Breakdown */}
        <div style={{ padding: '14px 24px 0' }}>
          <SectionTitle subtitle="Detailed breakdown capturing dimensions, unit, floor & wall area, materials, tiles, fixtures, accessories, labour and subtotal.">
            Separate Bathroom-Wise Breakdown
          </SectionTitle>

          {bathroomRows[0] && (
            <div style={{ marginTop: 6 }}>
              <BathroomCard row={bathroomRows[0]} />
            </div>
          )}
        </div>

        {/* Footer */}
        <PageFooter pageNumber={1} totalPages={totalPages} />
      </div>

      {/* =================================================================== */}
      {/* PAGE 2: Bathroom 2, Comparison Totals, and Combined Summary         */}
      {/* =================================================================== */}
      <div data-pdf-page="2" className="pdf-page" style={pageContainerStyle}>
        {/* Running Header */}
        <PageRunningHeader
          quotationNumber={data.quotationNumber}
          versionNumber={data.versionNumber}
          subtitle="Bathroom 2 & Project Totals"
        />

        {/* Bathroom 2 Breakdown */}
        <div style={{ padding: '12px 24px 0' }}>
          {bathroomRows[1] ? (
            <BathroomCard row={bathroomRows[1]} />
          ) : (
            <div style={{ padding: 12, color: MUTED }}>No second bathroom in this quotation.</div>
          )}
        </div>

        {/* 4. Comparison Totals Table */}
        <div style={{ padding: '16px 24px 0' }}>
          <SectionTitle subtitle="Consolidated comparison of material, fixture, labour, and additional work totals across all bathrooms.">
            4. Bathroom-Wise Material and Labour Totals
          </SectionTitle>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              fontSize: 10,
            }}
          >
            <colgroup>
              <col style={{ width: '25%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#f4f2ee', borderBottom: `2px solid ${LINE}` }}>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '6px 8px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  Bathroom
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: MUTED,
                  }}
                >
                  Floor Area
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: MUTED,
                  }}
                >
                  Wall Area
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  Materials &amp; Tiles
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  Fixtures &amp; Fittings
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  Labour Charges
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 6px',
                    fontSize: 8.5,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  Additional Work
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '6px 8px',
                    fontSize: 8.5,
                    fontWeight: 800,
                    color: ORANGE,
                  }}
                >
                  Bathroom Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {bathroomRows.map((r) => (
                <tr key={r.index} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                    {r.name}
                    <span style={{ display: 'block', fontSize: 8, color: MUTED, fontWeight: 500 }}>
                      {r.type} · {trimNum(r.length)} × {trimNum(r.width)} {r.unit}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      color: BODY,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {trimNum(r.floorArea)} sq.ft
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      color: BODY,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {trimNum(r.wallArea)} sq.ft
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(r.materials)}
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(r.fixtures)}
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(r.labour)}
                  </td>
                  <td
                    style={{
                      padding: '6px 6px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(r.additional)}
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      textAlign: 'right',
                      fontWeight: 800,
                      color: ORANGE,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {inr(r.subtotal)}
                  </td>
                </tr>
              ))}
              {/* Total Row */}
              <tr style={{ background: '#fdf9f4', borderTop: `2px solid ${ORANGE}` }}>
                <td style={{ padding: '7px 8px', fontWeight: 800, color: CHARCOAL }}>
                  Combined Total ({bathroomRows.length} Bathrooms)
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(sumFloorArea)} sq.ft
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {trimNum(sumWallArea)} sq.ft
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumMaterials)}
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumFixtures)}
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumLabour)}
                </td>
                <td
                  style={{
                    padding: '7px 6px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumAdditional)}
                </td>
                <td
                  style={{
                    padding: '7px 8px',
                    textAlign: 'right',
                    fontWeight: 800,
                    color: ORANGE,
                    fontSize: 11.5,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumSubtotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <PageFooter pageNumber={2} totalPages={totalPages} />
      </div>

      {/* =================================================================== */}
      {/* PAGE 3: Summary, Milestones, Terms, Sign-Off, and Thank You         */}
      {/* =================================================================== */}
      <div data-pdf-page="3" className="pdf-page" style={pageContainerStyle}>
        {/* Running Header */}
        <PageRunningHeader
          quotationNumber={data.quotationNumber}
          versionNumber={data.versionNumber}
          subtitle="Commercial Summary, Schedule & Sign-Off"
        />

        {/* 5, 6, 7, 8: Combined Quotation Summary (Reflowed to Page 3) */}
        <div style={{ padding: '12px 24px 0' }}>
          <SectionTitle subtitle="The combined total matches the sum of the individual bathroom amounts and explicitly defined project adjustments.">
            Combined Quotation Summary
          </SectionTitle>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.15fr 1fr',
              gap: 14,
              alignItems: 'start',
            }}
          >
            {/* Left: Project Scope Overview */}
            <div
              style={{
                background: '#ffffff',
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: CHARCOAL,
                  marginBottom: 6,
                }}
              >
                Project Scope &amp; Specifications
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                  fontSize: 9,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    background: LIGHT_BG,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #f0eee9',
                  }}
                >
                  <span
                    style={{
                      color: MUTED,
                      display: 'block',
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    Total Bathrooms
                  </span>
                  <span style={{ fontWeight: 800, color: CHARCOAL, fontSize: 10.5 }}>
                    {data.bathrooms.length} Bathrooms
                  </span>
                </div>
                <div
                  style={{
                    background: LIGHT_BG,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #f0eee9',
                  }}
                >
                  <span
                    style={{
                      color: MUTED,
                      display: 'block',
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    Combined Floor Area
                  </span>
                  <span style={{ fontWeight: 800, color: ORANGE, fontSize: 10.5 }}>
                    {trimNum(sumFloorArea || data.totalArea)} sq.ft
                  </span>
                </div>
                <div
                  style={{
                    background: LIGHT_BG,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #f0eee9',
                  }}
                >
                  <span
                    style={{
                      color: MUTED,
                      display: 'block',
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    Combined Wall Area
                  </span>
                  <span style={{ fontWeight: 800, color: CHARCOAL, fontSize: 10.5 }}>
                    {trimNum(sumWallArea)} sq.ft
                  </span>
                </div>
                <div
                  style={{
                    background: LIGHT_BG,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #f0eee9',
                  }}
                >
                  <span
                    style={{
                      color: MUTED,
                      display: 'block',
                      fontSize: 7.5,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                    }}
                  >
                    Scope Package
                  </span>
                  <span style={{ fontWeight: 800, color: CHARCOAL, fontSize: 10.5 }}>
                    {data.packageName || 'Comprehensive Renovation'}
                  </span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 8.5,
                  color: '#65625b',
                  lineHeight: 1.4,
                  borderTop: `1px dashed ${LINE}`,
                  paddingTop: 5,
                }}
              >
                Includes full waterproofing with 48-hr ponding test, anti-stain epoxy grouting,
                premium CP &amp; sanitary fittings, toughened glass shower enclosures, and 1-year
                Auravix workmanship warranty.
              </div>
            </div>

            {/* Right: Financial Breakdown Card */}
            <div
              style={{
                background: LIGHT_BG,
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '8px 12px',
              }}
            >
              {/* 5. Total project subtotal */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2.5px 0',
                  fontSize: 10,
                  borderBottom: `1px dashed ${LINE}`,
                }}
              >
                <span style={{ fontWeight: 600, color: CHARCOAL }}>5. Total Project Subtotal</span>
                <span
                  style={{
                    fontWeight: 700,
                    color: CHARCOAL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(sumSubtotal || data.grossValue)}
                </span>
              </div>

              {/* 6. Project-wide discounts */}
              {showDiscount ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '2.5px 0',
                    fontSize: 10,
                    borderBottom: `1px dashed ${LINE}`,
                  }}
                >
                  <span style={{ color: '#b23b0a' }}>6. Project-Wide Discount ({discountHint})</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: '#b23b0a',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    − {inr(data.discountAmount)}
                  </span>
                </div>
              ) : null}

              {/* Taxable value */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2.5px 0',
                  fontSize: 9.5,
                  color: BODY,
                }}
              >
                <span>Taxable Value</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {inr(data.taxableValue)}
                </span>
              </div>

              {/* 7. Applicable taxes with CGST & SGST */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '1.5px 0',
                  fontSize: 9,
                  color: MUTED,
                }}
              >
                <span>• CGST @ {trimNum(data.gstRate / 2)}%</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {inr(Math.round(data.gstAmount / 2))}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '1.5px 0',
                  fontSize: 9,
                  color: MUTED,
                }}
              >
                <span>• SGST @ {trimNum(data.gstRate / 2)}%</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {inr(Math.round(data.gstAmount / 2))}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2.5px 0',
                  fontSize: 10,
                  borderBottom: `1px dashed ${LINE}`,
                }}
              >
                <span style={{ color: BODY, fontWeight: 600 }}>
                  7. Total Applicable GST ({trimNum(data.gstRate)}%)
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: BODY,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(data.gstAmount)}
                </span>
              </div>

              {/* 8. Final quotation amount */}
              <div
                style={{
                  marginTop: 5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: CHARCOAL,
                  color: '#ffffff',
                  borderRadius: 6,
                  padding: '6px 10px',
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.2 }}>
                  8. FINAL QUOTATION AMOUNT
                </span>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 800,
                    color: '#ffffff',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(data.totalPayable)}
                </span>
              </div>

              <div style={{ fontSize: 7.5, color: MUTED, marginTop: 3, textAlign: 'right' }}>
                ✓ Matches sum of individual bathroom amounts &amp; project adjustments
              </div>
            </div>
          </div>

          {/* Amount in words */}
          <div
            style={{
              marginTop: 6,
              fontSize: 9.5,
              background: LIGHT_BG,
              border: `1px solid ${LINE}`,
              borderRadius: 6,
              padding: '5px 10px',
            }}
          >
            <span style={{ fontWeight: 700, color: CHARCOAL }}>Amount in Words: </span>
            <span style={{ fontStyle: 'italic', color: BODY }}>
              {amountInWords(data.totalPayable)}
            </span>
          </div>
        </div>

        {/* Milestone Payment Schedule */}
        <div style={{ padding: '12px 24px 0' }}>
          <SectionTitle subtitle="Standard structured renovation milestones linked to material procurement and project handover.">
            Milestone Payment Schedule
          </SectionTitle>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              marginTop: 4,
            }}
          >
            {/* Milestone 1: 10% */}
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '10px 12px',
                background: LIGHT_BG,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: ORANGE, textTransform: 'uppercase' }}>
                  Milestone 1 (10%)
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: CHARCOAL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(Math.round(data.totalPayable * 0.1))}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>
                Booking &amp; Design Advance
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>
                Due upon quotation sign-off &amp; technical slot confirmation
              </div>
            </div>

            {/* Milestone 2: 40% */}
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '10px 12px',
                background: LIGHT_BG,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: ORANGE, textTransform: 'uppercase' }}>
                  Milestone 2 (40%)
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: CHARCOAL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(Math.round(data.totalPayable * 0.4))}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>
                Procurement &amp; Civil Start
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>
                Due prior to tile, vanity &amp; sanitaryware dispatch to site
              </div>
            </div>

            {/* Milestone 3: 30% */}
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '10px 12px',
                background: LIGHT_BG,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: ORANGE, textTransform: 'uppercase' }}>
                  Milestone 3 (30%)
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: CHARCOAL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(Math.round(data.totalPayable * 0.3))}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>
                Rough-in &amp; Waterproofing
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>
                Due upon 48-hr ponding test &amp; concealed plumbing completion
              </div>
            </div>

            {/* Milestone 4: 20% */}
            <div
              style={{
                border: `1px solid ${LINE}`,
                borderRadius: 8,
                padding: '10px 12px',
                background: LIGHT_BG,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: ORANGE, textTransform: 'uppercase' }}>
                  Milestone 4 (20%)
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: CHARCOAL,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {inr(Math.round(data.totalPayable * 0.2))}
                </span>
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>
                Final Handover &amp; Snagging
              </div>
              <div style={{ fontSize: 8.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>
                Due upon fixture commissioning &amp; final client walkthrough
              </div>
            </div>
          </div>
        </div>

        {/* Notes (if present) */}
        {data.notes ? (
          <div style={{ padding: '14px 24px 0' }}>
            <SectionTitle color={MUTED}>Notes</SectionTitle>
            <div style={{ fontSize: 9.5, color: BODY, whiteSpace: 'pre-line' }}>{data.notes}</div>
          </div>
        ) : null}

        {/* Terms & Conditions + Bank Details */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.35fr 1fr',
            gap: 20,
            padding: '16px 24px 0',
          }}
        >
          <div>
            <SectionTitle color={MUTED}>Terms &amp; Conditions</SectionTitle>
            <div
              style={{
                fontSize: 9.5,
                color: '#65625b',
                whiteSpace: 'pre-line',
                lineHeight: 1.6,
              }}
            >
              {data.terms ||
                `1. This quotation is valid for 30 days from the date of issue.
2. 50% advance payment required to commence work; 40% on mid-stage inspection; 10% on handover.
3. Prices are based on standard site conditions. Any civil/carpentry modifications beyond scope will be charged separately.
4. Delivery & installation timeline: 2-3 weeks from design freeze and advance receipt.
5. Products remain AURAVIX property until full payment is received.
6. Warranty: 1 year on workmanship; manufacturer warranty on all fixtures as applicable.
7. Consultation fee of ₹299 is adjustable against the final project value.`}
            </div>
          </div>

          <div>
            <SectionTitle color={MUTED}>Bank &amp; Payment Details</SectionTitle>
            {data.bankDetails ? (
              <div style={{ fontSize: 9.5, color: BODY, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                {data.bankDetails}
              </div>
            ) : (
              <div style={{ fontSize: 9.5, color: BODY, lineHeight: 1.6 }}>
                <div>
                  AURAVIX STUDIO PVT LTD | HDFC Bank, Jayanagar Branch
                </div>
                <div>
                  A/C 50200 1234 5678 | IFSC HDFC0001234
                </div>
                {data.upi ? (
                  <div style={{ marginTop: 6 }}>
                    UPI: <b style={{ color: ORANGE }}>{data.upi}</b>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>
                    UPI: <b style={{ color: ORANGE }}>auravixbath@hdfcbank</b>
                  </div>
                )}
                <div style={{ fontSize: 8.5, color: MUTED, marginTop: 6 }}>
                  Official GST invoice issued on each milestone clearance.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Customer Approval & Formal Sign-Off */}
        <div style={{ padding: '16px 24px 0' }}>
          <SectionTitle subtitle="Sign-off constitutes formal authorization of the scope, product selections, schedule, and commercial terms.">
            Customer Approval &amp; Formal Sign-Off
          </SectionTitle>

          <div
            style={{
              background: '#faf9f7',
              border: `1px solid ${LINE}`,
              borderRadius: 8,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 9.5, color: BODY, lineHeight: 1.5, marginBottom: 14 }}>
              <b>Declaration:</b> I/We hereby approve and accept this quotation (Ref:{' '}
              <b>{data.quotationNumber}</b>, Version: <b>V{data.versionNumber}</b>) for the total
              payable amount of <b>{inr(data.totalPayable)}</b> ({amountInWords(data.totalPayable)}).
              I/We confirm that the bathroom dimensions, material selections, and milestone payment
              schedule meet our requirements.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Customer Signature Box */}
              <div
                style={{
                  border: `1px dashed ${LINE}`,
                  background: '#ffffff',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: MUTED,
                    textTransform: 'uppercase',
                  }}
                >
                  Customer Sign-off
                </div>
                <div
                  style={{
                    height: 52,
                    borderBottom: `1px solid ${LINE}`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 8.5, color: '#c4c2be' }}>
                    Customer Signature / Digital Stamp
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  {data.customer.name}
                </div>
                <div style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>
                  Date: ________________________
                </div>
              </div>

              {/* Auravix Representative Box */}
              <div
                style={{
                  border: `1px dashed ${LINE}`,
                  background: '#ffffff',
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: MUTED,
                    textTransform: 'uppercase',
                  }}
                >
                  Auravix Bath Studio Signatory
                </div>
                <div
                  style={{
                    height: 52,
                    borderBottom: `1px solid ${LINE}`,
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 8.5, color: '#c4c2be' }}>
                    Authorized Signatory Signature &amp; Seal
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    color: CHARCOAL,
                  }}
                >
                  {data.preparedBy || 'Authorized Representative'}
                </div>
                <div style={{ fontSize: 8.5, color: MUTED, marginTop: 1 }}>
                  Date: {data.date}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Thank You Banner */}
        <div
          style={{
            margin: '18px 24px 0',
            background: '#fdeee2',
            borderTop: `3px solid ${ORANGE}`,
            padding: '10px 24px',
            textAlign: 'center',
            borderRadius: '0 0 6px 6px',
          }}
        >
          <span style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 10.5, color: CHARCOAL }}>
            Thank you for choosing AURAVIX BATH STUDIO.
          </span>
        </div>

        {/* Footer */}
        <PageFooter pageNumber={3} totalPages={totalPages} />
      </div>
    </div>
  )
}
