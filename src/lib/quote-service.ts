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
  calcBathroomBreakdown,
  calcCombinedQuotation,
  calcQuotation,
  computeBathroomArea,
  computeFloorArea,
  computeWallArea,
  round2,
  roundMoney,
  type BathroomBreakdownResult,
  type BathroomInput,
  type BathroomItemInput,
  type CalcResult,
  type CombinedQuotationResult,
  type MeasurementUnit,
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
  unit?: MeasurementUnit
  length: number
  width: number
  height?: number
  openingsArea?: number
  floorAreaSqft?: number
  wallAreaSqft?: number
  tiles?: BathroomItemInput[]
  fixtures?: BathroomItemInput[]
  accessories?: BathroomItemInput[]
  labour?: BathroomItemInput[]
  additionalWork?: BathroomItemInput[]
  discountType?: 'FLAT' | 'PERCENT'
  discount?: number
  gstRate?: number
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
    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : `Bathroom ${index + 1}`
    const type = typeof b.type === 'string' && b.type.trim() ? b.type.trim() : 'COMMON'
    const unit: MeasurementUnit = b.unit === 'mm' ? 'mm' : 'ft'
    const length = toNumber(b.length)
    const width = toNumber(b.width)

    if (!name) throw new ApiError(400, `Bathroom #${index + 1}: a name is required.`)
    if (!(length > 0)) throw new ApiError(400, `Bathroom "${name}": length must be a number greater than 0.`)
    if (!(width > 0)) throw new ApiError(400, `Bathroom "${name}": width must be a number greater than 0.`)

    const height = toNumber(b.height ?? NaN)
    const validHeight = Number.isFinite(height) && height > 0 ? height : 0
    const openingsArea = toNumber(b.openingsArea ?? 0)
    const validOpenings = Number.isFinite(openingsArea) && openingsArea > 0 ? openingsArea : 0

    const floorAreaSqft = computeFloorArea(length, width, unit)
    const wallAreaSqft = computeWallArea(length, width, validHeight, unit, validOpenings)

    return {
      name,
      type,
      unit,
      length,
      width,
      height: validHeight > 0 ? validHeight : null,
      openingsArea: validOpenings,
      floorAreaSqft,
      wallAreaSqft,
      tiles: Array.isArray(b.tiles) ? b.tiles : [],
      fixtures: Array.isArray(b.fixtures) ? b.fixtures : [],
      accessories: Array.isArray(b.accessories) ? b.accessories : [],
      labour: Array.isArray(b.labour) ? b.labour : [],
      additionalWork: Array.isArray(b.additionalWork) ? b.additionalWork : [],
      discountType: b.discountType === 'PERCENT' ? ('PERCENT' as const) : ('FLAT' as const),
      discount: toNumber(b.discount ?? 0) || 0,
      gstRate: toNumber(b.gstRate ?? NaN),
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
    const validatedBathrooms = validateBathrooms(payload)
    const totalArea = round2(validatedBathrooms.reduce((sum, b) => sum + b.floorAreaSqft, 0))

    // 2) Package (rate = pricePerSqft)
    const pkg = await loadPackage(tx, payload?.packageId)

    // 3) Settings
    const settings = await resolveSettings(tx)

    // 4) Selections → materials
    const selections = payload?.selections ?? {}
    const tiles = await loadTiles(tx, uniqueTileIds(selections.tileIds))
    const fixtures = await loadQtyMaterials(tx, selections.fixtures, 'fixture', totalArea, true)
    const addons = await loadQtyMaterials(tx, selections.addons, 'add-on', totalArea, false)

    // 5) Build bathroom-wise breakdowns
    // For each bathroom, if items were not individually passed, distribute materials/tiles appropriately
    const bathroomInputs: BathroomInput[] = validatedBathrooms.map((b, idx) => {
      const bTiles: BathroomItemInput[] = b.tiles && b.tiles.length > 0 ? [...b.tiles] : []
      const bFixtures: BathroomItemInput[] = b.fixtures && b.fixtures.length > 0 ? [...b.fixtures] : []
      const bAccessories: BathroomItemInput[] = b.accessories && b.accessories.length > 0 ? [...b.accessories] : []
      const bLabour: BathroomItemInput[] = b.labour && b.labour.length > 0 ? [...b.labour] : []
      const bAdditional: BathroomItemInput[] = b.additionalWork && b.additionalWork.length > 0 ? [...b.additionalWork] : []

      // If bathroom does not have explicit tiles, allocate from global tiles selection based on bathroom area
      if (bTiles.length === 0 && tiles.length > 0) {
        for (const m of tiles) {
          const qty = calcAreaMaterialQuantity(b.floorAreaSqft, m.coverage, m.wastagePercent)
          bTiles.push({
            name: `${m.name} (Floor)`,
            section: 'TILES',
            materialId: m.id,
            quantity: qty,
            unit: m.unit,
            rate: m.price,
            amount: round2(qty * m.price),
          })
          if (b.wallAreaSqft > 0) {
            const wallQty = calcAreaMaterialQuantity(b.wallAreaSqft, m.coverage, m.wastagePercent)
            bTiles.push({
              name: `${m.name} (Wall)`,
              section: 'TILES',
              materialId: m.id,
              quantity: wallQty,
              unit: m.unit,
              rate: m.price,
              amount: round2(wallQty * m.price),
            })
          }
        }
      }

      // If bathroom does not have explicit fixtures, allocate standard package proportion
      if (bFixtures.length === 0 && fixtures.length > 0) {
        // Distribute proportionally across bathrooms
        for (const { material: m, quantity } of fixtures) {
          const bathroomShare = Math.max(1, Math.round(quantity / validatedBathrooms.length))
          bFixtures.push({
            name: m.name,
            section: 'FIXTURES',
            materialId: m.id,
            quantity: bathroomShare,
            unit: m.unit,
            rate: m.price,
            amount: round2(bathroomShare * m.price),
          })
        }
      }

      // If bathroom does not have explicit accessories, allocate from add-ons
      if (bAccessories.length === 0 && addons.length > 0) {
        for (const { material: m, quantity } of addons) {
          const bathroomShare = Math.max(1, Math.round(quantity / validatedBathrooms.length))
          bAccessories.push({
            name: m.name,
            section: 'ACCESSORIES',
            materialId: m.id,
            quantity: bathroomShare,
            unit: m.unit,
            rate: m.price,
            amount: round2(bathroomShare * m.price),
          })
        }
      }

      // If no labour is specified, add standard bathroom labour based on area & fittings
      if (bLabour.length === 0) {
        const tilingLabourRate = 45 // ₹45/sq.ft for floor & wall tiling
        const totalTileArea = round2(b.floorAreaSqft + b.wallAreaSqft)
        bLabour.push({
          name: 'Tiling & Surface Prep Labour',
          section: 'LABOUR',
          quantity: totalTileArea,
          unit: 'sq.ft',
          rate: tilingLabourRate,
          amount: round2(totalTileArea * tilingLabourRate),
        })
        bLabour.push({
          name: 'Plumbing & Fixtures Installation',
          section: 'LABOUR',
          quantity: 1,
          unit: 'lot',
          rate: 12000,
          amount: 12000,
        })
      }

      // If no additional work is specified, add waterproofing as essential baseline
      if (bAdditional.length === 0) {
        bAdditional.push({
          name: 'Epoxy Grouting & Waterproofing Barrier',
          section: 'ADDITIONAL',
          quantity: b.floorAreaSqft,
          unit: 'sq.ft',
          rate: 65,
          amount: round2(b.floorAreaSqft * 65),
        })
      }

      return {
        name: b.name,
        type: b.type,
        unit: b.unit,
        length: b.length,
        width: b.width,
        height: b.height,
        openingsArea: b.openingsArea,
        floorAreaSqft: b.floorAreaSqft,
        wallAreaSqft: b.wallAreaSqft,
        tiles: bTiles,
        fixtures: bFixtures,
        accessories: bAccessories,
        labour: bLabour,
        additionalWork: bAdditional,
        discountType: b.discountType,
        discount: b.discount,
        gstRate: Number.isFinite(b.gstRate) ? b.gstRate : settings.gstRate,
      }
    })

    // 6) Calculate combined quotation
    const projectDiscountType = payload?.discountType === 'PERCENT' ? 'PERCENT' : 'FLAT'
    const projectDiscountRaw = toNumber(payload?.discount)
    const projectDiscount = Number.isFinite(projectDiscountRaw) && projectDiscountRaw > 0 ? projectDiscountRaw : 0

    const combined = calcCombinedQuotation({
      bathrooms: bathroomInputs,
      projectDiscountType,
      projectDiscount,
      gstRate: settings.gstRate,
    })

    // Flatten all items across bathrooms for global items table + consultation
    const allItems: Array<{
      section: string
      materialId: string | null
      name: string
      quantity: number
      unit: string
      rate: number
      amount: number
    }> = []

    for (const b of combined.bathrooms) {
      for (const t of b.tiles) {
        allItems.push({ section: 'TILES', materialId: t.materialId ?? null, name: `${b.name}: ${t.name}`, quantity: t.quantity, unit: t.unit, rate: t.rate, amount: t.amount ?? round2(t.quantity * t.rate) })
      }
      for (const f of b.fixtures) {
        allItems.push({ section: 'FIXTURES', materialId: f.materialId ?? null, name: `${b.name}: ${f.name}`, quantity: f.quantity, unit: f.unit, rate: f.rate, amount: f.amount ?? round2(f.quantity * f.rate) })
      }
      for (const a of b.accessories) {
        allItems.push({ section: 'ADDONS', materialId: a.materialId ?? null, name: `${b.name}: ${a.name}`, quantity: a.quantity, unit: a.unit, rate: a.rate, amount: a.amount ?? round2(a.quantity * a.rate) })
      }
      for (const l of b.labour) {
        allItems.push({ section: 'OTHER', materialId: null, name: `${b.name}: ${l.name}`, quantity: l.quantity, unit: l.unit, rate: l.rate, amount: l.amount ?? round2(l.quantity * l.rate) })
      }
      for (const add of b.additionalWork) {
        allItems.push({ section: 'OTHER', materialId: null, name: `${b.name}: ${add.name}`, quantity: add.quantity, unit: add.unit, rate: add.rate, amount: add.amount ?? round2(add.quantity * add.rate) })
      }
    }

    if (selections.consultation === true) {
      const fee = settings.consultationFee
      allItems.push({ section: 'OTHER', materialId: null, name: 'Design Consultation', quantity: 1, unit: 'set', rate: fee, amount: round2(fee) })
    }

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

    // 9) Persist version + bathrooms (with full JSON breakdown) + items
    const packageAmount = round2(combined.totalFloorArea * pkg.pricePerSqft)
    const itemsAmount = round2(allItems.reduce((s, it) => s + it.amount, 0))

    const version = await tx.quotationVersion.create({
      data: {
        quotationId: quotation.id,
        versionNumber,
        versionType,
        status,
        totalArea: combined.totalFloorArea,
        packageId: pkg.id,
        packageName: pkg.name,
        packageRate: pkg.pricePerSqft,
        packageAmount,
        itemsAmount,
        grossValue: combined.totalBathroomGross,
        discountType: combined.projectDiscountType,
        discount: round2(combined.projectDiscount),
        discountAmount: combined.projectDiscountAmount,
        taxableValue: combined.projectTaxableValue,
        gstRate: settings.gstRate,
        gstAmount: combined.projectGstAmount,
        totalPayable: combined.finalQuotationAmount,
        notes: optionalText(payload?.notes),
        createdById: user.id,
        bathrooms: {
          create: combined.bathrooms.map((b) => ({
            name: b.name,
            type: b.type,
            length: b.length,
            width: b.width,
            height: b.height,
            unit: b.unit,
            areaSqft: b.floorAreaSqft,
            wallAreaSqft: b.wallAreaSqft,
            openingsArea: b.openingsAreaSqft,
            breakdown: JSON.stringify(b),
          })),
        },
        items: {
          create: allItems.map((i) => ({
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

    const totalsResult: CalcResult = {
      totalArea: combined.totalFloorArea,
      packageAmount,
      itemsAmount,
      grossValue: combined.totalBathroomGross,
      discountAmount: combined.projectDiscountAmount,
      taxableValue: combined.projectTaxableValue,
      gstAmount: combined.projectGstAmount,
      totalPayable: combined.finalQuotationAmount,
    }

    return { versionId: version.id, versionNumber, versionType, status, publishBlocked, totals: totalsResult }
  }

  if (opts.tx) return run(opts.tx)
  return db.$transaction(run)
}
