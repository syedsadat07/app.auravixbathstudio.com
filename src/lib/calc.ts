/**
 * AURAVIX BATH STUDIO — Quotation Calculation Engine
 * Pure functions. Used server-side for authoritative pricing and
 * client-side for live preview in the quotation wizard.
 */

export interface BathroomDimensionInput {
  length: number
  width: number
  height?: number | null
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
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Round money to whole rupees (quotation convention — GST rounded to nearest rupee). */
export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) + Number.EPSILON)
}

/** Bathroom floor area = Length × Width (feet). */
export function computeBathroomArea(length: number, width: number): number {
  const l = Number(length) || 0
  const w = Number(width) || 0
  return round2(l * w)
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

export interface CalcQuotationInput {
  bathrooms: BathroomDimensionInput[]
  packageRate: number
  items: CalcItemInput[]
  discountType: 'FLAT' | 'PERCENT'
  discount: number
  gstRate: number
}

/**
 * Core engine:
 *   area per bathroom = length × width; totalArea = Σ areas
 *   packageAmount     = totalArea × packageRate
 *   itemsAmount       = Σ (quantity × rate)
 *   grossValue        = packageAmount + itemsAmount
 *   discountAmount    = FLAT ? discount : grossValue × discount/100
 *   taxableValue      = grossValue − discountAmount
 *   gstAmount         = taxableValue × gstRate / 100
 *   totalPayable      = taxableValue + gstAmount
 */
export function calcQuotation(input: CalcQuotationInput): CalcResult {
  const totalArea = round2(
    input.bathrooms.reduce((sum, b) => sum + computeBathroomArea(b.length, b.width), 0)
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
