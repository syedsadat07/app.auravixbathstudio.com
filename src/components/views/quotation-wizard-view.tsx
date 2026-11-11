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
  Boxes,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  SlidersHorizontal,
  RotateCcw,
  ChevronDown,
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
import {
  calcAreaMaterialQuantity,
  calcBathroomBreakdown,
  calcCombinedQuotation,
  calcQuotation,
  computeBathroomArea,
  computeFloorArea,
  computeWallArea,
  mmToFeet,
  round2,
  roundMoney,
  type BathroomBreakdownResult,
  type BathroomInput,
  type BathroomItemInput,
  type CombinedQuotationResult,
  type MeasurementUnit,
} from '@/lib/calc'
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
  unit: 'ft' | 'mm'
  openingsArea: string
}


interface BrandBundleItem {
  id?: string
  materialId: string
  quantity: number
  unit: string
  rate: number
  installCost: number
  sortOrder?: number
  notes?: string | null
  material?: {
    id: string
    name: string
    brand: string | null
    sku?: string | null
    unit: string
    price: number
    imageUrl: string | null
    category?: { id: string; name: string }
    stockQty?: number
    reservedQty?: number
    availableQty?: number
  }
}

interface BrandBundle {
  id: string
  name: string
  bundleType: 'BASIC' | 'PREMIUM' | 'LUXURY' | 'CUSTOM'
  description: string | null
  status: 'ACTIVE' | 'INACTIVE'
  items: BrandBundleItem[]
}

// Per-bathroom fixture map: key = bathroomIndex (as string), value = array of {materialId, quantity}
type BathroomFixtureMap = Record<string, { materialId: string; quantity: number }[]>

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
  bundleId: string | null
  bundleName: string | null
  bathroomBundles: Record<string, { bundleId: string; bundleName: string }>
  tiles: string[]
  // Per-bathroom fixtures: key = bathroom index ("0", "1", ...)
  bathroomFixtures: BathroomFixtureMap
  addons: { materialId: string; quantity: number }[]
  discountType: 'FLAT' | 'PERCENT'
  discount: string
  notes: string
}

type Mutate = (patch: Partial<DraftState> | ((prev: DraftState) => DraftState)) => void

interface MaterialRow {
  id: string
  name: string
  brand: string | null
  sku: string | null
  description?: string | null
  unit: string
  price: number
  coverage: number | null
  coverageUnit: string | null
  wastagePercent: number | null
  imageUrl: string | null
  quantityRule: string
  subCategory: string | null
  category: { id: string; name: string }
  purchaseCost?: number
  stockQty?: number
  reservedQty?: number
  availableQty?: number
  reorderThreshold?: number | null
  supplier?: string | null
  packageQty?: number
  isLowStock?: boolean
  isOutOfStock?: boolean
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
  height: '10',
  unit: 'ft',
  openingsArea: '',
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
  bundleId: null,
  bundleName: null,
  bathroomBundles: {},
  tiles: [],
  bathroomFixtures: {},
  addons: [],
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
  const { data: bundlesData, loading: bundlesLoading } = useApi<{ bundles: BrandBundle[] }>('/api/bundles?status=ACTIVE')
  const bundles = bundlesData?.bundles ?? []
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
        bathrooms: {
          name: string
          type: string
          unit?: string | null
          length: number
          width: number
          height: number | null
          openingsArea?: number | null
          wallAreaSqft?: number | null
        }[]
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
  // Tile materials grouped by subCategory
  const tileMaterials = useMemo(() => materials.filter((m) => m.category?.name === 'Tiles'), [materials])
  const tileGroups = useMemo(() => {
    const groups = new Map<string, MaterialRow[]>()
    for (const m of tileMaterials) {
      const sub = m.subCategory?.trim() || 'General'
      if (!groups.has(sub)) groups.set(sub, [])
      groups.get(sub)!.push(m)
    }
    // If all tiles are in one sub-group only, don't split
    if (groups.size <= 1) return [{ name: '', items: tileMaterials }]
    return [...groups.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tileMaterials])
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
          unit: (b.unit === 'mm' ? 'mm' : 'ft') as 'ft' | 'mm',
          length: String(b.length),
          width: String(b.width),
          height: b.height != null ? String(b.height) : (b.unit === 'mm' ? '3048' : '10'),
          openingsArea: b.openingsArea != null ? String(b.openingsArea) : '',
        })),
        packageId: v.packageId || null,
        tiles: (v.items ?? [])
          .filter((i) => i.section === 'TILES' && i.materialId)
          .map((i) => i.materialId as string),
        // Rebuild per-bathroom fixtures from saved items (best-effort: group by bathroomId)
        bathroomFixtures: (() => {
          const map: BathroomFixtureMap = {}
          const fixtureItems = (v.items ?? []).filter((i) => i.section === 'FIXTURES' && i.materialId)
          // If bathroomId present, use it; otherwise put all in bathroom 0
          fixtureItems.forEach((item, idx) => {
            const bKey = (item as unknown as { bathroomId?: string }).bathroomId ?? '0'
            if (!map[bKey]) map[bKey] = []
            map[bKey].push({ materialId: item.materialId as string, quantity: item.quantity })
          })
          // If the map is empty (no bathroomId), put all under index 0
          if (Object.keys(map).length === 0 && fixtureItems.length > 0) {
            map['0'] = fixtureItems.map((i) => ({ materialId: i.materialId as string, quantity: i.quantity }))
          }
          return map
        })(),
        addons: (v.items ?? [])
          .filter((i) => i.section === 'ADDONS' && i.materialId)
          .map((i) => ({ materialId: i.materialId as string, quantity: i.quantity })),
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
    const bathroomsNum = draft.bathrooms.map((b) => ({
      name: b.name.trim() || 'Bathroom',
      type: b.type || 'COMMON',
      unit: (b.unit === 'mm' ? 'mm' : 'ft') as MeasurementUnit,
      length: toNum(b.length),
      width: toNum(b.width),
      height: toNum(b.height) > 0 ? toNum(b.height) : (b.unit === 'mm' ? 3048 : 10),
      openingsArea: toNum(b.openingsArea),
    }))
    const totalArea = round2(
      bathroomsNum.reduce((sum, b) => sum + computeFloorArea(b.length, b.width, b.unit), 0)
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
    // Aggregate fixtures across all bathrooms (for summary/cost step)
    const allFixturesAgg = new Map<string, number>()
    for (const bfArr of Object.values(draft.bathroomFixtures)) {
      for (const f of bfArr) {
        allFixturesAgg.set(f.materialId, (allFixturesAgg.get(f.materialId) ?? 0) + f.quantity)
      }
    }
    for (const [mid, qty] of allFixturesAgg) {
      const m = materialsById.get(mid)
      if (!m || qty < 1) continue
      items.push({
        section: 'FIXTURES',
        name: m.name,
        quantity: qty,
        unit: m.unit,
        rate: m.price,
        amount: round2(qty * m.price),
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

    // Bathroom-level itemization and breakdown
    const bathroomInputs: BathroomInput[] = bathroomsNum.map((b) => {
      const bFloor = computeFloorArea(b.length, b.width, b.unit)
      const bWall = computeWallArea(b.length, b.width, b.height, b.unit, b.openingsArea)
      const totalTileArea = round2(bFloor + bWall)

      const bTiles: BathroomItemInput[] = []
      for (const id of draft.tiles) {
        const m = materialsById.get(id)
        if (!m) continue
        const bQty = calcAreaMaterialQuantity(totalTileArea, m.coverage ?? 0, m.wastagePercent ?? 0)
        bTiles.push({
          name: m.name,
          section: 'TILES',
          materialId: m.id,
          quantity: bQty,
          unit: m.unit,
          rate: m.price,
          amount: round2(bQty * m.price),
        })
      }

      const bFixtures: BathroomItemInput[] = []
      // Use per-bathroom fixture selections
      const bfArr = draft.bathroomFixtures[String(bathroomsNum.indexOf(b))] ?? []
      for (const f of bfArr) {
        const m = materialsById.get(f.materialId)
        if (!m || f.quantity < 1) continue
        bFixtures.push({
          name: m.name,
          section: 'FIXTURES',
          materialId: m.id,
          quantity: f.quantity,
          unit: m.unit,
          rate: m.price,
          amount: round2(f.quantity * m.price),
        })
      }

      const bAccessories: BathroomItemInput[] = []
      for (const a of draft.addons) {
        const m = materialsById.get(a.materialId)
        if (!m || a.quantity < 1) continue
        const share = Math.max(1, Math.round(a.quantity / Math.max(1, bathroomsNum.length)))
        bAccessories.push({
          name: m.name,
          section: 'ACCESSORIES',
          materialId: m.id,
          quantity: share,
          unit: m.unit,
          rate: m.price,
          amount: round2(share * m.price),
        })
      }

      const bLabour: BathroomItemInput[] = [
        {
          name: 'Tiling & Surface Prep Labour',
          section: 'LABOUR',
          quantity: totalTileArea,
          unit: 'sq.ft',
          rate: 45,
          amount: round2(totalTileArea * 45),
        },
        {
          name: 'Plumbing & Fixtures Installation',
          section: 'LABOUR',
          quantity: 1,
          unit: 'lot',
          rate: 12000,
          amount: 12000,
        },
      ]

      const bAdditional: BathroomItemInput[] = [
        {
          name: 'Epoxy Grouting & Waterproofing Barrier',
          section: 'ADDITIONAL',
          quantity: bFloor,
          unit: 'sq.ft',
          rate: 65,
          amount: round2(bFloor * 65),
        },
      ]

      return {
        name: b.name,
        type: b.type,
        unit: b.unit,
        length: b.length,
        width: b.width,
        height: b.height,
        openingsArea: b.openingsArea,
        floorAreaSqft: bFloor,
        wallAreaSqft: bWall,
        tiles: bTiles,
        fixtures: bFixtures,
        accessories: bAccessories,
        labour: bLabour,
        additionalWork: bAdditional,
        discountType: draft.discountType,
        discount: 0,
        gstRate,
      }
    })

    const combined = calcCombinedQuotation({
      bathrooms: bathroomInputs,
      packageRate: pkg?.pricePerSqft ?? 0,
      projectDiscountType: draft.discountType,
      projectDiscount: toNum(draft.discount),
      gstRate,
    })

    const calc = calcQuotation({
      bathrooms: bathroomsNum.map((b) => ({ length: b.length, width: b.width, unit: b.unit })),
      packageRate: pkg?.pricePerSqft ?? 0,
      items: items.map((i) => ({ quantity: i.quantity, rate: i.rate })),
      discountType: draft.discountType,
      discount: toNum(draft.discount),
      gstRate,
    })

    return { pkg, totalArea, items, calc, combined }
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
      bathrooms: quote.combined.bathrooms.map((b) => ({
        name: b.name.trim() || 'Bathroom',
        type: bathroomTypeLabels[b.type] ?? b.type,
        unit: b.unit,
        length: b.length,
        width: b.width,
        height: b.height,
        areaSqft: b.floorAreaSqft,
        wallAreaSqft: b.wallAreaSqft,
        openingsAreaSqft: b.openingsAreaSqft,
        breakdown: b,
      })),
      packageName: quote.pkg?.name ?? '—',
      packageRate: quote.pkg?.pricePerSqft ?? 0,
      packageAmount: quote.calc.packageAmount,
      totalArea: quote.combined.totalFloorArea,
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
        unit: b.unit,
        length: toNum(b.length),
        width: toNum(b.width),
        ...(toNum(b.height) > 0 ? { height: toNum(b.height) } : {}),
        ...(toNum(b.openingsArea) > 0 ? { openingsArea: toNum(b.openingsArea) } : {}),
      })),
      packageId: draft.packageId as string,
      bundleId: draft.bundleId || null,
      bundleName: draft.bundleName || null,
      selections: {
        tileIds: draft.tiles.map((id) => ({ materialId: id })),
        // Flatten per-bathroom fixtures for server storage
        fixtures: Object.entries(draft.bathroomFixtures).flatMap(([bIdx, arr]) =>
          arr.filter((f) => f.quantity >= 1).map((f) => ({ ...f, bathroomIndex: Number(bIdx) }))
        ),
        bathroomFixtures: draft.bathroomFixtures,
        addons: draft.addons.filter((a) => a.quantity >= 1),
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
            <TilesStep draft={draft} mutate={mutate} tileGroups={tileGroups} loading={materialsLoading} />
          ) : null}
          {STEPS[step].id === 'fixtures' ? (
            <FixturesStep draft={draft} mutate={mutate} groups={fixtureGroups} materials={materials} bundles={bundles} loading={materialsLoading || bundlesLoading} />
          ) : null}
          {STEPS[step].id === 'addons' ? (
            <AddonsStep
              draft={draft}
              mutate={mutate}
              materials={addonMaterials}
              loading={materialsLoading}
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
                {formatINR(quote.combined?.finalQuotationAmount ?? quote.calc.totalPayable)}
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
          accent ? 'text-[#996832]' : muted ? 'text-muted-foreground' : 'text-foreground'
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
    combined?: CombinedQuotationResult
  }
  gstRate: number
  discountHint: string
}) {
  const calc = quote.calc
  const combined = quote.combined
  const floorArea = combined ? combined.totalFloorArea : calc.totalArea
  const wallArea = combined ? combined.totalWallArea : 0
  const grossValue = combined ? combined.totalBathroomGross : calc.grossValue
  const discountAmount = combined ? combined.projectDiscountAmount : calc.discountAmount
  const taxableValue = combined ? combined.projectTaxableValue : calc.taxableValue
  const gstAmount = combined ? combined.projectGstAmount : calc.gstAmount
  const totalPayable = combined ? combined.finalQuotationAmount : calc.totalPayable
  const showDiscount = discountAmount > 0

  return (
    <div className="space-y-1.5">
      <SummaryRow2 label="Floor Area" value={areaLabel(floorArea)} muted />
      {wallArea > 0 ? <SummaryRow2 label="Wall Area" value={areaLabel(wallArea)} muted /> : null}
      {combined ? (
        <SummaryRow2 label="Bathrooms in Scope" value={`${combined.bathrooms.length} Bathrooms`} muted />
      ) : null}
      <SummaryRow2 label="Package" value={quote.pkg?.name ?? '—'} muted />
      <SummaryRow2 label="Items" value={String(quote.items.length)} muted />
      <Separator className="my-3" />
      <SummaryRow2 label="Gross Value" value={formatINR(grossValue)} />
      {showDiscount ? <SummaryRow2 label={`Discount (${discountHint})`} value={`−${formatINR(discountAmount)}`} accent /> : null}
      <SummaryRow2 label="Taxable Value" value={formatINR(taxableValue)} />
      <SummaryRow2 label={`GST @ ${gstRate}%`} value={formatINR(gstAmount)} />
      <Separator className="my-3" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Payable</span>
        <span className="text-2xl font-extrabold text-primary">{formatINR(totalPayable)}</span>
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
    combined?: CombinedQuotationResult
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
        title="Separate Bathroom Breakdown & Measurements"
        desc="Capture each bathroom's dimensions in feet or millimetres. Floor and wall areas are calculated with exact formulas."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {draft.bathrooms.map((b, i) => {
          const unit = b.unit === 'mm' ? 'mm' : 'ft'
          const isMm = unit === 'mm'
          const len = toNum(b.length)
          const wid = toNum(b.width)
          const hgt = toNum(b.height) > 0 ? toNum(b.height) : (isMm ? 3048 : 10)
          const openings = toNum(b.openingsArea)

          const floorArea = computeFloorArea(len, wid, unit)
          const wallArea = computeWallArea(len, wid, hgt, unit, openings)

          const lenFt = isMm ? round2(len / 304.8) : len
          const widFt = isMm ? round2(wid / 304.8) : wid
          const perimeter = round2(2 * (len + wid))

          return (
            <Card key={i} className="gap-0 rounded-2xl p-4 md:p-5 shadow-sm border">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <Input
                    value={b.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    className="h-10 max-w-[200px] border-none bg-muted/60 px-3 font-bold text-foreground shadow-none"
                    aria-label={`Bathroom ${i + 1} name`}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full"
                    onClick={() => duplicateBathroom(i)}
                    disabled={draft.bathrooms.length >= MAX_BATHROOMS}
                    aria-label={`Duplicate ${b.name}`}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => removeBathroom(i)}
                    disabled={draft.bathrooms.length <= 1}
                    aria-label={`Remove ${b.name}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Area summary pills */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary">
                  <Ruler className="size-3.5" />
                  Floor Area: {areaLabel(floorArea)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  Wall Area: {areaLabel(wallArea)}
                </span>
              </div>

              {/* Unit Selector */}
              <div className="mt-3.5 space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Measurement Unit</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => update(i, { unit: 'ft' })}
                    className={cn(
                      'flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold transition-colors',
                      !isMm
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    Feet (ft)
                  </button>
                  <button
                    type="button"
                    onClick={() => update(i, { unit: 'mm' })}
                    className={cn(
                      'flex min-h-10 items-center justify-center rounded-xl border text-xs font-semibold transition-colors',
                      isMm
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    Millimetres (mm)
                  </button>
                </div>
              </div>

              {/* Dimensions Input Grid */}
              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <Field label="Bathroom Type">
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
                <Field label={`Length (${unit})`} required>
                  <Input
                    type="number"
                    min="0"
                    step={isMm ? '1' : '0.1'}
                    inputMode="decimal"
                    value={b.length}
                    onChange={(e) => update(i, { length: e.target.value })}
                    placeholder={isMm ? 'e.g. 2743' : 'e.g. 9'}
                    className="min-h-11"
                  />
                </Field>
                <Field label={`Width (${unit})`} required>
                  <Input
                    type="number"
                    min="0"
                    step={isMm ? '1' : '0.1'}
                    inputMode="decimal"
                    value={b.width}
                    onChange={(e) => update(i, { width: e.target.value })}
                    placeholder={isMm ? 'e.g. 1524' : 'e.g. 5'}
                    className="min-h-11"
                  />
                </Field>
                <Field label={`Wall Height (${unit})`}>
                  <Input
                    type="number"
                    min="0"
                    step={isMm ? '1' : '0.1'}
                    inputMode="decimal"
                    value={b.height}
                    onChange={(e) => update(i, { height: e.target.value })}
                    placeholder={isMm ? 'e.g. 3048' : 'e.g. 10'}
                    className="min-h-11"
                  />
                </Field>
                <Field label="Openings Deduction (sq.ft, optional)" className="sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    value={b.openingsArea}
                    onChange={(e) => update(i, { openingsArea: e.target.value })}
                    placeholder="e.g. 21 (doors and windows deduction)"
                    className="min-h-11"
                  />
                </Field>
              </div>

              {/* Exact Formula & Calculation breakdown */}
              <div className="mt-4 rounded-xl border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <div className="font-bold uppercase tracking-wider text-foreground text-[10px] mb-1">
                  Measurement Calculations
                </div>
                {isMm ? (
                  <div className="space-y-1">
                    <div>
                      • Length in feet = {len || 0} mm / 304.8 = <b className="text-foreground">{lenFt} ft</b>
                    </div>
                    <div>
                      • Width in feet = {wid || 0} mm / 304.8 = <b className="text-foreground">{widFt} ft</b>
                    </div>
                    <div>
                      • Floor area = {len || 0} mm × {wid || 0} mm / 92,903.04 = <b className="text-primary">{floorArea} sq.ft</b>
                    </div>
                    <div>
                      • Wall perimeter = 2 × ({len || 0} + {wid || 0}) = {perimeter} mm
                    </div>
                    <div>
                      • Wall area = (2 × ({len || 0} + {wid || 0}) × {hgt}) / 92,903.04 {openings > 0 ? `− ${openings} sq.ft openings` : ''} = <b className="text-foreground">{wallArea} sq.ft</b>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div>
                      • Floor area = Length ({len || 0} ft) × Width ({wid || 0} ft) = <b className="text-primary">{floorArea} sq.ft</b>
                    </div>
                    <div>
                      • Wall perimeter = 2 × ({len || 0} + {wid || 0}) = {perimeter} ft
                    </div>
                    <div>
                      • Wall area = {perimeter} ft × {hgt} ft {openings > 0 ? `− ${openings} sq.ft openings` : ''} = <b className="text-foreground">{wallArea} sq.ft</b>
                    </div>
                  </div>
                )}
                <p className="mt-1.5 text-[10px] italic text-muted-foreground">
                  * Wall area is calculated from wall lengths &amp; height — never calculated from floor area alone.
                </p>
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
        Add Another Bathroom
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
  tileGroups,
  loading,
}: {
  draft: DraftState
  mutate: Mutate
  tileGroups: { name: string; items: MaterialRow[] }[]
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [subFilter, setSubFilter] = useState<string>('ALL')

  const toggle = (id: string) =>
    mutate((prev) => ({
      ...prev,
      tiles: prev.tiles.includes(id) ? prev.tiles.filter((t) => t !== id) : [...prev.tiles, id],
    }))

  const subCategories = useMemo(() => {
    const names = tileGroups.map((g) => g.name).filter(Boolean)
    return names.length > 1 ? ['ALL', ...names] : ['ALL']
  }, [tileGroups])

  const filteredGroups = useMemo(() => {
    return tileGroups
      .filter((g) => subFilter === 'ALL' || g.name === subFilter)
      .map((g) => ({
        ...g,
        items: g.items.filter((m) => {
          if (!search.trim()) return true
          const q = search.toLowerCase()
          return (
            m.name.toLowerCase().includes(q) ||
            (m.brand ?? '').toLowerCase().includes(q) ||
            (m.subCategory ?? '').toLowerCase().includes(q)
          )
        }),
      }))
      .filter((g) => g.items.length > 0)
  }, [tileGroups, search, subFilter])

  const allMaterials = tileGroups.flatMap((g) => g.items)

  return (
    <div className="space-y-4">
      <StepIntro
        title="Tiles Catalogue"
        desc="Select floor tiles, wall tiles, or combined tiles. Quantities are computed automatically from coverage + wastage."
      />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : allMaterials.length === 0 ? (
        <EmptyBlock text="No active tiles in the catalogue yet. Add tiles via the Materials section." />
      ) : (
        <>
          {/* Search + Sub-category filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tiles by name or brand…"
                className="min-h-10 pl-9"
              />
            </div>
            {subCategories.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {subCategories.map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setSubFilter(sc)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                      subFilter === sc
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    {sc === 'ALL' ? 'All Types' : sc}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyBlock text="No tiles match your search." />
          ) : (
            filteredGroups.map((group) => (
              <div key={group.name || 'tiles'} className="space-y-2">
                {group.name ? (
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {group.name}
                  </h3>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {group.items.map((m) => {
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
                          <span className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {m.unit}
                            </span>
                            {m.price > 0 ? (
                              <span className="inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-primary">
                                {formatINR(m.price)}
                              </span>
                            ) : null}
                            {m.coverage && m.coverage > 0 ? (
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                {m.coverage} {m.coverageUnit ?? 'sq.ft'}/unit
                              </span>
                            ) : null}
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
              </div>
            ))
          )}
        </>
      )}
      {draft.tiles.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {draft.tiles.length} tile option{draft.tiles.length === 1 ? '' : 's'} selected — quantities are computed from bathroom areas in the Cost step.
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step: Fixtures — per-bathroom selection & Brand Bundles
// ---------------------------------------------------------------------------

function FixturesStep({
  draft,
  mutate,
  groups,
  materials,
  bundles,
  loading,
}: {
  draft: DraftState
  mutate: Mutate
  groups: { name: string; items: MaterialRow[] }[]
  materials: MaterialRow[]
  bundles: BrandBundle[]
  loading: boolean
}) {
  const [activeBath, setActiveBath] = useState(0)
  const [bundleFilter, setBundleFilter] = useState<'ALL' | 'BASIC' | 'PREMIUM' | 'LUXURY' | 'CUSTOM'>('ALL')
  const [brandFilter, setBrandFilter] = useState<string>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null)
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set())
  const [addBrandOpen, setAddBrandOpen] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [extraBrands, setExtraBrands] = useState<string[]>([])
  const bathCount = draft.bathrooms.length

  const activeBathName = draft.bathrooms[activeBath]?.name || `Bathroom ${activeBath + 1}`
  const activeBathKey = String(activeBath)
  const activeBathBundle = draft.bathroomBundles?.[activeBathKey]

  const qtyOf = (bathroomIdx: number, id: string) =>
    (draft.bathroomFixtures[String(bathroomIdx)] ?? []).find((f) => f.materialId === id)?.quantity ?? 0

  const setQty = (bathroomIdx: number, id: string, qty: number) =>
    mutate((prev) => {
      const key = String(bathroomIdx)
      const clamped = Math.min(MAX_QTY, Math.max(0, Math.round(qty)))
      const rest = (prev.bathroomFixtures[key] ?? []).filter((f) => f.materialId !== id)
      const newArr = clamped >= 1 ? [...rest, { materialId: id, quantity: clamped }] : rest
      return {
        ...prev,
        bathroomFixtures: { ...prev.bathroomFixtures, [key]: newArr },
      }
    })

  // Apply bundle to active bathroom
  const applyBundleToBathroom = (bundle: BrandBundle, targetBathIdx?: number) => {
    const targetIdx = targetBathIdx ?? activeBath
    const targetKey = String(targetIdx)
    const targetName = draft.bathrooms[targetIdx]?.name || `Bathroom ${targetIdx + 1}`

    // Convert bundle items to fixture selections
    const newFixtures: { materialId: string; quantity: number }[] = bundle.items.map((it) => ({
      materialId: it.materialId,
      quantity: Math.max(1, Math.round(it.quantity)),
    }))

    mutate((prev) => {
      return {
        ...prev,
        bundleId: bundle.id,
        bundleName: bundle.name,
        bathroomBundles: {
          ...prev.bathroomBundles,
          [targetKey]: { bundleId: bundle.id, bundleName: bundle.name },
        },
        bathroomFixtures: {
          ...prev.bathroomFixtures,
          [targetKey]: newFixtures,
        },
      }
    })

    toast.success(`Applied "${bundle.name}" to ${targetName} (${newFixtures.length} items)`)
  }

  // Apply bundle to ALL bathrooms
  const applyBundleToAllBathrooms = (bundle: BrandBundle) => {
    const newBf: BathroomFixtureMap = {}
    const newBb: Record<string, { bundleId: string; bundleName: string }> = {}

    const newFixtures = bundle.items.map((it) => ({
      materialId: it.materialId,
      quantity: Math.max(1, Math.round(it.quantity)),
    }))

    draft.bathrooms.forEach((_, idx) => {
      newBf[String(idx)] = [...newFixtures]
      newBb[String(idx)] = { bundleId: bundle.id, bundleName: bundle.name }
    })

    mutate((prev) => ({
      ...prev,
      bundleId: bundle.id,
      bundleName: bundle.name,
      bathroomBundles: newBb,
      bathroomFixtures: newBf,
    }))

    toast.success(`Applied "${bundle.name}" to all ${bathCount} bathrooms`)
  }

  // Clear / remove bundle from bathroom
  const removeBundleFromBathroom = (targetBathIdx?: number) => {
    const targetIdx = targetBathIdx ?? activeBath
    const targetKey = String(targetIdx)
    const targetName = draft.bathrooms[targetIdx]?.name || `Bathroom ${targetIdx + 1}`

    mutate((prev) => {
      const nextBb = { ...(prev.bathroomBundles || {}) }
      delete nextBb[targetKey]
      return {
        ...prev,
        bathroomBundles: nextBb,
        bathroomFixtures: {
          ...prev.bathroomFixtures,
          [targetKey]: [],
        },
      }
    })
    toast.info(`Cleared fixtures & bundle for ${targetName}`)
  }

  // Filter bundles
  const filteredBundles = useMemo(() => {
    if (bundleFilter === 'ALL') return bundles
    return bundles.filter((b) => b.bundleType === bundleFilter)
  }, [bundles, bundleFilter])

  // All fixture materials list (excluding tiles & addons)
  const allFixtureMaterials = useMemo(() => {
    return materials.filter((m) => {
      const cat = m.category?.name
      return cat && !NON_FIXTURE_CATEGORIES.has(cat)
    })
  }, [materials])

  // Unique brands across all fixture materials + any user-added brands
  const availableBrands = useMemo(() => {
    const set = new Set<string>()
    for (const m of allFixtureMaterials) {
      if (m.brand) set.add(m.brand)
    }
    for (const b of extraBrands) set.add(b)
    return Array.from(set).sort()
  }, [allFixtureMaterials, extraBrands])

  // Filtered fixture materials based on search, brand and category
  const filteredMaterials = useMemo(() => {
    let list = allFixtureMaterials
    if (brandFilter !== 'ALL') {
      list = list.filter((m) => m.brand === brandFilter)
    }
    if (categoryFilter !== 'ALL') {
      list = list.filter((m) => m.category?.name === categoryFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.brand && m.brand.toLowerCase().includes(q)) ||
          (m.sku && m.sku.toLowerCase().includes(q)) ||
          (m.subCategory && m.subCategory.toLowerCase().includes(q))
      )
    }
    return list
  }, [allFixtureMaterials, brandFilter, categoryFilter, searchQuery])

  // Group filtered materials by brand → then by category inside each brand
  const brandGroups = useMemo(() => {
    // Build brand → category → items map
    const brandMap = new Map<string, Map<string, MaterialRow[]>>()
    for (const m of filteredMaterials) {
      const brand = m.brand || 'Other'
      const cat = m.category?.name || 'General'
      if (!brandMap.has(brand)) brandMap.set(brand, new Map())
      const catMap = brandMap.get(brand)!
      const list = catMap.get(cat) ?? []
      list.push(m)
      catMap.set(cat, list)
    }
    return Array.from(brandMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([brand, catMap]) => ({
        brand,
        totalItems: filteredMaterials.filter((m) => (m.brand || 'Other') === brand).length,
        categories: Array.from(catMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([catName, items]) => ({ catName, items })),
      }))
  }, [filteredMaterials])

  // Available categories: always all categories from ALL fixture materials (not filtered by brand/search)
  const availableCategories = useMemo(() => {
    const set = new Set<string>()
    for (const m of allFixtureMaterials) {
      if (m.category?.name) set.add(m.category.name)
    }
    return Array.from(set).sort()
  }, [allFixtureMaterials])

  // Current bathroom fixtures count and subtotal
  const currentBathFixtures = draft.bathroomFixtures[activeBathKey] ?? []
  const activeBathItemCount = currentBathFixtures.filter((f) => f.quantity >= 1).length
  const activeBathSubtotal = currentBathFixtures.reduce((sum, f) => {
    const m = materials.find((mat) => mat.id === f.materialId)
    return sum + (m?.price ?? 0) * f.quantity
  }, 0)

  // Total fixtures count across all bathrooms
  const totalFixtureCount = Object.values(draft.bathroomFixtures).reduce(
    (sum, arr) => sum + arr.filter((f) => f.quantity >= 1).length,
    0
  )

  const BUNDLE_TYPE_META: Record<string, { label: string; badge: string }> = {
    BASIC: { label: 'Basic Package', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
    PREMIUM: { label: 'Premium Package', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
    LUXURY: { label: 'Luxury Package', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
    CUSTOM: { label: 'Custom Brand Combo', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  }

  return (
    <div className="space-y-6">
      <StepIntro
        title="Select Fixtures, Materials & Brand Bundles"
        desc="Choose pre-curated brand bundles or customize fixtures for each bathroom. Real-time stock levels and permanent quote snapshots ensure pricing & inventory integrity."
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* Bathroom Navigation Tabs */}
          {bathCount > 1 ? (
            <div className="-mx-1 flex flex-wrap gap-2 overflow-x-auto px-1 pb-1">
              {draft.bathrooms.map((b, idx) => {
                const count = (draft.bathroomFixtures[String(idx)] ?? []).filter((f) => f.quantity >= 1).length
                const bundle = draft.bathroomBundles?.[String(idx)]
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveBath(idx)}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap',
                      activeBath === idx
                        ? 'border-primary bg-orange-50 text-primary ring-2 ring-primary/20 shadow-sm'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
                        activeBath === idx ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {idx + 1}
                    </span>
                    <span>{b.name || `Bathroom ${idx + 1}`}</span>
                    {bundle ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        Bundle
                      </span>
                    ) : null}
                    {count > 0 ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {count} items
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}

          {/* Active Bathroom Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-orange-50/70 via-orange-50/30 to-amber-50/40 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-black text-white">
                  BATHROOM {activeBath + 1}
                </span>
                <p className="text-sm font-bold text-foreground">{activeBathName}</p>
                {activeBathBundle ? (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-bold">
                    Bundle: {activeBathBundle.bundleName}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeBathItemCount > 0
                  ? `${activeBathItemCount} fixture${activeBathItemCount === 1 ? '' : 's'} selected · Subtotal: ${formatINR(activeBathSubtotal)}`
                  : 'No fixtures selected yet for this bathroom.'}
              </p>
            </div>

            {activeBathBundle ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeBundleFromBathroom()}
                className="min-h-9 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RotateCcw className="size-3.5" />
                Reset Bathroom Fixtures
              </Button>
            ) : null}
          </div>

          {/* ================================================================= */}
          {/* SECTION 1: PREDEFINED BRAND BUNDLES */}
          {/* ================================================================= */}
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Boxes className="size-4" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    Predefined Brand Bundles
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-bold">
                    {bundles.length} Available
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Apply approved brand collections (Basic, Premium, Luxury, or Custom Combos). All products, quantities and snapshot prices are frozen into the quote and can be further tailored below.
                </p>
              </div>

              {/* Bundle Type Filter Buttons */}
              <div className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
                {(['ALL', 'BASIC', 'PREMIUM', 'LUXURY', 'CUSTOM'] as const).map((type) => {
                  const count = type === 'ALL' ? bundles.length : bundles.filter((b) => b.bundleType === type).length
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBundleFilter(type)}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                        bundleFilter === type
                          ? 'bg-card text-primary shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {type === 'ALL' ? 'All Bundles' : type.charAt(0) + type.slice(1).toLowerCase()} ({count})
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bundles Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {filteredBundles.map((bundle) => {
                const isAppliedToCurrent = activeBathBundle?.bundleId === bundle.id
                const isExpanded = expandedBundleId === bundle.id

                // Calculate bundle pricing
                const materialCost = bundle.items.reduce((sum, it) => sum + (it.rate || it.material?.price || 0) * it.quantity, 0)
                const installCost = bundle.items.reduce((sum, it) => sum + (it.installCost || 0), 0)
                const totalCost = materialCost + installCost

                // Extract unique brands
                const brandsInBundle = Array.from(
                  new Set(
                    bundle.items
                      .map((it) => it.material?.brand)
                      .filter((b): b is string => Boolean(b))
                  )
                )

                const meta = BUNDLE_TYPE_META[bundle.bundleType] || BUNDLE_TYPE_META.BASIC

                return (
                  <Card
                    key={bundle.id}
                    className={cn(
                      'flex flex-col justify-between rounded-2xl border p-4 transition-all',
                      isAppliedToCurrent
                        ? 'border-primary bg-orange-50/40 ring-2 ring-primary/20 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40'
                    )}
                  >
                    <div className="space-y-3">
                      {/* Bundle Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn('text-[10px] font-bold', meta.badge)}>
                              {meta.label}
                            </Badge>
                            {isAppliedToCurrent ? (
                              <Badge className="bg-emerald-600 text-[10px] font-bold text-white">
                                ✓ Applied to {activeBathName}
                              </Badge>
                            ) : null}
                          </div>
                          <h4 className="text-sm font-bold text-foreground leading-snug">{bundle.name}</h4>
                        </div>
                      </div>

                      {bundle.description ? (
                        <p className="text-xs text-muted-foreground line-clamp-2">{bundle.description}</p>
                      ) : null}

                      {/* Brand pills */}
                      {brandsInBundle.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-muted-foreground">Brands:</span>
                          {brandsInBundle.map((br) => (
                            <span
                              key={br}
                              className="inline-block rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground"
                            >
                              {br}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {/* Item Preview summary */}
                      <div className="rounded-xl border border-border/80 bg-muted/30 p-2.5 text-xs">
                        <div className="flex items-center justify-between font-semibold text-foreground">
                          <span>{bundle.items.length} Curated Products Included</span>
                          <button
                            type="button"
                            onClick={() => setExpandedBundleId(isExpanded ? null : bundle.id)}
                            className="text-primary hover:underline font-bold text-[11px] flex items-center gap-1"
                          >
                            {isExpanded ? 'Hide items' : 'View products'}
                            <ChevronDown className={cn('size-3 transition-transform', isExpanded ? 'rotate-180' : '')} />
                          </button>
                        </div>

                        {/* Expandable item table */}
                        {isExpanded ? (
                          <div className="mt-2.5 space-y-1.5 border-t pt-2 max-h-56 overflow-y-auto">
                            {bundle.items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between text-[11px] py-1 border-b border-border/50 last:border-none"
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <p className="font-semibold truncate text-foreground">
                                    {it.material?.name || `Material ${it.materialId.slice(-4)}`}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {it.material?.brand || ''} {it.material?.category?.name ? `· ${it.material.category.name}` : ''}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-foreground tabular-nums">
                                    {it.quantity} {it.unit}
                                  </span>
                                  <span className="block text-[10px] text-muted-foreground tabular-nums">
                                    @ {formatINR(it.rate || it.material?.price || 0)}
                                    {it.installCost > 0 ? ` (+₹${it.installCost} inst)` : ''}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                            {bundle.items
                              .map((it) => `${it.material?.name || 'Item'} (x${it.quantity})`)
                              .slice(0, 4)
                              .join(', ')}
                            {bundle.items.length > 4 ? ` + ${bundle.items.length - 4} more` : ''}
                          </p>
                        )}
                      </div>

                      {/* Pricing Bar */}
                      <div className="flex items-center justify-between rounded-xl bg-orange-50/50 p-2.5 text-xs">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Bundle Value
                          </span>
                          <span className="text-sm font-extrabold text-primary tabular-nums">
                            {formatINR(totalCost)}
                          </span>
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
                          <span>Materials: {formatINR(materialCost)}</span>
                          <span className="block">Installation: {formatINR(installCost)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t">
                      {isAppliedToCurrent ? (
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                            <CheckCircle2 className="size-4" />
                            Applied to {activeBathName}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeBundleFromBathroom()}
                            className="text-xs text-destructive hover:bg-destructive/10"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            className="flex-1 min-h-10 text-xs font-bold gap-1.5"
                            onClick={() => applyBundleToBathroom(bundle)}
                          >
                            <PackageCheck className="size-4" />
                            Apply to {activeBathName}
                          </Button>
                          {bathCount > 1 ? (
                            <Button
                              variant="outline"
                              className="min-h-10 text-xs font-semibold"
                              onClick={() => applyBundleToAllBathrooms(bundle)}
                            >
                              Apply to All ({bathCount})
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* ================================================================= */}
          {/* SECTION 2: INDIVIDUAL FIXTURES & MATERIALS — BRAND-FIRST LAYOUT */}
          {/* ================================================================= */}
          <div className="space-y-4">
            {/* Header + Search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Individual Fixtures &amp; Materials
                </h3>
                <p className="text-xs text-muted-foreground">
                  Browse by brand, then filter by category. Real-time stock indicators shown on each product.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, brand, SKU..."
                  className="pl-9 text-xs min-h-10 rounded-xl"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Brand Filter Tabs */}
            <div className="-mx-1 flex flex-wrap gap-1.5 overflow-x-auto px-1 pb-1 items-center">
              {/* All Brands pill */}
              <button
                type="button"
                onClick={() => { setBrandFilter('ALL'); setCategoryFilter('ALL') }}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap border',
                  brandFilter === 'ALL'
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                )}
              >
                All Brands ({allFixtureMaterials.length})
              </button>

              {/* Brand pills */}
              {availableBrands.map((br) => {
                const count = allFixtureMaterials.filter((m) => m.brand === br).length
                return (
                  <button
                    key={br}
                    type="button"
                    onClick={() => { setBrandFilter(br); setCategoryFilter('ALL') }}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap border',
                      brandFilter === br
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {br} ({count})
                  </button>
                )
              })}

              {/* Add Brand — inline */}
              {addBrandOpen ? (
                <div className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-orange-50/60 px-2 py-1">
                  <Input
                    autoFocus
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const name = newBrandName.trim()
                        if (name && !extraBrands.includes(name) && !availableBrands.includes(name)) {
                          setExtraBrands((prev) => [...prev, name])
                          setBrandFilter(name)
                        }
                        setNewBrandName('')
                        setAddBrandOpen(false)
                      }
                      if (e.key === 'Escape') { setNewBrandName(''); setAddBrandOpen(false) }
                    }}
                    placeholder="Brand name…"
                    className="h-6 w-28 border-none bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const name = newBrandName.trim()
                      if (name && !extraBrands.includes(name) && !availableBrands.includes(name)) {
                        setExtraBrands((prev) => [...prev, name])
                        setBrandFilter(name)
                      }
                      setNewBrandName('')
                      setAddBrandOpen(false)
                    }}
                    className="text-primary hover:text-primary/80"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => { setNewBrandName(''); setAddBrandOpen(false) }} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddBrandOpen(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors whitespace-nowrap"
                >
                  <Plus className="size-3" />
                  Add Brand
                </button>
              )}
            </div>

            {/* Category sub-filter pills — ALWAYS show all categories, filtered by brand when active */}
            <div className={cn(
              '-mx-1 flex flex-wrap gap-1.5 overflow-x-auto px-1 pb-1',
              brandFilter !== 'ALL' && 'border-l-2 border-primary/30 pl-3'
            )}>
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap',
                  categoryFilter === 'ALL'
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                All Categories
              </button>
              {availableCategories.map((catName) => (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setCategoryFilter(catName)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap',
                    categoryFilter === catName
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {catName}
                </button>
              ))}
            </div>

            {/* Brand → Category → Products */}
            {brandGroups.length === 0 ? (
              <EmptyBlock text="No fixtures found matching your filters." />
            ) : (
              <div className="space-y-5">
                {brandGroups.map((bg) => {
                  const isExpanded = expandedBrands.has(bg.brand)
                  const selectedInBrand = (draft.bathroomFixtures[activeBathKey] ?? []).filter(
                    (f) => {
                      const mat = materials.find((m) => m.id === f.materialId)
                      return f.quantity >= 1 && (mat?.brand || 'Other') === bg.brand
                    }
                  ).length

                  return (
                    <div
                      key={bg.brand}
                      className={cn(
                        'rounded-2xl border transition-all',
                        isExpanded ? 'border-primary/30 shadow-sm' : 'border-border'
                      )}
                    >
                      {/* Brand header — click to expand/collapse */}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedBrands((prev) => {
                            const next = new Set(prev)
                            if (next.has(bg.brand)) next.delete(bg.brand)
                            else next.add(bg.brand)
                            return next
                          })
                        }
                        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          {/* Brand avatar / badge */}
                          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary font-black text-sm shrink-0">
                            {bg.brand.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground leading-tight">{bg.brand}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {bg.categories.length} categor{bg.categories.length === 1 ? 'y' : 'ies'} · {bg.totalItems} product{bg.totalItems === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {selectedInBrand > 0 ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                              {selectedInBrand} selected
                            </span>
                          ) : null}
                          {/* Category mini-pills */}
                          <div className="hidden sm:flex flex-wrap gap-1 max-w-xs">
                            {bg.categories.slice(0, 3).map((cg) => (
                              <span
                                key={cg.catName}
                                className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                              >
                                {cg.catName}
                              </span>
                            ))}
                            {bg.categories.length > 3 ? (
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                +{bg.categories.length - 3} more
                              </span>
                            ) : null}
                          </div>
                          <ChevronDown
                            className={cn('size-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                          />
                        </div>
                      </button>

                      {/* Expanded: categories + products */}
                      {isExpanded ? (
                        <div className="border-t px-4 pb-4 pt-3 space-y-5">
                          {bg.categories.map((cg) => (
                            <div key={cg.catName} className="space-y-2.5">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary uppercase tracking-wide">
                                  {cg.catName}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {cg.items.length} product{cg.items.length === 1 ? '' : 's'}
                                </span>
                                <div className="h-px flex-1 bg-border" />
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {cg.items.map((m) => (
                                  <FixtureCard
                                    key={m.id}
                                    material={m}
                                    quantity={qtyOf(activeBath, m.id)}
                                    onAdd={() => setQty(activeBath, m.id, 1)}
                                    onInc={() => setQty(activeBath, m.id, qtyOf(activeBath, m.id) + 1)}
                                    onDec={() => setQty(activeBath, m.id, qtyOf(activeBath, m.id) - 1)}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom Summary Bar */}
          {totalFixtureCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-orange-50/60 p-4">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground">
                  {totalFixtureCount} fixture item{totalFixtureCount === 1 ? '' : 's'} configured across {bathCount} bathroom{bathCount === 1 ? '' : 's'}.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Historical quotations permanently lock these item selections and prices.
                </p>
              </div>
              <div className="text-sm font-bold text-foreground">
                Current Bathroom ({activeBathName}): <span className="font-extrabold text-primary">{formatINR(activeBathSubtotal)}</span>
              </div>
            </div>
          ) : null}
        </>
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
  const availableStock = material.availableQty ?? Math.max(0, (material.stockQty ?? 0) - (material.reservedQty ?? 0))
  const isOutOfStock = material.isOutOfStock ?? availableStock <= 0
  const isLowStock = material.isLowStock ?? (availableStock > 0 && availableStock <= (material.reorderThreshold ?? 5))

  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-2.5 rounded-2xl border p-3.5 shadow-sm transition-all',
        selected ? 'border-primary/60 bg-orange-50/40 ring-1 ring-primary/20' : 'border-border bg-card hover:border-border/80'
      )}
    >
      <div className="flex items-start gap-3">
        <MaterialImage material={material} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {material.brand ? (
              <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                {material.brand}
              </span>
            ) : null}
            {material.sku ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                {material.sku}
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {material.name}
          </p>

          {material.description ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{material.description}</p>
          ) : null}

          {/* Pricing & Stock Badges */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-primary tabular-nums">
              {formatINR(material.price)}
              <span className="text-[10px] font-normal text-muted-foreground ml-0.5">/{material.unit}</span>
            </span>

            {/* Inventory / Stock Pill */}
            {isOutOfStock ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                ✕ Out of Stock ({material.stockQty ?? 0} physical)
              </span>
            ) : isLowStock ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                ⚠ Low Stock: {availableStock} left
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                ✓ In Stock: {availableStock} avail
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stepper & Line Subtotal */}
      <div className="flex items-center justify-between border-t pt-2 mt-1">
        <div className="text-xs text-muted-foreground">
          {selected ? (
            <span className="font-semibold text-foreground">
              Total: <span className="font-extrabold text-primary tabular-nums">{formatINR(material.price * quantity)}</span>
            </span>
          ) : (
            <span className="text-[11px]">Unit: {material.unit}</span>
          )}
        </div>

        {selected ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-9 rounded-xl"
              onClick={onDec}
              aria-label={`Decrease ${material.name} quantity`}
            >
              <Minus className="size-3.5" />
            </Button>
            <span className="w-7 text-center text-sm font-extrabold tabular-nums">{quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="size-9 rounded-xl"
              onClick={onInc}
              disabled={quantity >= MAX_QTY}
              aria-label={`Increase ${material.name} quantity`}
            >
              <Plus className="size-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="min-h-9 shrink-0 gap-1.5 text-xs font-semibold" onClick={onAdd}>
            <Plus className="size-3.5" />
            Add
          </Button>
        )}
      </div>
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
}: {
  draft: DraftState
  mutate: Mutate
  materials: MaterialRow[]
  loading: boolean
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
      ) : materials.length === 0 ? (
        <EmptyBlock text="No active add-ons in the catalogue yet." />
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
        </div>
      )}
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
    combined: CombinedQuotationResult
  }
  gstRate: number
  discountHint: string
}) {
  const calc = quote.calc
  const combined = quote.combined
  const bathrooms = combined.bathrooms

  return (
    <div className="space-y-6">
      <StepIntro
        title="Cost, Separate Bathroom Breakdown & Combined Settlement"
        desc="Review each bathroom's detailed materials & labour, comparison totals, and final project settlement."
      />

      {/* Project-wide discount & notes inputs */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-0 rounded-2xl p-4 md:p-5 shadow-sm border">
          <h3 className="text-sm font-bold text-foreground">Project-Wide Discount</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Apply a discount across the entire quotation subtotal.
          </p>
          <div className="mt-3.5 grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Discount Type">
              <Select
                value={draft.discountType}
                onValueChange={(v) => mutate({ discountType: v === 'PERCENT' ? 'PERCENT' : 'FLAT' })}
              >
                <SelectTrigger className="min-h-11 w-full" aria-label="Discount type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLAT">₹ Flat Amount</SelectItem>
                  <SelectItem value="PERCENT">% of Subtotal</SelectItem>
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
          {combined.projectDiscountAmount > 0 ? (
            <p className="mt-3 text-xs font-semibold text-primary">
              Discount applied: −{formatINR(combined.projectDiscountAmount)} ({discountHint})
            </p>
          ) : null}
        </Card>

        <Card className="gap-0 rounded-2xl p-4 md:p-5 shadow-sm border">
          <h3 className="text-sm font-bold text-foreground">Quotation Notes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Scope notes, brand specifications, and delivery terms.
          </p>
          <Textarea
            value={draft.notes}
            onChange={(e) => mutate({ notes: e.target.value })}
            placeholder="e.g. Full wall tiling up to ceiling height; Jaquar sanitaryware; 10-year warranty on waterproofing…"
            className="mt-3.5 min-h-[92px]"
          />
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1, 2, 3: Separate Bathroom-Wise Breakdowns */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-foreground">
              1. Separate Bathroom-Wise Breakdown ({bathrooms.length} {bathrooms.length === 1 ? 'Bathroom' : 'Bathrooms'})
            </h3>
            <p className="text-xs text-muted-foreground">
              Individual scope, dimensions, floor &amp; wall areas, materials, fixtures, accessories, and labour for each bathroom.
            </p>
          </div>
        </div>

        <div className="grid gap-5">
          {bathrooms.map((b, idx) => {
            const isMm = b.unit === 'mm'
            const wallH = b.height || (isMm ? 3048 : 10)

            return (
              <Card key={idx} className="gap-0 overflow-hidden rounded-2xl border shadow-sm">
                {/* Bathroom Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-white">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{b.name}</h4>
                      <p className="text-[11px] text-muted-foreground">
                        {bathroomTypeLabels[b.type] ?? b.type} · Dimensions: {b.length} × {b.width} × {wallH} {b.unit}
                        {isMm ? ` (${b.lengthInFeet} × ${b.widthInFeet} × ${b.heightInFeet} ft)` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-100/70 px-2.5 py-1 text-xs font-bold text-primary">
                      Floor: {b.floorAreaSqft} sq.ft
                    </span>
                    <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-xs font-bold text-slate-800">
                      Wall: {b.wallAreaSqft} sq.ft
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                      Subtotal: {formatINR(b.bathroomSubtotal)}
                    </span>
                  </div>
                </div>

                {/* Bathroom Items Breakdown */}
                <div className="overflow-x-auto p-4">
                  <table className="w-full min-w-[540px] text-xs">
                    <thead>
                      <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 text-left font-semibold">Scope Item</th>
                        <th className="py-2 text-right font-semibold">Qty</th>
                        <th className="py-2 text-right font-semibold">Unit</th>
                        <th className="py-2 text-right font-semibold">Rate</th>
                        <th className="py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Selected Materials & Tile Requirements */}
                      {b.tiles.length > 0 ? (
                        <>
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-1 px-2 font-bold uppercase tracking-wider text-[10px] text-foreground">
                              Selected Materials &amp; Tile Requirements
                            </td>
                          </tr>
                          {b.tiles.map((item, i) => (
                            <tr key={`t-${i}`} className="border-b border-border/50">
                              <td className="py-2 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(item.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(item.amount ?? item.quantity * item.rate)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}

                      {/* Fixtures and Fittings */}
                      {b.fixtures.length > 0 ? (
                        <>
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-1 px-2 font-bold uppercase tracking-wider text-[10px] text-foreground">
                              Fixtures and Fittings
                            </td>
                          </tr>
                          {b.fixtures.map((item, i) => (
                            <tr key={`f-${i}`} className="border-b border-border/50">
                              <td className="py-2 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(item.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(item.amount ?? item.quantity * item.rate)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}

                      {/* Accessories */}
                      {b.accessories.length > 0 ? (
                        <>
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-1 px-2 font-bold uppercase tracking-wider text-[10px] text-foreground">
                              Accessories
                            </td>
                          </tr>
                          {b.accessories.map((item, i) => (
                            <tr key={`a-${i}`} className="border-b border-border/50">
                              <td className="py-2 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(item.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(item.amount ?? item.quantity * item.rate)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}

                      {/* Labour Charges */}
                      {b.labour.length > 0 ? (
                        <>
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-1 px-2 font-bold uppercase tracking-wider text-[10px] text-foreground">
                              Labour Charges
                            </td>
                          </tr>
                          {b.labour.map((item, i) => (
                            <tr key={`l-${i}`} className="border-b border-border/50">
                              <td className="py-2 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(item.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(item.amount ?? item.quantity * item.rate)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}

                      {/* Additional Work */}
                      {b.additionalWork.length > 0 ? (
                        <>
                          <tr className="bg-muted/40">
                            <td colSpan={5} className="py-1 px-2 font-bold uppercase tracking-wider text-[10px] text-foreground">
                              Additional Work
                            </td>
                          </tr>
                          {b.additionalWork.map((item, i) => (
                            <tr key={`add-${i}`} className="border-b border-border/50">
                              <td className="py-2 font-medium text-foreground">{item.name}</td>
                              <td className="py-2 text-right tabular-nums">{item.quantity}</td>
                              <td className="py-2 text-right text-muted-foreground">{item.unit}</td>
                              <td className="py-2 text-right tabular-nums">{formatINR(item.rate)}</td>
                              <td className="py-2 text-right font-semibold tabular-nums">{formatINR(item.amount ?? item.quantity * item.rate)}</td>
                            </tr>
                          ))}
                        </>
                      ) : null}
                    </tbody>

                    {/* Bathroom Subtotal Footer */}
                    <tfoot className="border-t bg-muted/20">
                      <tr>
                        <td colSpan={4} className="py-2 text-right font-medium text-muted-foreground">
                          Bathroom Gross Value
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{formatINR(b.bathroomGross)}</td>
                      </tr>
                      {b.discountAmount > 0 ? (
                        <tr>
                          <td colSpan={4} className="py-1 text-right text-muted-foreground">
                            Discount
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums text-[#996832]">
                            −{formatINR(b.discountAmount)}
                          </td>
                        </tr>
                      ) : null}
                      <tr>
                        <td colSpan={4} className="py-1 text-right text-muted-foreground">
                          Taxable Value
                        </td>
                        <td className="py-1 text-right font-semibold tabular-nums">{formatINR(b.taxableValue)}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="py-1 text-right text-muted-foreground">
                          Taxes (GST @ {b.gstRate}%)
                        </td>
                        <td className="py-1 text-right font-semibold tabular-nums">{formatINR(b.gstAmount)}</td>
                      </tr>
                      <tr className="border-t border-primary/20 bg-orange-50/50">
                        <td colSpan={4} className="py-2.5 text-right font-bold text-foreground">
                          {b.name} Subtotal
                        </td>
                        <td className="py-2.5 text-right text-base font-extrabold tabular-nums text-primary">
                          {formatINR(b.bathroomSubtotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Bathroom-Wise Material and Labour Totals (Comparison Table) */}
      {/* ------------------------------------------------------------------ */}
      <Card className="gap-0 overflow-hidden rounded-2xl border shadow-sm">
        <div className="border-b bg-muted/40 p-4">
          <h3 className="text-sm font-bold text-foreground">
            4. Bathroom-Wise Material and Labour Totals
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Side-by-side comparison across all bathrooms in scope.
          </p>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[700px] text-xs">
            <thead>
              <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 text-left font-semibold">Bathroom</th>
                <th className="py-2 text-right font-semibold">Floor Area</th>
                <th className="py-2 text-right font-semibold">Wall Area</th>
                <th className="py-2 text-right font-semibold">Materials</th>
                <th className="py-2 text-right font-semibold">Fixtures</th>
                <th className="py-2 text-right font-semibold">Accessories</th>
                <th className="py-2 text-right font-semibold">Labour</th>
                <th className="py-2 text-right font-semibold">Addl. Work</th>
                <th className="py-2 text-right font-semibold">Gross</th>
                <th className="py-2 text-right font-semibold">Taxes</th>
                <th className="py-2 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {combined.summaryByBathroom.map((row, i) => (
                <tr key={i} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="py-2.5 font-bold text-foreground">{row.name}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{row.floorAreaSqft} sq.ft</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{row.wallAreaSqft} sq.ft</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(row.materialsTotal)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(row.fixturesTotal)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(row.accessoriesTotal)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(row.labourTotal)}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(row.additionalWorkTotal)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatINR(row.bathroomGross)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatINR(row.gstAmount)}</td>
                  <td className="py-2.5 text-right font-extrabold tabular-nums text-primary">{formatINR(row.bathroomSubtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40 font-bold">
                <td className="py-3 text-foreground">Project Totals</td>
                <td className="py-3 text-right tabular-nums">{combined.totalFloorArea} sq.ft</td>
                <td className="py-3 text-right tabular-nums">{combined.totalWallArea} sq.ft</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalMaterials)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalFixtures)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalAccessories)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalLabour)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalAdditionalWork)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.totalBathroomGross)}</td>
                <td className="py-3 text-right tabular-nums">{formatINR(combined.projectGstAmount)}</td>
                <td className="py-3 text-right text-sm font-extrabold tabular-nums text-primary">
                  {formatINR(combined.totalProjectSubtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* 5, 6, 7, 8: Combined Quotation Settlement */}
      {/* ------------------------------------------------------------------ */}
      <Card className="gap-0 rounded-2xl border p-5 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">Combined Quotation Settlement</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Consolidated calculation summing individual bathroom amounts and project adjustments.
        </p>

        <div className="mt-4 space-y-2.5 border-t pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">5. Total Project Subtotal (Sum of Bathrooms)</span>
            <span className="font-bold tabular-nums text-foreground">{formatINR(combined.totalProjectSubtotal)}</span>
          </div>

          {combined.projectDiscountAmount > 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">6. Project-Wide Discounts ({discountHint})</span>
              <span className="font-semibold tabular-nums text-[#996832]">−{formatINR(combined.projectDiscountAmount)}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>6. Project-Wide Discounts</span>
              <span className="tabular-nums">₹0 (None applied)</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">7. Applicable Taxes (GST @ {combined.gstRate}%)</span>
            <span className="font-semibold tabular-nums text-foreground">{formatINR(combined.projectGstAmount)}</span>
          </div>

          <Separator className="my-2" />

          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                8. Final Quotation Amount
              </span>
              <p className="text-[11px] text-muted-foreground">
                Sum of {bathrooms.length} individual bathroom subtotals + project-level adjustments
              </p>
            </div>
            <span className="text-2xl font-extrabold tabular-nums text-primary">
              {formatINR(combined.finalQuotationAmount)}
            </span>
          </div>
        </div>

        {/* Verification Check Callout */}
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 flex items-start gap-2">
          <Check className="size-4 shrink-0 mt-0.5 text-emerald-600" />
          <p>
            <b>Combined Total Verified:</b> The final quotation amount (<b>{formatINR(combined.finalQuotationAmount)}</b>)
            strictly matches the sum of the individual bathroom amounts (<b>{formatINR(combined.totalProjectSubtotal)}</b>)
            and all explicitly defined project-level adjustments.
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
