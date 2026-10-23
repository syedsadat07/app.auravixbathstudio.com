/**
 * AURAVIX BATH STUDIO — Quotation Calculation Engine
 * Pure functions. Used server-side for authoritative pricing and
 * client-side for live preview in the quotation wizard and quotation views.
 *
 * Supports:
 * - Separate bathroom-wise breakdowns (multiple bathrooms per project).
 * - Exact measurement conversions (feet vs millimetres).
 * - Wall area calculation based on wall perimeter and height minus openings.
 * - Bathroom-level itemization (tiles, fixtures, accessories, labour, additional work, discounts, taxes).
 * - Combined project quotation with bathroom-wise summaries and project-level adjustments.
 */

export type MeasurementUnit = 'ft' | 'mm'

export interface BathroomDimensionInput {
  length: number
  width: number
  height?: number | null
  unit?: MeasurementUnit
  openingsArea?: number | null
}

export interface BathroomItemInput {
  id?: string
  name: string
  section: 'TILES' | 'FIXTURES' | 'ACCESSORIES' | 'LABOUR' | 'ADDITIONAL'
  materialId?: string | null
  quantity: number
  unit: string
  rate: number
  amount?: number
}

export interface BathroomInput {
  id?: string
  name: string
  type?: string
  unit?: MeasurementUnit
  length: number
  width: number
  height?: number | null
  openingsArea?: number | null
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

export interface BathroomBreakdownResult {
  id?: string
  name: string
  type: string
  unit: MeasurementUnit
  length: number
  width: number
  height: number
  lengthInFeet: number
  widthInFeet: number
  heightInFeet: number
  floorAreaSqft: number
  wallAreaSqft: number
  grossWallAreaSqft: number
  openingsAreaSqft: number

  tiles: BathroomItemInput[]
  fixtures: BathroomItemInput[]
  accessories: BathroomItemInput[]
  labour: BathroomItemInput[]
  additionalWork: BathroomItemInput[]

  materialsTotal: number
  fixturesTotal: number
  accessoriesTotal: number
  labourTotal: number
  additionalWorkTotal: number
  bathroomGross: number

  discountType: 'FLAT' | 'PERCENT'
  discount: number
  discountAmount: number
  taxableValue: number
  gstRate: number
  gstAmount: number
  bathroomSubtotal: number
}

export interface BathroomSummaryRow {
  name: string
  type: string
  floorAreaSqft: number
  wallAreaSqft: number
  materialsTotal: number
  fixturesTotal: number
  accessoriesTotal: number
  labourTotal: number
  additionalWorkTotal: number
  bathroomGross: number
  discountAmount: number
  taxableValue: number
  gstAmount: number
  bathroomSubtotal: number
}

export interface CombinedQuotationInput {
  bathrooms: BathroomInput[]
  packageRate?: number
  projectDiscountType?: 'FLAT' | 'PERCENT'
  projectDiscount?: number
  gstRate?: number
}

export interface CombinedQuotationResult {
  bathrooms: BathroomBreakdownResult[]
  totalFloorArea: number
  totalWallArea: number

  // 4. Bathroom-wise material and labour totals
  summaryByBathroom: BathroomSummaryRow[]

  // Aggregates across all bathrooms
  totalMaterials: number
  totalFixtures: number
  totalAccessories: number
  totalLabour: number
  totalAdditionalWork: number
  totalBathroomGross: number

  // 5. Total project subtotal (sum of individual bathroom amounts before project-level adjustments)
  totalProjectSubtotal: number

  // 6. Project-wide discounts
  projectDiscountType: 'FLAT' | 'PERCENT'
  projectDiscount: number
  projectDiscountAmount: number

  // 7. Applicable taxes
  projectTaxableValue: number
  gstRate: number
  projectGstAmount: number

  // 8. Final quotation amount
  finalQuotationAmount: number
}

export interface CalcItemInput {
  quantity: number
  rate: number
}

export interface CalcResult {
  totalArea: number
  packageAmount: number
  itemsAmount: number
  grossValue: number
  discountAmount: number
  taxableValue: number
  gstAmount: number
  totalPayable: number
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Round money to whole rupees (quotation convention — GST rounded to nearest rupee). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) + Number.EPSILON)
}

/** Convert length in mm to feet: Length in feet = Length in mm / 304.8. */
export function mmToFeet(mm: number): number {
  return round2((Number(mm) || 0) / 304.8)
}

/**
 * Bathroom floor area in square feet:
 * - Length in feet × Width in feet.
 * - When dimensions are entered in millimetres:
 *     Length in feet = Length in mm / 304.8
 *     Width in feet = Width in mm / 304.8
 *     Floor area in square feet = Length in mm × Width in mm / 92,903.04
 */
export function computeFloorArea(length: number, width: number, unit: MeasurementUnit = 'ft'): number {
  const l = Number(length) || 0
  const w = Number(width) || 0
  if (l <= 0 || w <= 0) return 0
  if (unit === 'mm') {
    return round2((l * w) / 92903.04)
  }
  return round2(l * w)
}

/** Legacy alias for backward compatibility. */
export function computeBathroomArea(length: number, width: number): number {
  return computeFloorArea(length, width, 'ft')
}

/**
 * Wall area in square feet:
 * Where wall tiling is required, calculate wall area using the relevant wall lengths and wall height.
 * Perimeter = 2 × (Length + Width).
 * Gross wall area:
 *   - In feet: 2 × (Length + Width) × Wall Height
 *   - In mm: 2 × (Length + Width) × Wall Height / 92,903.04
 * Subtract openings (doors/windows) only when their dimensions are provided.
 * Do not calculate wall tile area from floor area alone.
 */
export function computeWallArea(
  length: number,
  width: number,
  height: number,
  unit: MeasurementUnit = 'ft',
  openingsArea: number = 0
): number {
  const l = Number(length) || 0
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (l <= 0 || w <= 0 || h <= 0) return 0

  let gross: number
  if (unit === 'mm') {
    gross = (2 * (l + w) * h) / 92903.04
  } else {
    gross = 2 * (l + w) * h
  }

  const openings = Math.max(0, Number(openingsArea) || 0)
  return round2(Math.max(0, gross - openings))
}

/** Convert feet + inches (fractional inches allowed) to feet. */
export function feetInchesToFeet(feet: number, inches: number): number {
  return round2((Number(feet) || 0) + (Number(inches) || 0) / 12)
}

/**
 * Material quantity for AREA-rule materials (tiles etc.):
 *   required = totalArea / coverage
 *   final    = ceil(required × (1 + wastage%))
 */
export function calcAreaMaterialQuantity(
  totalArea: number,
  coverage: number,
  wastagePercent: number
): number {
  const cov = coverage > 0 ? coverage : 1
  const required = totalArea / cov
  const withWastage = required * (1 + (Number(wastagePercent) || 0) / 100)
  return Math.ceil(withWastage * 100) / 100
}

/** Helper to sum item amounts safely. */
export function sumItems(items: BathroomItemInput[] | undefined): number {
  if (!items || items.length === 0) return 0
  return round2(
    items.reduce((sum, it) => {
      const amt = typeof it.amount === 'number' && Number.isFinite(it.amount)
        ? it.amount
        : round2((Number(it.quantity) || 0) * (Number(it.rate) || 0))
      return sum + amt
    }, 0)
  )
}

/**
 * Calculate the complete breakdown for a single bathroom:
 * - Captures dimensions (length, width, height, unit)
 * - Floor area & wall area
 * - Tiles, fixtures, accessories, labour, additional work
 * - Discount, taxes, and bathroom subtotal
 */
export function calcBathroomBreakdown(b: BathroomInput, defaultGstRate: number = 18): BathroomBreakdownResult {
  const unit = b.unit === 'mm' ? 'mm' : 'ft'
  const length = Number(b.length) || 0
  const width = Number(b.width) || 0
  const height = Number(b.height) || 0
  const openingsAreaSqft = round2(Math.max(0, Number(b.openingsArea) || 0))

  const lengthInFeet = unit === 'mm' ? mmToFeet(length) : length
  const widthInFeet = unit === 'mm' ? mmToFeet(width) : width
  const heightInFeet = unit === 'mm' ? mmToFeet(height) : height

  const floorAreaSqft = typeof b.floorAreaSqft === 'number' && b.floorAreaSqft > 0
    ? round2(b.floorAreaSqft)
    : computeFloorArea(length, width, unit)

  let grossWallAreaSqft = 0
  if (length > 0 && width > 0 && height > 0) {
    if (unit === 'mm') {
      grossWallAreaSqft = round2((2 * (length + width) * height) / 92903.04)
    } else {
      grossWallAreaSqft = round2(2 * (length + width) * height)
    }
  }

  const wallAreaSqft = typeof b.wallAreaSqft === 'number' && b.wallAreaSqft >= 0
    ? round2(b.wallAreaSqft)
    : round2(Math.max(0, grossWallAreaSqft - openingsAreaSqft))

  // Ensure items have computed amount
  const mapItems = (list: BathroomItemInput[] | undefined): BathroomItemInput[] => {
    return (list ?? []).map((it) => {
      const q = Number(it.quantity) || 0
      const r = Number(it.rate) || 0
      const amount = round2(typeof it.amount === 'number' ? it.amount : q * r)
      return { ...it, quantity: q, rate: r, amount }
    })
  }

  const tiles = mapItems(b.tiles)
  const fixtures = mapItems(b.fixtures)
  const accessories = mapItems(b.accessories)
  const labour = mapItems(b.labour)
  const additionalWork = mapItems(b.additionalWork)

  const materialsTotal = sumItems(tiles)
  const fixturesTotal = sumItems(fixtures)
  const accessoriesTotal = sumItems(accessories)
  const labourTotal = sumItems(labour)
  const additionalWorkTotal = sumItems(additionalWork)

  const bathroomGross = roundMoney(
    materialsTotal + fixturesTotal + accessoriesTotal + labourTotal + additionalWorkTotal
  )

  const discountType = b.discountType === 'PERCENT' ? 'PERCENT' : 'FLAT'
  const discountInput = Number(b.discount) || 0
  const discountAmount =
    discountType === 'PERCENT'
      ? roundMoney((bathroomGross * Math.min(Math.max(discountInput, 0), 100)) / 100)
      : roundMoney(Math.min(Math.max(discountInput, 0), bathroomGross))

  const taxableValue = roundMoney(Math.max(0, bathroomGross - discountAmount))
  const gstRate = Number.isFinite(b.gstRate) && (b.gstRate ?? 0) >= 0 ? Number(b.gstRate) : defaultGstRate
  const gstAmount = roundMoney((taxableValue * gstRate) / 100)
  const bathroomSubtotal = roundMoney(taxableValue + gstAmount)

  return {
    id: b.id,
    name: b.name || 'Bathroom',
    type: b.type || 'COMMON',
    unit,
    length,
    width,
    height,
    lengthInFeet,
    widthInFeet,
    heightInFeet,
    floorAreaSqft,
    wallAreaSqft,
    grossWallAreaSqft,
    openingsAreaSqft,
    tiles,
    fixtures,
    accessories,
    labour,
    additionalWork,
    materialsTotal,
    fixturesTotal,
    accessoriesTotal,
    labourTotal,
    additionalWorkTotal,
    bathroomGross,
    discountType,
    discount: discountInput,
    discountAmount,
    taxableValue,
    gstRate,
    gstAmount,
    bathroomSubtotal,
  }
}

/**
 * Combined Quotation Calculator:
 * Aggregates all bathrooms into:
 * 1. Individual bathroom breakdowns
 * 2. Bathroom-wise material and labour totals table
 * 3. Total project subtotal
 * 4. Project-wide discounts
 * 5. Applicable taxes
 * 6. Final quotation amount (must match sum of individual bathroom amounts + project-level adjustments)
 */
export function calcCombinedQuotation(input: CombinedQuotationInput): CombinedQuotationResult {
  const gstRate = Number.isFinite(input.gstRate) && (input.gstRate ?? 0) >= 0 ? Number(input.gstRate) : 18
  const breakdowns = (input.bathrooms ?? []).map((b) => calcBathroomBreakdown(b, gstRate))

  const totalFloorArea = round2(breakdowns.reduce((sum, b) => sum + b.floorAreaSqft, 0))
  const totalWallArea = round2(breakdowns.reduce((sum, b) => sum + b.wallAreaSqft, 0))

  const totalMaterials = roundMoney(breakdowns.reduce((sum, b) => sum + b.materialsTotal, 0))
  const totalFixtures = roundMoney(breakdowns.reduce((sum, b) => sum + b.fixturesTotal, 0))
  const totalAccessories = roundMoney(breakdowns.reduce((sum, b) => sum + b.accessoriesTotal, 0))
  const totalLabour = roundMoney(breakdowns.reduce((sum, b) => sum + b.labourTotal, 0))
  const totalAdditionalWork = roundMoney(breakdowns.reduce((sum, b) => sum + b.additionalWorkTotal, 0))
  const totalBathroomGross = roundMoney(breakdowns.reduce((sum, b) => sum + b.bathroomGross, 0))

  const summaryByBathroom: BathroomSummaryRow[] = breakdowns.map((b) => ({
    name: b.name,
    type: b.type,
    floorAreaSqft: b.floorAreaSqft,
    wallAreaSqft: b.wallAreaSqft,
    materialsTotal: b.materialsTotal,
    fixturesTotal: b.fixturesTotal,
    accessoriesTotal: b.accessoriesTotal,
    labourTotal: b.labourTotal,
    additionalWorkTotal: b.additionalWorkTotal,
    bathroomGross: b.bathroomGross,
    discountAmount: b.discountAmount,
    taxableValue: b.taxableValue,
    gstAmount: b.gstAmount,
    bathroomSubtotal: b.bathroomSubtotal,
  }))

  // Sum of individual bathroom subtotals
  const sumBathroomSubtotals = roundMoney(breakdowns.reduce((sum, b) => sum + b.bathroomSubtotal, 0))
  const sumBathroomTaxable = roundMoney(breakdowns.reduce((sum, b) => sum + b.taxableValue, 0))

  // Project-wide adjustments (if defined)
  const projectDiscountType = input.projectDiscountType === 'PERCENT' ? 'PERCENT' : 'FLAT'
  const projectDiscountInput = Number(input.projectDiscount) || 0

  let projectDiscountAmount = 0
  let projectTaxableValue = sumBathroomTaxable
  let projectGstAmount = roundMoney(breakdowns.reduce((sum, b) => sum + b.gstAmount, 0))
  let finalQuotationAmount = sumBathroomSubtotals

  if (projectDiscountInput > 0) {
    if (projectDiscountType === 'PERCENT') {
      projectDiscountAmount = roundMoney((sumBathroomTaxable * Math.min(projectDiscountInput, 100)) / 100)
    } else {
      projectDiscountAmount = roundMoney(Math.min(projectDiscountInput, sumBathroomTaxable))
    }
    projectTaxableValue = roundMoney(Math.max(0, sumBathroomTaxable - projectDiscountAmount))
    projectGstAmount = roundMoney((projectTaxableValue * gstRate) / 100)
    finalQuotationAmount = roundMoney(projectTaxableValue + projectGstAmount)
  }

  return {
    bathrooms: breakdowns,
    totalFloorArea,
    totalWallArea,
    summaryByBathroom,
    totalMaterials,
    totalFixtures,
    totalAccessories,
    totalLabour,
    totalAdditionalWork,
    totalBathroomGross,
    totalProjectSubtotal: sumBathroomSubtotals,
    projectDiscountType,
    projectDiscount: projectDiscountInput,
    projectDiscountAmount,
    projectTaxableValue,
    gstRate,
    projectGstAmount,
    finalQuotationAmount,
  }
}

export interface CalcQuotationInput {
  bathrooms: BathroomDimensionInput[]
  packageRate: number
  items: CalcItemInput[]
  discountType: 'FLAT' | 'PERCENT'
  discount: number
  gstRate: number
}

/**
 * Legacy / standard calculation engine (backward-compatible):
 */
export function calcQuotation(input: CalcQuotationInput): CalcResult {
  const totalArea = round2(
    input.bathrooms.reduce((sum, b) => sum + computeFloorArea(b.length, b.width, b.unit ?? 'ft'), 0)
  )
  const packageAmount = round2(totalArea * (Number(input.packageRate) || 0))
  const itemsAmount = round2(
    input.items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0)
  )
  const grossValue = roundMoney(packageAmount + itemsAmount)

  const discountInput = Number(input.discount) || 0
  const discountAmount =
    input.discountType === 'PERCENT'
      ? roundMoney((grossValue * Math.min(Math.max(discountInput, 0), 100)) / 100)
      : roundMoney(Math.min(Math.max(discountInput, 0), grossValue))

  const taxableValue = roundMoney(Math.max(grossValue - discountAmount, 0))
  const gstAmount = roundMoney((taxableValue * (Number(input.gstRate) || 0)) / 100)
  const totalPayable = roundMoney(taxableValue + gstAmount)

  return {
    totalArea,
    packageAmount,
    itemsAmount,
    grossValue,
    discountAmount,
    taxableValue,
    gstAmount,
    totalPayable,
  }
}

/** Example sanity check (documents the spec): 9×5 ft = 45 sq.ft; Premium 3500 → 157500. */
export const ENGINE_EXAMPLE = {
  length: 9,
  width: 5,
  area: 45,
  packageRate: 3500,
  packageAmount: 157500,
}
