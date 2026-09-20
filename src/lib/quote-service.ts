/**
 * AURAVIX BATH STUDIO — Quotation Engine Service (server-only)
 *
 * Single source of truth for quotation pricing: the client only ever sends
 * IDs + quantities; every rate/amount is recomputed here from master data
 * (Package, Material) and settings, via the pure engine in src/lib/calc.ts.
 */
import { Prisma, type Material, type Quotation } from '@prisma/client'
import { db } from '@/lib/db'
import {
  calcAreaMaterialQuantity,
  calcQuotation,
  computeBathroomArea,
  round2,
  type CalcResult,
} from '@/lib/calc'
import { ApiError, isSuperAdmin, type AuthUser } from '@/lib/auth'

type TxClient = Prisma.TransactionClient

// ---------- public types (API contract: "Quotations (2-c)") ----------

export interface QuoteCustomerInput {
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  pincode?: string
}

export interface QuoteBathroomInput {
  name?: string
  type?: string
  length: number
  width: number
  height?: number
}

export interface QuotePayload {
  customerId?: string
  leadId?: string
  customer?: QuoteCustomerInput
  bathrooms: QuoteBathroomInput[]
  packageId: string
  selections?: {
    tileIds?: Array<{ materialId: string }>
    fixtures?: Array<{ materialId: string; quantity: number }>
    addons?: Array<{ materialId: string; quantity: number }>
    consultation?: boolean
  }
  discountType: 'FLAT' | 'PERCENT'
  discount: number
  notes?: string
  publish?: boolean
  versionType?: 'INITIAL' | 'UPGRADED' | 'REVISED'
}

export interface ResolvedSettings {
  gstRate: number
  consultationFee: number
  quotePrefix: string
  validityDays: number
  adminsCanPublish: boolean
}

export interface CreateVersionResult {
  versionId: string
  versionNumber: number
  versionType: string
  status: string
  /** true when publish was requested but the user is not allowed → saved as DRAFT */
  publishBlocked: boolean
  totals: CalcResult
}

const SECTION_ORDER = ['TILES', 'FIXTURES', 'ADDONS', 'OTHER']
const VERSION_TYPES = ['INITIAL', 'UPGRADED', 'REVISED']
const SETTING_KEYS = ['gst_rate', 'consultation_fee', 'quote_prefix', 'quote_validity_days', 'admins_can_publish']

// ---------- settings ----------

/** Reads the quotation-related Setting rows with sensible defaults. */
export async function resolveSettings(tx?: TxClient): Promise<ResolvedSettings> {
  const client = tx ?? db
  const rows = await client.setting.findMany({ where: { key: { in: SETTING_KEYS } } })
  const get = (key: string) => rows.find((r) => r.key === key)?.value

  const gstRate = Number.parseFloat(get('gst_rate') ?? '')
  const consultationFee = Number.parseFloat(get('consultation_fee') ?? '')
  const validityDays = Number.parseInt(get('quote_validity_days') ?? '', 10)

  return {
    gstRate: Number.isFinite(gstRate) && gstRate >= 0 ? gstRate : 18,
    consultationFee: Number.isFinite(consultationFee) && consultationFee >= 0 ? consultationFee : 299,
    quotePrefix: (get('quote_prefix') ?? '').trim() || 'ABS-Q',
    validityDays: Number.isFinite(validityDays) && validityDays > 0 ? Math.round(validityDays) : 30,
    adminsCanPublish: (get('admins_can_publish') ?? 'false').trim().toLowerCase() === 'true',
  }
}

// ---------- helpers ----------

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : NaN
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Stable-sorts item rows into section order TILES → FIXTURES → ADDONS → OTHER. */
export function sortQuotationItems<T extends { section: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section))
}

/** Quotation validity = createdAt + validityDays. */
export function computeValidityDate(createdAt: Date, validityDays: number): Date {
  return new Date(createdAt.getTime() + Math.max(Number(validityDays) || 0, 0) * 24 * 60 * 60 * 1000)
}

/** Detects P2002 unique-constraint errors, optionally for one field. */
export function isUniqueConstraintError(error: unknown, field?: string): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    if (!field) return true
    const target = (error.meta as { target?: string[] | string } | undefined)?.target
    const targets = Array.isArray(target) ? target : target ? [target] : []
    return targets.length === 0 || targets.some((t) => String(t).includes(field))
  }
  return false
}

// ---------- payload validation & master-data loading ----------

function validateBathrooms(payload: QuotePayload) {
  const input = Array.isArray(payload?.bathrooms) ? payload.bathrooms : []
  if (input.length === 0) throw new ApiError(400, 'Add at least one bathroom to the quotation.')

  return input.map((raw, index) => {
    const b = (raw ?? {}) as QuoteBathroomInput
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    const type = typeof b.type === 'string' ? b.type.trim() : ''
    const length = toNumber(b.length)
    const width = toNumber(b.width)

    if (!name) throw new ApiError(400, `Bathroom #${index + 1}: a name is required.`)
    if (!type) throw new ApiError(400, `Bathroom "${name}": a type is required.`)
    if (!(length > 0)) throw new ApiError(400, `Bathroom "${name}": length must be a number greater than 0.`)
    if (!(width > 0)) throw new ApiError(400, `Bathroom "${name}": width must be a number greater than 0.`)

    const height = toNumber(b.height ?? NaN)
    return {
      name,
      type,
      length,
      width,
      height: Number.isFinite(height) && height > 0 ? height : null,
      areaSqft: computeBathroomArea(length, width),
    }
  })
}

async function loadPackage(tx: TxClient, packageId: unknown) {
  if (typeof packageId !== 'string' || !packageId) throw new ApiError(400, 'Select a package.')
  const pkg = await tx.package.findUnique({ where: { id: packageId } })
  if (!pkg || pkg.status !== 'ACTIVE') throw new ApiError(400, 'The selected package is not available.')
  return pkg
}

/** Unique tile IDs, order preserved. */
function uniqueTileIds(list: Array<{ materialId?: unknown }> | undefined): string[] {
  if (!list || list.length === 0) return []
  const out: string[] = []
  for (const entry of list) {
    const id = typeof entry?.materialId === 'string' ? entry.materialId : ''
    if (!id) throw new ApiError(400, 'A selected tile is missing its material reference.')
    if (!out.includes(id)) out.push(id)
  }
  return out
}

async function loadTiles(tx: TxClient, ids: string[]) {
  const tiles: Material[] = []
  for (const id of ids) {
    const material = await tx.material.findUnique({ where: { id } })
    if (!material) throw new ApiError(400, 'A selected tile no longer exists in the catalogue.')
    if (material.status !== 'ACTIVE') throw new ApiError(400, `Tile "${material.name}" is inactive and cannot be quoted.`)
    if (material.quantityRule !== 'AREA') throw new ApiError(400, `Tile "${material.name}" is not priced by area.`)
    tiles.push(material)
  }
  return tiles
}

interface QtySelection {
  material: Material
  quantity: number
}

/**
 * Loads fixtures/add-ons. Quantities for the same material are merged.
 * AREA-rule materials placed under `fixtures` get their quantity computed
 * from the total area (coverage + wastage) — the client-sent qty is ignored.
 */
async function loadQtyMaterials(
  tx: TxClient,
  entries: Array<{ materialId?: unknown; quantity?: unknown }> | undefined,
  label: string,
  totalArea: number,
  applyAreaRule: boolean
): Promise<QtySelection[]> {
  if (!entries || entries.length === 0) return []

  const merged = new Map<string, number>()
  const order: string[] = []
  for (const entry of entries) {
    const id = typeof entry?.materialId === 'string' ? entry.materialId : ''
    if (!id) throw new ApiError(400, `A selected ${label} is missing its material reference.`)
    const qty = toNumber(entry?.quantity)
    if (!merged.has(id)) order.push(id)
    merged.set(id, (merged.get(id) ?? 0) + (Number.isFinite(qty) ? qty : 0))
  }

  const out: QtySelection[] = []
  for (const id of order) {
    const material = await tx.material.findUnique({ where: { id } })
    if (!material) throw new ApiError(400, `A selected ${label} no longer exists in the catalogue.`)
    if (material.status !== 'ACTIVE') throw new ApiError(400, `"${material.name}" is inactive and cannot be quoted.`)

    let quantity: number
    if (applyAreaRule && material.quantityRule === 'AREA') {
      quantity = calcAreaMaterialQuantity(totalArea, material.coverage, material.wastagePercent)
    } else {
      quantity = merged.get(id) ?? 0
      if (!(quantity >= 1)) throw new ApiError(400, `Quantity for "${material.name}" must be at least 1.`)
    }
    out.push({ material, quantity })
  }
  return out
}

// ---------- core version builder ----------

/**
 * Validates the payload, recomputes every amount from master data and
 * creates the next QuotationVersion (+ bathrooms + items) inside a
 * transaction. When `opts.quotation` is provided the version number is
 * max+1; a freshly created quotation (0 versions) becomes V1/INITIAL.
 * Pass `tx` to join the caller's transaction (quotation + version atomic).
 */
export async function createVersionFromPayload(opts: {
  quotation?: Quotation | null
  payload: QuotePayload
  user: AuthUser
  tx?: TxClient
}): Promise<CreateVersionResult> {
  const { payload, user } = opts

  const run = async (tx: TxClient): Promise<CreateVersionResult> => {
    const quotation = opts.quotation
    if (!quotation) throw new ApiError(400, 'A quotation is required to create a version.')

    // 1) Validate bathrooms
    const bathrooms = validateBathrooms(payload)
    const totalArea = round2(bathrooms.reduce((sum, b) => sum + b.areaSqft, 0))

    // 2) Package (rate = pricePerSqft)
    const pkg = await loadPackage(tx, payload?.packageId)

    // 3) Settings
    const settings = await resolveSettings(tx)

    // 4) Selections → materials
    const selections = payload?.selections ?? {}
    const tiles = await loadTiles(tx, uniqueTileIds(selections.tileIds))
    const fixtures = await loadQtyMaterials(tx, selections.fixtures, 'fixture', totalArea, true)
    const addons = await loadQtyMaterials(tx, selections.addons, 'add-on', totalArea, false)

    // 5) Item rows — snapshot name/unit/rate at quote time
    const items: Array<{
      section: string
      materialId: string | null
      name: string
      quantity: number
      unit: string
      rate: number
      amount: number
    }> = []

    for (const m of tiles) {
      const quantity = calcAreaMaterialQuantity(totalArea, m.coverage, m.wastagePercent)
      items.push({ section: 'TILES', materialId: m.id, name: m.name, quantity, unit: m.unit, rate: m.price, amount: round2(quantity * m.price) })
    }
    for (const { material: m, quantity } of fixtures) {
      items.push({ section: 'FIXTURES', materialId: m.id, name: m.name, quantity, unit: m.unit, rate: m.price, amount: round2(quantity * m.price) })
    }
    for (const { material: m, quantity } of addons) {
      items.push({ section: 'ADDONS', materialId: m.id, name: m.name, quantity, unit: m.unit, rate: m.price, amount: round2(quantity * m.price) })
    }
    if (selections.consultation === true) {
      const fee = settings.consultationFee
      items.push({ section: 'OTHER', materialId: null, name: 'Design Consultation', quantity: 1, unit: 'set', rate: fee, amount: round2(fee) })
    }

    // 6) Authoritative calculation
    const discountType = payload?.discountType === 'PERCENT' ? 'PERCENT' : 'FLAT'
    const discountRaw = toNumber(payload?.discount)
    const discount = Number.isFinite(discountRaw) && discountRaw > 0 ? discountRaw : 0

    const totals = calcQuotation({
      bathrooms: bathrooms.map((b) => ({ length: b.length, width: b.width })),
      packageRate: pkg.pricePerSqft,
      items: items.map((i) => ({ quantity: i.quantity, rate: i.rate })),
      discountType,
      discount,
      gstRate: settings.gstRate,
    })

    // 7) Publish permission
    const publishRequested = payload?.publish === true
    const canPublish = isSuperAdmin(user) || settings.adminsCanPublish
    const publishBlocked = publishRequested && !canPublish
    const status = publishRequested && canPublish ? 'PUBLISHED' : 'DRAFT'

    // 8) Version number & type
    const agg = await tx.quotationVersion.aggregate({
      where: { quotationId: quotation.id },
      _max: { versionNumber: true },
    })
    const versionNumber = (agg._max.versionNumber ?? 0) + 1
    let versionType = versionNumber === 1 ? 'INITIAL' : 'UPGRADED'
    if (payload?.versionType && VERSION_TYPES.includes(payload.versionType)) {
      versionType = payload.versionType
    }

    // 9) Persist version + bathrooms + items
    const version = await tx.quotationVersion.create({
      data: {
        quotationId: quotation.id,
        versionNumber,
        versionType,
        status,
        totalArea: totals.totalArea,
        packageId: pkg.id,
        packageName: pkg.name,
        packageRate: pkg.pricePerSqft,
        packageAmount: totals.packageAmount,
        itemsAmount: totals.itemsAmount,
        grossValue: totals.grossValue,
        discountType,
        discount: round2(discount),
        discountAmount: totals.discountAmount,
        taxableValue: totals.taxableValue,
        gstRate: settings.gstRate,
        gstAmount: totals.gstAmount,
        totalPayable: totals.totalPayable,
        notes: optionalText(payload?.notes),
        createdById: user.id,
        bathrooms: {
          create: bathrooms.map((b) => ({
            name: b.name,
            type: b.type,
            length: b.length,
            width: b.width,
            height: b.height,
            areaSqft: b.areaSqft,
          })),
        },
        items: {
          create: items.map((i) => ({
            section: i.section,
            materialId: i.materialId,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            rate: i.rate,
            amount: i.amount,
          })),
        },
      },
    })

    return { versionId: version.id, versionNumber, versionType, status, publishBlocked, totals }
  }

  if (opts.tx) return run(opts.tx)
  return db.$transaction(run)
}
