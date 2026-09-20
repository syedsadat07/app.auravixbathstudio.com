'use client'

/**
 * AURAVIX BATH STUDIO — Quotation document preview (PDF capture target).
 *
 * Pure presentational component. Styled ONLY with inline styles + hex colors
 * (no Tailwind classes) so it renders identically when captured by
 * html2canvas-pro for the PDF export.
 */

import type { ReactNode } from 'react'
import { fmtDate } from '@/lib/format'
import { bathroomTypeLabels } from '@/lib/status'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  bathrooms: { name: string; type: string; length: number; width: number; areaSqft: number }[]
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
    bathrooms: { name: string; type: string; length: number; width: number; areaSqft: number }[]
    items: { section: string; name: string; quantity: number; unit: string; rate: number; amount: number }[]
  }
}

// ---------------------------------------------------------------------------
// Local formatting helpers (PDF-safe, no external deps)
// ---------------------------------------------------------------------------

const nfIN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function inr(n: number): string {
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
      length: b.length,
      width: b.width,
      areaSqft: b.areaSqft,
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
// Section labels
// ---------------------------------------------------------------------------

const SECTION_ORDER = ['TILES', 'FIXTURES', 'ADDONS', 'OTHER']
const SECTION_LABELS: Record<string, string> = {
  TILES: 'Tiles',
  FIXTURES: 'Fixtures & Fittings',
  ADDONS: 'Add-ons',
  OTHER: 'Other Services',
}

// ---------------------------------------------------------------------------
// Small internal building blocks
// ---------------------------------------------------------------------------

const FONT = "'Inter', Arial, Helvetica, sans-serif"
const MONO = "'SFMono-Regular', 'Menlo', 'Consolas', 'Courier New', monospace"
const CHARCOAL = '#26262b'
const ORANGE = '#f2620f'
const MUTED = '#8a8790'
const BODY = '#55525b'
const LINE = '#eeece8'

function SectionTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 2,
        textTransform: 'uppercase',
        color: color ?? ORANGE,
        marginBottom: 7,
      }}
    >
      {children}
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
  const groups = SECTION_ORDER.map((section) => ({
    section,
    label: SECTION_LABELS[section] ?? section,
    items: data.items.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0)

  const showDiscount = Number(data.discountAmount) > 0
  const discountHint =
    data.discountType === 'PERCENT' ? `${trimNum(data.discount)}%` : inr(data.discount)

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
            Bathroom Renovation
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: ORANGE, letterSpacing: 3, marginTop: 2 }}>
            QUOTATION
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
          background: '#faf9f7',
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
          <SectionTitle color={MUTED}>Customer</SectionTitle>
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
          <SectionTitle color={MUTED}>Quote Details</SectionTitle>
          <MetaRow label="Quotation #" value={data.quotationNumber} mono />
          <MetaRow label="Date" value={data.date} />
          <MetaRow label="Valid Until" value={data.validityDate} />
          <MetaRow label="Version" value={`V${data.versionNumber}`} />
          <MetaRow label="Prepared By" value={data.preparedBy} />
        </div>
      </div>

      {/* Bathrooms */}
      <div style={{ padding: '18px 24px 0' }}>
        <SectionTitle>Bathroom Details</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Bathroom', 'Type', 'Dimensions', 'Area'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: MUTED,
                    textAlign: i >= 2 ? 'right' : 'left',
                    padding: '6px 8px',
                    borderBottom: '1px solid #e5e2dc',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.bathrooms.map((b, idx) => (
              <tr key={`${b.name}-${idx}`}>
                <td style={{ padding: '7px 8px', fontSize: 11, fontWeight: 600, borderBottom: '1px solid #f0eeea' }}>
                  {b.name}
                </td>
                <td style={{ padding: '7px 8px', fontSize: 11, color: BODY, borderBottom: '1px solid #f0eeea' }}>
                  {b.type}
                </td>
                <td
                  style={{
                    padding: '7px 8px',
                    fontSize: 11,
                    color: BODY,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #f0eeea',
                  }}
                >
                  {trimNum(b.length)} ft × {trimNum(b.width)} ft
                </td>
                <td
                  style={{
                    padding: '7px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                    borderBottom: '1px solid #f0eeea',
                  }}
                >
                  {trimNum(b.areaSqft)} sq.ft
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            background: '#fdeee2',
            border: '1px solid #f6d7bb',
            borderRadius: 8,
            padding: '9px 12px',
          }}
        >
          <span style={{ fontSize: 11 }}>
            <b>Package: {data.packageName}</b>
            <span style={{ color: BODY }}>
              {' '}— {inr(data.packageRate)}/sq.ft × {trimNum(data.totalArea)} sq.ft
            </span>
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{inr(data.packageAmount)}</span>
        </div>
      </div>

      {/* Cost breakdown */}
      <div style={{ padding: '18px 24px 0' }}>
        <SectionTitle>Cost Breakdown</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Item', 'Qty', 'Unit', 'Rate', 'Amount'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: MUTED,
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '6px 8px',
                    borderBottom: '1px solid #e5e2dc',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentGroup
                key={g.section}
                label={g.label}
                items={g.items}
              />
            ))}
            {groups.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '10px 8px', fontSize: 11, color: MUTED, fontStyle: 'italic' }}>
                  No line items — package charges only.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div style={{ padding: '14px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ width: 320, maxWidth: '100%' }}>
          <SummaryRow label="Gross Value" value={inr(data.grossValue)} />
          {showDiscount ? (
            <SummaryRow
              label={`Discount (${discountHint})`}
              value={`− ${inr(data.discountAmount)}`}
              valueColor="#b23b0a"
            />
          ) : null}
          <SummaryRow label="Taxable Value" value={inr(data.taxableValue)} />
          <SummaryRow label={`GST (@ ${trimNum(data.gstRate)}%)`} value={inr(data.gstAmount)} />
          <div style={{ borderTop: `1px solid ${CHARCOAL}`, margin: '8px 0' }} />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: CHARCOAL,
              color: '#ffffff',
              borderRadius: 8,
              padding: '10px 14px',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>TOTAL PAYABLE</span>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{inr(data.totalPayable)}</span>
          </div>
        </div>
      </div>

      {/* Amount in words */}
      <div style={{ padding: '12px 24px 0', fontSize: 10.5 }}>
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
          Thank you for visiting AURAVIX BATH STUDIO.
        </span>
      </div>
    </div>
  )
}

/** Item group: subtle section header row + zebra item rows. */
function FragmentGroup({
  label,
  items,
}: {
  label: string
  items: QuotationPreviewData['items']
}) {
  return (
    <>
      <tr>
        <td
          colSpan={5}
          style={{
            background: '#f4f2ee',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: BODY,
            padding: '5px 8px',
          }}
        >
          {label}
        </td>
      </tr>
      {items.map((item, idx) => (
        <tr
          key={`${item.section}-${item.name}-${idx}`}
          style={{ background: idx % 2 === 1 ? '#faf9f7' : '#ffffff' }}
        >
          <td style={{ padding: '6px 8px', fontSize: 11 }}>{item.name}</td>
          <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {trimNum(item.quantity)}
          </td>
          <td style={{ padding: '6px 8px', fontSize: 11, color: BODY, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {item.unit}
          </td>
          <td style={{ padding: '6px 8px', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {inr(item.rate)}
          </td>
          <td style={{ padding: '6px 8px', fontSize: 11, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {inr(item.amount)}
          </td>
        </tr>
      ))}
    </>
  )
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '5px 0',
        fontSize: 11.5,
        borderBottom: `1px dashed ${LINE}`,
      }}
    >
      <span style={{ color: BODY }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? CHARCOAL, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
