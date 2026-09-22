'use client'

/**
 * AURAVIX BATH STUDIO — Quotation Wizard (flagship flow).
 *
 * 8 steps: Customer → Bathroom → Package → Tiles → Fixtures → Add-ons → Cost → Preview.
 * Live summary is computed client-side with src/lib/calc.ts (preview only — the
 * server always recalculates final amounts from master data). The draft is
 * auto-saved to localStorage and cleared after a successful save.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Info,
  Loader2,
  Minus,
  Plus,
  Ruler,
  Save,
  Search,
  Send,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'

import { apiPost, useApi, useDebounced } from '@/lib/client'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import { calcAreaMaterialQuantity, calcQuotation, computeBathroomArea, round2 } from '@/lib/calc'
import { areaLabel, fmtDate, formatINR } from '@/lib/format'
import { bathroomTypeLabels, versionTypeLabels } from '@/lib/status'
import QuotationPreview, { type QuotationPreviewData } from '@/components/quotation/quotation-preview'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BathroomDraft {
  name: string
  type: string
  length: string
  width: string
  height: string
}

interface DraftState {
  customerMode: 'lead' | 'new'
  leadId: string | null
  leadCustomerId: string | null
  leadLabel: string
  customerId: string | null
  name: string
  phone: string
  email: string
  address: string
  city: string
  pincode: string
  bathrooms: BathroomDraft[]
  packageId: string | null
  tiles: string[]
  fixtures: { materialId: string; quantity: number }[]
  addons: { materialId: string; quantity: number }[]
  consultation: boolean
  discountType: 'FLAT' | 'PERCENT'
  discount: string
  notes: string
}

type Mutate = (patch: Partial<DraftState> | ((prev: DraftState) => DraftState)) => void

interface MaterialRow {
  id: string
  name: string
  brand: string | null
  unit: string
  price: number
  coverage: number | null
  wastagePercent: number | null
  imageUrl: string | null
  quantityRule: string
  category: { id: string; name: string }
}

interface PackageRow {
  id: string
  name: string
  pricePerSqft: number
  description: string | null
  duration: string | null
  status: string
}

interface LeadHit {
  id: string
  leadNumber: string
  status: string
  customer: {
    id: string
    name: string
    phone: string
    email?: string | null
    address?: string | null
    city?: string | null
    pincode?: string | null
  }
}

interface QuoteItemRow {
  section: 'TILES' | 'FIXTURES' | 'ADDONS' | 'OTHER'
  name: string
  quantity: number
  unit: string
  rate: number
  amount: number
}

interface SaveResponse {
  quotation: { id: string; quotationNumber: string; versionNumber: number }
  notice?: string
}

const emptyBathroom = (n: number): BathroomDraft => ({
  name: `Bathroom ${n}`,
  type: 'COMMON',
  length: '',
  width: '',
  height: '',
})

const defaultDraft = (): DraftState => ({
  customerMode: 'lead',
  leadId: null,
  leadCustomerId: null,
  leadLabel: '',
  customerId: null,
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  pincode: '',
  bathrooms: [emptyBathroom(1)],
  packageId: null,
  tiles: [],
  fixtures: [],
  addons: [],
  consultation: false,
  discountType: 'FLAT',
  discount: '',
  notes: '',
})

const STEPS = [
  { id: 'customer', label: 'Customer' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'package', label: 'Package' },
  { id: 'tiles', label: 'Tiles' },
  { id: 'fixtures', label: 'Fixtures' },
  { id: 'addons', label: 'Add-ons' },
  { id: 'cost', label: 'Cost' },
  { id: 'preview', label: 'Preview' },
] as const

/** categories excluded from the Fixtures step (they have dedicated steps) */
const NON_FIXTURE_CATEGORIES = new Set(['Tiles', 'Add-ons'])
const MAX_BATHROOMS = 6
const MAX_QTY = 99

/** Strict positive-number parse for dimension/amount inputs. */
function toNum(v: string | null | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export default function QuotationWizardView() {
  const { params, navigate } = useNav()
  const { user, isSuperAdmin } = useAuth()

  const editing = Boolean(params.quotationId)
  const draftKey = `quote-draft-${params.quotationId || 'new'}`

  // ----- master data -----
  const { data: packagesData, loading: packagesLoading } = useApi<{ packages: PackageRow[] }>('/api/packages')
  const { data: materialsData, loading: materialsLoading } = useApi<{ materials: MaterialRow[] }>(
    '/api/materials?status=ACTIVE'
  )
  const { data: settingsData } = useApi<{ settings: Record<string, string> }>('/api/settings')
  const settings = settingsData?.settings ?? {}
  const { data: existingData, loading: existingLoading } = useApi<{
    quotation: {
      quotationNumber: string
      currentVersion: {
        versionNumber: number
        versionType: string
        packageId: string
        discountType: string
        discount: number
        notes: string | null
        bathrooms: { name: string; type: string; length: number; width: number; height: number | null }[]
        items: { section: string; materialId: string | null; name: string; quantity: number }[]
      }
      customer: {
        id: string
        name: string
        phone: string
        email?: string | null
        address?: string | null
        city?: string | null
        pincode?: string | null
      }
    }
  }>(editing ? `/api/quotations/${params.quotationId}` : null)
  const existing = existingData?.quotation ?? null

  const { data: leadData } = useApi<{ lead: LeadHit & { leadNumber: string } }>(
    params.leadId && !editing ? `/api/leads/${params.leadId}` : null
  )

  // ----- derived master data -----
  const packages = useMemo(
    () => (packagesData?.packages ?? []).filter((p) => p.status === 'ACTIVE'),
    [packagesData]
  )
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData])
  const materialsById = useMemo(() => {
    const map = new Map<string, MaterialRow>()
    for (const m of materials) map.set(m.id, m)
    return map
  }, [materials])
  const tileMaterials = useMemo(() => materials.filter((m) => m.category?.name === 'Tiles'), [materials])
  // Dynamic grouping: every catalogue category that isn't handled by a dedicated step
  // (Tiles / Add-ons) becomes a fixture group — resilient to category renames.
  const fixtureGroups = useMemo(() => {
    const groups = new Map<string, MaterialRow[]>()
    for (const m of materials) {
      const cat = m.category?.name
      if (!cat || NON_FIXTURE_CATEGORIES.has(cat)) continue
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(m)
    }
    return [...groups.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [materials])
  const addonMaterials = useMemo(() => materials.filter((m) => m.category?.name === 'Add-ons'), [materials])

  // ----- settings-derived values -----
  const gstRate = useMemo(() => {
    const n = Number(settings.gst_rate)
    return Number.isFinite(n) && n >= 0 ? n : 18
  }, [settings])
  const consultationFee = useMemo(() => {
    const n = Number(settings.consultation_fee)
    return Number.isFinite(n) && n >= 0 ? n : 299
  }, [settings])
  const validityDays = useMemo(() => {
    const n = Number.parseInt(settings.quote_validity_days ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : 30
  }, [settings])
  const canPublish = isSuperAdmin || settings.admins_can_publish === 'true'

  // ----- draft state -----
  const [draft, setDraft] = useState<DraftState>(defaultDraft)
  const [draftHydrated, setDraftHydrated] = useState(false)
  const [dirty, setDirty] = useState(false)
  const restoredRef = useRef(false)
  const leadPrefilledRef = useRef(false)
  const editPrefilledRef = useRef(false)

  const mutate = useCallback<Mutate>((patch) => {
    setDirty(true)
    setDraft((prev) =>
      typeof patch === 'function' ? (patch as (p: DraftState) => DraftState)(prev) : { ...prev, ...patch }
    )
  }, [])

  // Hydrate from localStorage (per quotationId/'new' key). Runs in a microtask
  // so the restore never causes a synchronous cascading render inside the effect.
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      let restored = false
      try {
        const raw = window.localStorage.getItem(draftKey)
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<DraftState> | null
          if (parsed && Array.isArray(parsed.bathrooms) && parsed.bathrooms.length > 0) {
            setDraft({
              ...defaultDraft(),
              ...parsed,
              bathrooms: parsed.bathrooms.map((b, i) => ({ ...emptyBathroom(i + 1), ...b })),
            })
            restored = true
          }
        }
      } catch {
        /* corrupted draft — start fresh */
      }
      restoredRef.current = restored
      setDraftHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [draftKey])

  // Persist draft.
  useEffect(() => {
    if (!draftHydrated) return
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch {
      /* storage unavailable */
    }
  }, [draft, draftKey, draftHydrated])

  // Warn on unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Prefill from lead (when navigated with ?leadId= and no restored draft).
  useEffect(() => {
    if (!draftHydrated || restoredRef.current || leadPrefilledRef.current) return
    const lead = leadData?.lead
    if (!lead) return
    leadPrefilledRef.current = true
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      mutate({
        customerMode: 'lead',
        leadId: lead.id,
        leadCustomerId: lead.customer.id,
        leadLabel: `${lead.leadNumber} · ${lead.customer.name}`,
        name: lead.customer.name ?? '',
        phone: lead.customer.phone ?? '',
        email: lead.customer.email ?? '',
        address: lead.customer.address ?? '',
        city: lead.customer.city ?? '',
        pincode: lead.customer.pincode ?? '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [leadData, draftHydrated, mutate])

  // Prefill from the existing quotation (edit mode → new version baseline).
  useEffect(() => {
    if (!draftHydrated || restoredRef.current || editPrefilledRef.current) return
    const q = existingData?.quotation
    if (!q) return
    editPrefilledRef.current = true
    const v = q.currentVersion
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      mutate({
        customerMode: 'new',
        customerId: q.customer.id,
        name: q.customer.name ?? '',
        phone: q.customer.phone ?? '',
        email: q.customer.email ?? '',
        address: q.customer.address ?? '',
        city: q.customer.city ?? '',
        pincode: q.customer.pincode ?? '',
        bathrooms: (v.bathrooms ?? []).map((b) => ({
          name: b.name,
          type: b.type,
          length: String(b.length),
          width: String(b.width),
          height: b.height != null ? String(b.height) : '',
        })),
        packageId: v.packageId || null,
        tiles: (v.items ?? [])
          .filter((i) => i.section === 'TILES' && i.materialId)
          .map((i) => i.materialId as string),
        fixtures: (v.items ?? [])
          .filter((i) => i.section === 'FIXTURES' && i.materialId)
          .map((i) => ({ materialId: i.materialId as string, quantity: i.quantity })),
        addons: (v.items ?? [])
          .filter((i) => i.section === 'ADDONS' && i.materialId)
          .map((i) => ({ materialId: i.materialId as string, quantity: i.quantity })),
        consultation: (v.items ?? []).some((i) => i.section === 'OTHER' && i.name === 'Design Consultation'),
        discountType: v.discountType === 'PERCENT' ? 'PERCENT' : 'FLAT',
        discount: v.discount ? String(v.discount) : '',
        notes: v.notes ?? '',
      })
    })
    return () => {
      cancelled = true
    }
  }, [existingData, draftHydrated, mutate])

  // ----- step navigation -----
  const [step, setStep] = useState(0)
  const [maxVisited, setMaxVisited] = useState(0)

  const customerValid =
    draft.customerMode === 'lead'
      ? Boolean(draft.leadId)
      : draft.name.trim().length > 0 && draft.phone.trim().length >= 8
  const bathroomsValid =
    draft.bathrooms.length > 0 &&
    draft.bathrooms.every((b) => b.name.trim().length > 0 && toNum(b.length) > 0 && toNum(b.width) > 0)
  const packageValid = Boolean(draft.packageId && packages.some((p) => p.id === draft.packageId))
  const allValid = customerValid && bathroomsValid && packageValid

  const stepValid = (i: number) => {
    const id = STEPS[i].id
    if (id === 'customer') return customerValid
    if (id === 'bathroom') return bathroomsValid
    if (id === 'package') return packageValid
    return true
  }
  const stepHint = (i: number) => {
    const id = STEPS[i].id
    if (id === 'customer')
      return draft.customerMode === 'lead'
        ? 'Select a lead to continue'
        : 'Enter a customer name and a valid phone number'
    if (id === 'bathroom') return 'Every bathroom needs a name, length and width'
    if (id === 'package') return 'Choose a package to continue'
    return ''
  }

  const goToStep = (i: number) => {
    setStep(i)
    setMaxVisited((m) => Math.max(m, i))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const goNext = () => {
    if (!stepValid(step)) {
      toast.error(stepHint(step) || 'Please complete this step')
      return
    }
    goToStep(Math.min(step + 1, STEPS.length - 1))
  }
  const goBack = () => {
    setStep(Math.max(0, step - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ----- live quote (client-side preview only) -----
  const quote = useMemo(() => {
    const pkg = packages.find((p) => p.id === draft.packageId) ?? null
    const bathroomsNum = draft.bathrooms.map((b) => ({ length: toNum(b.length), width: toNum(b.width) }))
    const totalArea = round2(
      bathroomsNum.reduce((sum, b) => sum + computeBathroomArea(b.length, b.width), 0)
    )

    const items: QuoteItemRow[] = []
    for (const id of draft.tiles) {
      const m = materialsById.get(id)
      if (!m) continue
      const quantity = calcAreaMaterialQuantity(totalArea, m.coverage ?? 0, m.wastagePercent ?? 0)
      items.push({
        section: 'TILES',
        name: m.name,
        quantity,
        unit: m.unit,
        rate: m.price,
        amount: round2(quantity * m.price),
      })
    }
    for (const f of draft.fixtures) {
      const m = materialsById.get(f.materialId)
      if (!m || f.quantity < 1) continue
      items.push({
        section: 'FIXTURES',
        name: m.name,
        quantity: f.quantity,
        unit: m.unit,
        rate: m.price,
        amount: round2(f.quantity * m.price),
      })
    }
    for (const a of draft.addons) {
      const m = materialsById.get(a.materialId)
      if (!m || a.quantity < 1) continue
      items.push({
        section: 'ADDONS',
        name: m.name,
        quantity: a.quantity,
        unit: m.unit,
        rate: m.price,
        amount: round2(a.quantity * m.price),
      })
    }
    if (draft.consultation) {
      items.push({
        section: 'OTHER',
        name: 'Design Consultation',
        quantity: 1,
        unit: 'set',
        rate: consultationFee,
        amount: round2(consultationFee),
      })
    }

    const calc = calcQuotation({
      bathrooms: bathroomsNum,
      packageRate: pkg?.pricePerSqft ?? 0,
      items: items.map((i) => ({ quantity: i.quantity, rate: i.rate })),
      discountType: draft.discountType,
      discount: toNum(draft.discount),
      gstRate,
    })

    return { pkg, totalArea, items, calc }
  }, [draft, packages, materialsById, consultationFee, gstRate])

  // ----- preview data (Preview step) -----
  const previewData = useMemo<QuotationPreviewData | null>(() => {
    if (!draftHydrated) return null
    const prefix = settings.quote_prefix || 'ABS-Q'
    const now = new Date()
    return {
      companyName: settings.company_name || 'AURAVIX BATH STUDIO',
      quotationNumber: editing && existing ? existing.quotationNumber : `${prefix}-XXXXXX`,
      versionNumber: editing && existing ? existing.currentVersion.versionNumber + 1 : 1,
      date: fmtDate(now),
      validityDate: fmtDate(new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000)),
      preparedBy: user?.name || 'AURAVIX Advisor',
      customer: {
        name: draft.name.trim() || 'Customer Name',
        phone: draft.phone.trim() || '—',
        email: draft.email.trim() || undefined,
        address: draft.address.trim() || undefined,
        city: draft.city.trim() || undefined,
        pincode: draft.pincode.trim() || undefined,
      },
      bathrooms: draft.bathrooms.map((b) => ({
        name: b.name.trim() || 'Bathroom',
        type: bathroomTypeLabels[b.type] ?? b.type,
        length: toNum(b.length),
        width: toNum(b.width),
        areaSqft: computeBathroomArea(toNum(b.length), toNum(b.width)),
      })),
      packageName: quote.pkg?.name ?? '—',
      packageRate: quote.pkg?.pricePerSqft ?? 0,
      packageAmount: quote.calc.packageAmount,
      totalArea: quote.calc.totalArea,
      items: quote.items.map((i) => ({
        section: i.section,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        rate: i.rate,
        amount: i.amount,
      })),
      grossValue: quote.calc.grossValue,
      discountType: draft.discountType,
      discount: toNum(draft.discount),
      discountAmount: quote.calc.discountAmount,
      taxableValue: quote.calc.taxableValue,
      gstRate,
      gstAmount: quote.calc.gstAmount,
      totalPayable: quote.calc.totalPayable,
      notes: draft.notes.trim() || undefined,
      terms: settings.terms || undefined,
      gstin: settings.gstin || undefined,
      pan: settings.pan || undefined,
      phone: settings.company_phone || undefined,
      email: settings.company_email || undefined,
      address: settings.company_address || undefined,
      upi: settings.upi_details || undefined,
      bankDetails: settings.bank_details || undefined,
    }
  }, [draft, quote, settings, user, editing, existing, draftHydrated, gstRate, validityDays])

  // ----- save -----
  const [saving, setSaving] = useState(false)
  const [versionType, setVersionType] = useState<'UPGRADED' | 'REVISED'>('UPGRADED')
  const [versionPublishIntent, setVersionPublishIntent] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const buildPayload = (publish: boolean) => {
    const customerId = draft.customerId || (draft.customerMode === 'lead' ? draft.leadCustomerId : null)
    return {
      ...(customerId ? { customerId } : {}),
      ...(draft.customerMode === 'lead' && draft.leadId ? { leadId: draft.leadId } : {}),
      ...(customerId
        ? {}
        : {
            customer: {
              name: draft.name.trim(),
              phone: draft.phone.trim(),
              ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
              ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
              ...(draft.city.trim() ? { city: draft.city.trim() } : {}),
              ...(draft.pincode.trim() ? { pincode: draft.pincode.trim() } : {}),
            },
          }),
      bathrooms: draft.bathrooms.map((b) => ({
        name: b.name.trim(),
        type: b.type,
        length: toNum(b.length),
        width: toNum(b.width),
        ...(toNum(b.height) > 0 ? { height: toNum(b.height) } : {}),
      })),
      packageId: draft.packageId as string,
      selections: {
        tileIds: draft.tiles.map((id) => ({ materialId: id })),
        fixtures: draft.fixtures.filter((f) => f.quantity >= 1),
        addons: draft.addons.filter((a) => a.quantity >= 1),
        consultation: draft.consultation,
      },
      discountType: draft.discountType,
      discount: Number(draft.discount) || 0,
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      publish,
      ...(editing ? { versionType } : {}),
    }
  }

  const finishSave = (res: SaveResponse, created: boolean) => {
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      /* ignore */
    }
    setDirty(false)
    toast.success(
      created
        ? `Quotation ${res.quotation.quotationNumber} created`
        : `Version ${res.quotation.versionNumber} of ${res.quotation.quotationNumber} saved`
    )
    navigate('quotation-detail', { id: res.quotation.id })
  }

  const saveQuotation = async (publish: boolean) => {
    if (!allValid) {
      toast.error('Complete the customer, bathroom and package details first.')
      return
    }
    setSaving(true)
    try {
      const res = await apiPost<SaveResponse>('/api/quotations', buildPayload(publish))
      if (res.notice) toast.info(res.notice)
      finishSave(res, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the quotation')
      setSaving(false)
    }
  }

  const saveVersion = async () => {
    if (!editing) return
    if (!allValid) {
      toast.error('Complete the customer, bathroom and package details first.')
      return
    }
    setSaving(true)
    try {
      const res = await apiPost<SaveResponse>(
        `/api/quotations/${params.quotationId}/versions`,
        buildPayload(canPublish && versionPublishIntent)
      )
      finishSave(res, false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the new version')
      setSaving(false)
    }
  }

  // ----- render -----
  if (!draftHydrated) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const discountHint =
    draft.discountType === 'PERCENT' ? `${toNum(draft.discount)}%` : formatINR(toNum(draft.discount))

  return (
    <div className="space-y-4 p-4 md:space-y-5 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            {editing ? 'Edit Quotation' : 'New Quotation'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {editing
              ? 'Update the quote — saving creates a new version; history is preserved.'
              : 'Build a professional bathroom renovation quotation step by step.'}
          </p>
        </div>
        {editing && existing ? (
          <div className="flex flex-col items-end gap-1">
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              Editing V{existing.currentVersion.versionNumber}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{existing.quotationNumber}</span>
          </div>
        ) : null}
      </div>

      {/* Edit-mode notice */}
      {editing && existing ? (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-relaxed text-amber-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            You are editing <b>V{existing.currentVersion.versionNumber}</b> (
            {versionTypeLabels[existing.currentVersion.versionType] ?? 'Initial Quote'}
            ). Saving will create <b>version {existing.currentVersion.versionNumber + 1}</b> — the original stays
            in the version history.
          </p>
        </div>
      ) : null}
      {editing && existingLoading ? <Skeleton className="h-14 rounded-2xl" /> : null}

      {/* Stepper */}
      <Stepper steps={STEPS} step={step} maxVisited={maxVisited} onJump={goToStep} />

      {/* Content + summary rail */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {STEPS[step].id === 'customer' ? <CustomerStep draft={draft} mutate={mutate} /> : null}
          {STEPS[step].id === 'bathroom' ? <BathroomStep draft={draft} mutate={mutate} /> : null}
          {STEPS[step].id === 'package' ? (
            <PackageStep draft={draft} mutate={mutate} packages={packages} loading={packagesLoading} />
          ) : null}
          {STEPS[step].id === 'tiles' ? (
            <TilesStep draft={draft} mutate={mutate} materials={tileMaterials} loading={materialsLoading} />
          ) : null}
          {STEPS[step].id === 'fixtures' ? (
            <FixturesStep draft={draft} mutate={mutate} groups={fixtureGroups} loading={materialsLoading} />
          ) : null}
          {STEPS[step].id === 'addons' ? (
            <AddonsStep
              draft={draft}
              mutate={mutate}
              materials={addonMaterials}
              loading={materialsLoading}
              consultationFee={consultationFee}
            />
          ) : null}
          {STEPS[step].id === 'cost' ? (
            <CostStep draft={draft} mutate={mutate} quote={quote} gstRate={gstRate} discountHint={discountHint} />
          ) : null}
          {STEPS[step].id === 'preview' ? (
            <PreviewStep
              data={previewData}
              editing={editing}
              versionType={versionType}
              onVersionTypeChange={setVersionType}
              canPublish={canPublish}
              publishIntent={versionPublishIntent}
              onPublishIntentChange={setVersionPublishIntent}
            />
          ) : null}
        </div>

        <aside className="hidden xl:sticky xl:top-20 xl:block">
          <SummaryCard quote={quote} gstRate={gstRate} discountHint={discountHint} />
        </aside>
      </div>

      {/* Mobile sticky total bar (opens summary drawer) */}
      {step < STEPS.length - 1 ? (
        <div className="sticky bottom-32 z-30 xl:hidden">
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur transition-colors hover:border-primary/60"
          >
            <span className="text-left">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Payable
              </span>
              <span className="block text-lg font-extrabold text-primary">
                {formatINR(quote.calc.totalPayable)}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-primary">
              Summary
              <ChevronUp className="size-4" />
            </span>
          </button>
        </div>
      ) : null}

      {/* Footer actions */}
      <div className="sticky bottom-16 z-40 lg:bottom-4">
        <div className="rounded-2xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={goBack} disabled={step === 0 || saving}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {step < STEPS.length - 1 ? (
                <>
                  {!stepValid(step) ? (
                    <p className="hidden text-xs text-muted-foreground sm:block">{stepHint(step)}</p>
                  ) : null}
                  <Button
                    className="min-h-11 gap-1.5 font-semibold transition-transform active:scale-[0.99]"
                    onClick={goNext}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </>
              ) : editing ? (
                <Button
                  className="min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
                  onClick={saveVersion}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save as New Version
                </Button>
              ) : canPublish ? (
                <>
                  <Button
                    variant="outline"
                    className="min-h-11 font-semibold"
                    onClick={() => saveQuotation(false)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save Draft
                  </Button>
                  <Button
                    className="min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
                    onClick={() => saveQuotation(true)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                    Save &amp; Publish
                  </Button>
                </>
              ) : (
                <>
                  <p className="hidden max-w-[230px] text-right text-[11px] leading-tight text-muted-foreground sm:block">
                    Your quote will be reviewed and published by a Super Admin.
                  </p>
                  <Button
                    className="min-h-11 gap-2 font-semibold transition-transform active:scale-[0.99]"
                    onClick={() => saveQuotation(false)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    Submit for Approval
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile summary drawer */}
      <Drawer open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Quote Summary</DrawerTitle>
            <DrawerDescription>Live preview — the server recalculates final amounts.</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-8">
            <SummaryRows quote={quote} gstRate={gstRate} discountHint={discountHint} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function Stepper({
  steps,
  step,
  maxVisited,
  onJump,
}: {
  steps: readonly { id: string; label: string }[]
  step: number
  maxVisited: number
  onJump: (i: number) => void
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <div className="flex min-w-max items-center gap-1">
        {steps.map((s, i) => {
          const done = i < step
          const current = i === step
          const clickable = i <= maxVisited
          return (
            <Fragment key={s.id}>
              {i > 0 ? <div className="h-px w-4 shrink-0 bg-border" /> : null}
              <button
                type="button"
                onClick={() => clickable && onJump(i)}
                disabled={!clickable}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                  current
                    ? 'border-primary bg-orange-50 text-primary ring-2 ring-primary/20'
                    : done
                      ? 'border-border bg-card text-foreground'
                      : 'border-transparent text-muted-foreground',
                  clickable && !current ? 'hover:border-primary/40' : ''
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold',
                    done
                      ? 'border-primary bg-primary text-white'
                      : current
                        ? 'border-primary text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                  )}
                >
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                {s.label}
              </button>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-semibold text-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  )
}

function StepIntro({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  )
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function MaterialImage({ material }: { material: MaterialRow }) {
  if (material.imageUrl) {
    return (
      <img
        src={material.imageUrl}
        alt={material.name}
        className="h-20 w-20 shrink-0 rounded-lg border object-cover"
      />
    )
  }
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border bg-orange-50 text-xl font-extrabold text-primary">
      {material.name.charAt(0).toUpperCase()}
    </div>
  )
}

function SummaryRow2({
  label,
  value,
  accent,
  muted,
}: {
  label: string
  value: string
  accent?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={cn(muted ? 'text-muted-foreground' : 'text-foreground')}>{label}</span>
      <span
        className={cn(
          'shrink-0 font-semibold tabular-nums',
          accent ? 'text-orange-600' : muted ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function SummaryRows({
  quote,
  gstRate,
  discountHint,
}: {
  quote: {
    pkg: PackageRow | null
    totalArea: number
    items: QuoteItemRow[]
    calc: ReturnType<typeof calcQuotation>
  }
  gstRate: number
  discountHint: string
}) {
  const calc = quote.calc
  const showDiscount = calc.discountAmount > 0
  return (
    <div className="space-y-1.5">
      <SummaryRow2 label="Area" value={areaLabel(calc.totalArea)} muted />
      <SummaryRow2 label="Package" value={quote.pkg?.name ?? '—'} muted />
      <SummaryRow2 label="Items" value={String(quote.items.length)} muted />
      <Separator className="my-3" />
      <SummaryRow2 label="Gross Value" value={formatINR(calc.grossValue)} />
      {showDiscount ? <SummaryRow2 label={`Discount (${discountHint})`} value={`−${formatINR(calc.discountAmount)}`} accent /> : null}
      <SummaryRow2 label="Taxable Value" value={formatINR(calc.taxableValue)} />
      <SummaryRow2 label={`GST @ ${gstRate}%`} value={formatINR(calc.gstAmount)} />
      <Separator className="my-3" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Payable</span>
        <span className="text-2xl font-extrabold text-primary">{formatINR(calc.totalPayable)}</span>
      </div>
    </div>
  )
}

function SummaryCard({
  quote,
  gstRate,
  discountHint,
}: {
  quote: {
    pkg: PackageRow | null
    totalArea: number
    items: QuoteItemRow[]
    calc: ReturnType<typeof calcQuotation>
  }
  gstRate: number
  discountHint: string
}) {
  return (
    <Card className="gap-0 rounded-2xl border p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quote Summary</p>
      <div className="mt-3">
        <SummaryRows quote={quote} gstRate={gstRate} discountHint={discountHint} />
      </div>
      <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
        Live preview only — final amounts are recalculated by the server from master data.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Step: Customer
// ---------------------------------------------------------------------------

function CustomerStep({ draft, mutate }: { draft: DraftState; mutate: Mutate }) {
  const [leadQuery, setLeadQuery] = useState('')
  const debounced = useDebounced(leadQuery, 350)
  const leadsPath =
    draft.customerMode === 'lead' && !draft.leadId && debounced.trim().length >= 2
      ? `/api/leads?search=${encodeURIComponent(debounced.trim())}`
      : null
  const { data, loading } = useApi<{ total: number; leads: LeadHit[] }>(leadsPath)
  const leads = (data?.leads ?? []).slice(0, 6)

  const selectLead = (lead: LeadHit) => {
    mutate({
      customerMode: 'lead',
      leadId: lead.id,
      leadCustomerId: lead.customer.id,
      leadLabel: `${lead.leadNumber} · ${lead.customer.name}`,
      name: lead.customer.name ?? '',
      phone: lead.customer.phone ?? '',
      email: lead.customer.email ?? '',
      address: lead.customer.address ?? '',
      city: lead.customer.city ?? '',
      pincode: lead.customer.pincode ?? '',
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={draft.customerMode === 'lead'}
          icon={Users}
          title="Choose from Leads"
          desc="Link an existing lead and its customer"
          onClick={() => mutate({ customerMode: 'lead' })}
        />
        <ModeCard
          active={draft.customerMode === 'new'}
          icon={User}
          title="Customer Details"
          desc="Enter customer details manually"
          onClick={() => mutate({ customerMode: 'new', leadId: null, leadCustomerId: null, leadLabel: '' })}
        />
      </div>

      {draft.customerMode === 'lead' ? (
        draft.leadId ? (
          <Card className="flex items-center gap-3 rounded-2xl border-primary/40 bg-orange-50/50 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{draft.name || 'Lead'}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[draft.leadLabel, draft.phone].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              onClick={() => mutate({ leadId: null, leadCustomerId: null, leadLabel: '' })}
              aria-label="Choose a different lead"
            >
              <X className="size-4" />
            </Button>
          </Card>
        ) : (
          <Card className="gap-0 space-y-3 rounded-2xl p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                placeholder="Search leads by name, phone or lead number…"
                className="min-h-11 pl-9"
                aria-label="Search leads"
              />
            </div>
            {debounced.trim().length < 2 ? (
              <p className="text-xs text-muted-foreground">Type at least 2 characters to search your leads.</p>
            ) : loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : leads.length === 0 ? (
              <p className="rounded-xl bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
                No leads found for “{leadQuery.trim()}”.
              </p>
            ) : (
              <div className="space-y-2">
                {leads.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => selectLead(lead)}
                    className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 hover:bg-orange-50/40"
                  >
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      {lead.leadNumber}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {lead.customer.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[lead.customer.phone, lead.customer.city].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        )
      ) : (
        <Card className="gap-0 rounded-2xl p-4 md:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer Name" required>
              <Input
                value={draft.name}
                onChange={(e) => mutate({ name: e.target.value })}
                placeholder="e.g. Ananya Rao"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
            <Field label="Phone" required>
              <Input
                type="tel"
                value={draft.phone}
                onChange={(e) => mutate({ phone: e.target.value })}
                placeholder="+91 98765 43210"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => mutate({ email: e.target.value })}
                placeholder="customer@email.com"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
            <Field label="City">
              <Input
                value={draft.city}
                onChange={(e) => mutate({ city: e.target.value })}
                placeholder="e.g. Hyderabad"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={draft.address}
                onChange={(e) => mutate({ address: e.target.value })}
                placeholder="House / street / locality"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
            <Field label="Pincode">
              <Input
                value={draft.pincode}
                onChange={(e) => mutate({ pincode: e.target.value })}
                placeholder="e.g. 500034"
                className="min-h-11"
                autoComplete="off"
              />
            </Field>
          </div>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Customers are matched by phone number — an existing customer is reused automatically.
      </p>
    </div>
  )
}

function ModeCard({
  active,
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  active: boolean
  icon: typeof User
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[64px] items-center gap-3 rounded-2xl border p-3.5 text-left shadow-sm transition-all active:scale-[0.99]',
        active ? 'border-primary bg-orange-50/50 ring-2 ring-primary/20' : 'border-border bg-card hover:border-primary/40'
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          active ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{desc}</span>
      </span>
      {active ? <Check className="ml-auto size-4 shrink-0 text-primary" /> : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Step: Bathroom
// ---------------------------------------------------------------------------

function BathroomStep({ draft, mutate }: { draft: DraftState; mutate: Mutate }) {
  const update = (i: number, patch: Partial<BathroomDraft>) =>
    mutate((prev) => ({
      ...prev,
      bathrooms: prev.bathrooms.map((b, idx) => (idx === i ? { ...b, ...patch } : b)),
    }))

  const addBathroom = () => {
    if (draft.bathrooms.length >= MAX_BATHROOMS) {
      toast.info(`Up to ${MAX_BATHROOMS} bathrooms per quotation.`)
      return
    }
    mutate((prev) => ({
      ...prev,
      bathrooms: [...prev.bathrooms, emptyBathroom(prev.bathrooms.length + 1)],
    }))
  }

  const duplicateBathroom = (i: number) => {
    if (draft.bathrooms.length >= MAX_BATHROOMS) {
      toast.info(`Up to ${MAX_BATHROOMS} bathrooms per quotation.`)
      return
    }
    mutate((prev) => {
      const copy = { ...prev.bathrooms[i], name: `${prev.bathrooms[i].name} Copy` }
      const next = [...prev.bathrooms]
      next.splice(i + 1, 0, copy)
      return { ...prev, bathrooms: next }
    })
  }

  const removeBathroom = (i: number) => {
    if (draft.bathrooms.length <= 1) {
      toast.info('At least one bathroom is required.')
      return
    }
    mutate((prev) => ({ ...prev, bathrooms: prev.bathrooms.filter((_, idx) => idx !== i) }))
  }

  return (
    <div className="space-y-4">
      <StepIntro
        title="Bathroom Details"
        desc="Add each bathroom with its dimensions — area drives the package price."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {draft.bathrooms.map((b, i) => {
          const area = computeBathroomArea(toNum(b.length), toNum(b.width))
          return (
            <Card key={i} className="gap-0 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={b.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="h-10 max-w-[210px] border-none bg-muted/60 px-3 font-bold shadow-none"
                  aria-label={`Bathroom ${i + 1} name`}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-primary">
                    <Ruler className="size-3.5" />
                    {areaLabel(area)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-full"
                    onClick={() => duplicateBathroom(i)}
                    disabled={draft.bathrooms.length >= MAX_BATHROOMS}
                    aria-label={`Duplicate ${b.name}`}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => removeBathroom(i)}
                    disabled={draft.bathrooms.length <= 1}
                    aria-label={`Remove ${b.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <Select value={b.type} onValueChange={(v) => update(i, { type: v })}>
                    <SelectTrigger className="min-h-11 w-full" aria-label={`${b.name} type`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(bathroomTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Length (ft)" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={b.length}
                    onChange={(e) => update(i, { length: e.target.value })}
                    placeholder="e.g. 9"
                    className="min-h-11"
                  />
                </Field>
                <Field label="Width (ft)" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={b.width}
                    onChange={(e) => update(i, { width: e.target.value })}
                    placeholder="e.g. 5"
                    className="min-h-11"
                  />
                </Field>
                <Field label="Height (ft, optional)">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={b.height}
                    onChange={(e) => update(i, { height: e.target.value })}
                    placeholder="e.g. 10"
                    className="min-h-11"
                  />
                </Field>
              </div>
            </Card>
          )
        })}
      </div>
      <Button
        variant="outline"
        className="min-h-11 gap-2 border-dashed font-semibold"
        onClick={addBathroom}
        disabled={draft.bathrooms.length >= MAX_BATHROOMS}
      >
        <Plus className="size-4" />
        Add Bathroom
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Package
// ---------------------------------------------------------------------------

function PackageStep({
  draft,
  mutate,
  packages,
  loading,
}: {
  draft: DraftState
  mutate: Mutate
  packages: PackageRow[]
  loading: boolean
}) {
  return (
    <div className="space-y-4">
      <StepIntro
        title="Choose Your Package"
        desc="The package rate is applied to the total area of all bathrooms."
      />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <EmptyBlock text="No active packages available — ask a Super Admin to add packages." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {packages.map((p) => {
            const selected = draft.packageId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => mutate({ packageId: p.id })}
                className={cn(
                  'relative rounded-2xl border p-4 text-left shadow-sm transition-all active:scale-[0.99]',
                  selected
                    ? 'border-primary bg-orange-50/50 ring-2 ring-primary/20'
                    : 'border-border bg-card hover:border-primary/40'
                )}
              >
                {selected ? (
                  <span className="absolute right-3 top-3 flex size-6 items-center justify-center rounded-full bg-primary text-white">
                    <Check className="size-3.5" />
                  </span>
                ) : null}
                <p className="text-sm font-bold text-foreground">{p.name}</p>
                <p className="mt-1.5 tracking-tight">
                  <span className={cn('text-2xl font-extrabold', selected ? 'text-primary' : 'text-foreground')}>
                    ₹{formatINR(p.pricePerSqft, false)}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">/sq.ft</span>
                </p>
                {p.description ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
                ) : null}
                {p.duration ? (
                  <p className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                    <Clock className="size-3.5" />
                    {p.duration}
                  </p>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Tiles
// ---------------------------------------------------------------------------

function TilesStep({
  draft,
  mutate,
  materials,
  loading,
}: {
  draft: DraftState
  mutate: Mutate
  materials: MaterialRow[]
  loading: boolean
}) {
  const toggle = (id: string) =>
    mutate((prev) => ({
      ...prev,
      tiles: prev.tiles.includes(id) ? prev.tiles.filter((t) => t !== id) : [...prev.tiles, id],
    }))

  return (
    <div className="space-y-4">
      <StepIntro
        title="Select Tiles"
        desc="Tiles are applied to the total bathroom area — quantities are computed automatically (coverage + wastage)."
      />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : materials.length === 0 ? (
        <EmptyBlock text="No active tiles in the catalogue yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {materials.map((m) => {
            const selected = draft.tiles.includes(m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={cn(
                  'relative flex items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition-all active:scale-[0.99]',
                  selected
                    ? 'border-primary bg-orange-50/50 ring-2 ring-primary/20'
                    : 'border-border bg-card hover:border-primary/40'
                )}
              >
                <MaterialImage material={m} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{m.name}</span>
                  {m.brand ? (
                    <span className="block truncate text-xs text-muted-foreground">{m.brand}</span>
                  ) : null}
                  <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {m.unit}
                  </span>
                </span>
                {selected ? (
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-white">
                    <Check className="size-3.5" />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
      {draft.tiles.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {draft.tiles.length} tile option{draft.tiles.length === 1 ? '' : 's'} selected — quantities are shown in
          the Cost step.
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Fixtures
// ---------------------------------------------------------------------------

function FixturesStep({
  draft,
  mutate,
  groups,
  loading,
}: {
  draft: DraftState
  mutate: Mutate
  groups: { name: string; items: MaterialRow[] }[]
  loading: boolean
}) {
  const qtyOf = (id: string) => draft.fixtures.find((f) => f.materialId === id)?.quantity ?? 0

  const setQty = (id: string, qty: number) =>
    mutate((prev) => {
      const clamped = Math.min(MAX_QTY, Math.max(0, Math.round(qty)))
      const rest = prev.fixtures.filter((f) => f.materialId !== id)
      return clamped >= 1 ? { ...prev, fixtures: [...rest, { materialId: id, quantity: clamped }] } : { ...prev, fixtures: rest }
    })

  return (
    <div className="space-y-5">
      <StepIntro
        title="Select Fixtures & Fittings"
        desc="Choose the fixtures for this quote and set quantities (1–99)."
      />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyBlock text="No active fixtures in the catalogue yet." />
      ) : (
        groups.map((group) => (
          <div key={group.name} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.name}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((m) => (
                <FixtureCard
                  key={m.id}
                  material={m}
                  quantity={qtyOf(m.id)}
                  onAdd={() => setQty(m.id, 1)}
                  onInc={() => setQty(m.id, qtyOf(m.id) + 1)}
                  onDec={() => setQty(m.id, qtyOf(m.id) - 1)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function FixtureCard({
  material,
  quantity,
  onAdd,
  onInc,
  onDec,
}: {
  material: MaterialRow
  quantity: number
  onAdd: () => void
  onInc: () => void
  onDec: () => void
}) {
  const selected = quantity >= 1
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border p-3 shadow-sm transition-colors',
        selected ? 'border-primary/60 bg-orange-50/40' : 'border-border bg-card'
      )}
    >
      <MaterialImage material={material} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{material.name}</p>
        {material.brand ? <p className="truncate text-xs text-muted-foreground">{material.brand}</p> : null}
        <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {material.unit}
        </span>
      </div>
      {selected ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11 rounded-xl"
            onClick={onDec}
            aria-label={`Decrease ${material.name} quantity`}
          >
            <Minus className="size-4" />
          </Button>
          <span className="w-7 text-center text-sm font-extrabold tabular-nums">{quantity}</span>
          <Button
            variant="outline"
            size="icon"
            className="size-11 rounded-xl"
            onClick={onInc}
            disabled={quantity >= MAX_QTY}
            aria-label={`Increase ${material.name} quantity`}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="min-h-11 shrink-0 gap-1.5 text-xs" onClick={onAdd}>
          <Plus className="size-4" />
          Add
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Add-ons
// ---------------------------------------------------------------------------

function AddonsStep({
  draft,
  mutate,
  materials,
  loading,
  consultationFee,
}: {
  draft: DraftState
  mutate: Mutate
  materials: MaterialRow[]
  loading: boolean
  consultationFee: number
}) {
  const qtyOf = (id: string) => draft.addons.find((a) => a.materialId === id)?.quantity ?? 0

  const setQty = (id: string, qty: number) =>
    mutate((prev) => {
      const clamped = Math.min(MAX_QTY, Math.max(0, Math.round(qty)))
      const rest = prev.addons.filter((a) => a.materialId !== id)
      return clamped >= 1 ? { ...prev, addons: [...rest, { materialId: id, quantity: clamped }] } : { ...prev, addons: rest }
    })

  return (
    <div className="space-y-4">
      <StepIntro title="Add-ons & Services" desc="Optional extras — tick what the customer wants." />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {materials.map((m) => {
            const quantity = qtyOf(m.id)
            const selected = quantity >= 1
            return (
              <div
                key={m.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 shadow-sm transition-colors',
                  selected ? 'border-primary/60 bg-orange-50/40' : 'border-border bg-card'
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(v) => setQty(m.id, v === true ? Math.max(1, quantity || 1) : 0)}
                  className="size-5 shrink-0"
                  aria-label={`Select ${m.name}`}
                />
                <MaterialImage material={m} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{m.name}</p>
                  {m.brand ? <p className="truncate text-xs text-muted-foreground">{m.brand}</p> : null}
                  <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {m.unit}
                  </span>
                </div>
                {selected ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      onClick={() => setQty(m.id, quantity - 1)}
                      aria-label={`Decrease ${m.name} quantity`}
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="w-7 text-center text-sm font-extrabold tabular-nums">{quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11 rounded-xl"
                      onClick={() => setQty(m.id, quantity + 1)}
                      disabled={quantity >= MAX_QTY}
                      aria-label={`Increase ${m.name} quantity`}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          })}
          {materials.length === 0 ? (
            <div className="sm:col-span-2">
              <EmptyBlock text="No active add-ons in the catalogue yet." />
            </div>
          ) : null}
        </div>
      )}

      {/* Consultation toggle */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-2xl border p-4 shadow-sm transition-colors',
          draft.consultation ? 'border-primary/60 bg-orange-50/40' : 'border-border bg-card'
        )}
      >
        <Checkbox
          id="consultation"
          checked={draft.consultation}
          onCheckedChange={(v) => mutate({ consultation: v === true })}
          className="size-5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor="consultation" className="cursor-pointer text-sm font-semibold text-foreground">
            Design Consultation
          </Label>
          <p className="text-xs text-muted-foreground">
            Professional on-site design guidance — billed once under Other Services.
          </p>
        </div>
        <span className="shrink-0 text-sm font-extrabold text-primary">{formatINR(consultationFee)}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Cost
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<string, string> = {
  TILES: 'Tiles',
  FIXTURES: 'Fixtures & Fittings',
  ADDONS: 'Add-ons',
  OTHER: 'Other Services',
}

function CostStep({
  draft,
  mutate,
  quote,
  gstRate,
  discountHint,
}: {
  draft: DraftState
  mutate: Mutate
  quote: {
    pkg: PackageRow | null
    totalArea: number
    items: QuoteItemRow[]
    calc: ReturnType<typeof calcQuotation>
  }
  gstRate: number
  discountHint: string
}) {
  const calc = quote.calc
  const groups = (['TILES', 'FIXTURES', 'ADDONS', 'OTHER'] as const)
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      items: quote.items.filter((i) => i.section === section),
    }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-4">
      <StepIntro
        title="Cost, Discount & Notes"
        desc="Prices come from the catalogue — review the breakdown and apply a discount if needed."
      />

      <Card className="gap-0 rounded-2xl p-4 md:p-5">
        <h3 className="text-sm font-bold text-foreground">Discount</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
          <Field label="Type">
            <Select
              value={draft.discountType}
              onValueChange={(v) => mutate({ discountType: v === 'PERCENT' ? 'PERCENT' : 'FLAT' })}
            >
              <SelectTrigger className="min-h-11 w-full" aria-label="Discount type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FLAT">₹ Flat Amount</SelectItem>
                <SelectItem value="PERCENT">% of Gross Value</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={draft.discountType === 'PERCENT' ? 'Discount %' : 'Discount Amount (₹)'}>
            <Input
              type="number"
              min="0"
              step={draft.discountType === 'PERCENT' ? '1' : '100'}
              inputMode="decimal"
              value={draft.discount}
              onChange={(e) => mutate({ discount: e.target.value })}
              placeholder={draft.discountType === 'PERCENT' ? 'e.g. 5' : 'e.g. 5000'}
              className="min-h-11"
            />
          </Field>
        </div>
        {calc.discountAmount > 0 ? (
          <p className="mt-3 text-xs font-semibold text-primary">
            Discount applied: −{formatINR(calc.discountAmount)} ({discountHint})
          </p>
        ) : null}
      </Card>

      <Card className="gap-0 rounded-2xl p-4 md:p-5">
        <h3 className="text-sm font-bold text-foreground">Notes</h3>
        <Textarea
          value={draft.notes}
          onChange={(e) => mutate({ notes: e.target.value })}
          placeholder="Optional notes shown on the printed quotation (scope, exclusions, brand preferences…)…"
          className="mt-2 min-h-24"
        />
      </Card>

      <Card className="gap-0 overflow-hidden rounded-2xl">
        <div className="px-4 pt-4 md:px-5 md:pt-5">
          <h3 className="text-sm font-bold text-foreground">Cost Breakdown</h3>
        </div>
        <div className="overflow-x-auto p-4 md:p-5">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left font-semibold">Item</th>
                <th className="py-2 text-right font-semibold">Qty</th>
                <th className="py-2 text-right font-semibold">Unit</th>
                <th className="py-2 text-right font-semibold">Rate</th>
                <th className="py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-dashed">
                <td className="py-2.5 font-semibold text-foreground">
                  {quote.pkg?.name ?? 'Package'}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {areaLabel(calc.totalArea)} × {formatINR(quote.pkg?.pricePerSqft ?? 0)}/sq.ft
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{calc.totalArea}</td>
                <td className="py-2.5 text-right text-muted-foreground">sq.ft</td>
                <td className="py-2.5 text-right tabular-nums">{formatINR(quote.pkg?.pricePerSqft ?? 0)}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(calc.packageAmount)}</td>
              </tr>
              {groups.map((g) => (
                <Fragment key={g.section}>
                  <tr>
                    <td
                      colSpan={5}
                      className="bg-muted/60 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      {g.label}
                    </td>
                  </tr>
                  {g.items.map((item, idx) => (
                    <tr key={`${g.section}-${idx}`} className="border-b border-border/60">
                      <td className="py-2.5 text-foreground">{item.name}</td>
                      <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{item.unit}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatINR(item.rate)}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(item.amount)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs italic text-muted-foreground">
                    No line items — package charges only.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td colSpan={4} className="pt-3 text-sm text-muted-foreground">
                  Gross Value
                </td>
                <td className="pt-3 text-right font-semibold tabular-nums">{formatINR(calc.grossValue)}</td>
              </tr>
              {calc.discountAmount > 0 ? (
                <tr>
                  <td colSpan={4} className="py-1 text-sm text-muted-foreground">
                    Discount ({discountHint})
                  </td>
                  <td className="py-1 text-right font-semibold tabular-nums text-orange-600">
                    −{formatINR(calc.discountAmount)}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td colSpan={4} className="py-1 text-sm text-muted-foreground">
                  Taxable Value
                </td>
                <td className="py-1 text-right font-semibold tabular-nums">{formatINR(calc.taxableValue)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="py-1 text-sm text-muted-foreground">
                  GST @ {gstRate}%
                </td>
                <td className="py-1 text-right font-semibold tabular-nums">{formatINR(calc.gstAmount)}</td>
              </tr>
              <tr className="border-t">
                <td colSpan={4} className="pt-3 text-sm font-bold uppercase tracking-wide text-foreground">
                  Total Payable
                </td>
                <td className="pt-3 text-right text-xl font-extrabold tabular-nums text-primary">
                  {formatINR(calc.totalPayable)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Preview amounts are computed locally — the server recalculates every figure from master data when the
            quote is saved.
          </p>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Preview
// ---------------------------------------------------------------------------

function PreviewStep({
  data,
  editing,
  versionType,
  onVersionTypeChange,
  canPublish,
  publishIntent,
  onPublishIntentChange,
}: {
  data: QuotationPreviewData | null
  editing: boolean
  versionType: 'UPGRADED' | 'REVISED'
  onVersionTypeChange: (v: 'UPGRADED' | 'REVISED') => void
  canPublish: boolean
  publishIntent: boolean
  onPublishIntentChange: (v: boolean) => void
}) {
  if (!data) return <Skeleton className="h-96 rounded-2xl" />
  return (
    <div className="space-y-4">
      <StepIntro
        title="Preview"
        desc="This is exactly how the printed / PDF quotation will look."
      />
      <Card className="gap-0 overflow-hidden rounded-2xl border p-0 shadow-sm">
        <QuotationPreview data={data} />
      </Card>
      {editing ? (
        <Card className="gap-0 rounded-2xl p-4 md:p-5">
          <h3 className="text-sm font-bold text-foreground">Version Options</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Version Type">
              <Select value={versionType} onValueChange={(v) => onVersionTypeChange(v === 'REVISED' ? 'REVISED' : 'UPGRADED')}>
                <SelectTrigger className="min-h-11 w-full" aria-label="Version type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPGRADED">{versionTypeLabels.UPGRADED}</SelectItem>
                  <SelectItem value="REVISED">{versionTypeLabels.REVISED}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {canPublish ? (
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
                  <Checkbox
                    checked={publishIntent}
                    onCheckedChange={(v) => onPublishIntentChange(v === true)}
                    className="size-5"
                  />
                  Publish this version immediately
                </label>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
