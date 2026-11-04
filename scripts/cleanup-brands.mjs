/**
 * AURAVIX BATH STUDIO — Brand Cleanup Script
 * Reassigns all materials to only 3 approved brands: Jaquar, Kohler, BathSense.
 * Products that don't belong to Jaquar/Kohler are reassigned to BathSense.
 * Also ensures all required categories exist.
 */
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// Map old brand names → one of the 3 approved brands
const BRAND_REMAP = {
  // Keep as-is
  'Jaquar': 'Jaquar',
  'Kohler': 'Kohler',
  'BathSense': 'BathSense',

  // Remap AURAVIX house brands → BathSense
  'AURAVIX Basics': 'BathSense',
  'AURAVIX Essentials': 'BathSense',
  'AURAVIX Luxe': 'BathSense',
  'AURAVIX Select': 'BathSense',

  // Remap third-party brands → BathSense
  'Astral': 'BathSense',
  'Dr. Fixit': 'BathSense',
  'Grohe': 'BathSense',
  'Havells': 'BathSense',
  'Laticrete': 'BathSense',
  'MYK Laticrete': 'BathSense',
  'Plantex': 'BathSense',
  'Roff': 'BathSense',
  'Schneider Electric': 'BathSense',
  'Viking': 'BathSense',
  'kajaria': 'BathSense',
  'Kajaria': 'BathSense',
}

// All required categories with sort orders
const REQUIRED_CATEGORIES = [
  { name: 'Sanitaryware', sortOrder: 1 },
  { name: 'Sanitaryware & WC', sortOrder: 1 },
  { name: 'Washbasins & Vanities', sortOrder: 2 },
  { name: 'Wash Basin', sortOrder: 2 },
  { name: 'Faucets & Mixers', sortOrder: 3 },
  { name: 'Showers & Enclosures', sortOrder: 4 },
  { name: 'Shower System', sortOrder: 4 },
  { name: 'Bathtubs & Mirrors', sortOrder: 5 },
  { name: 'Bathroom Accessories', sortOrder: 6 },
  { name: 'Waterproofing & Plumbing', sortOrder: 7 },
  { name: 'Waste & Drainage', sortOrder: 7 },
  { name: 'Adhesives & Grouting', sortOrder: 8 },
  { name: 'Electrical & Installation', sortOrder: 9 },
]

async function main() {
  console.log('Starting brand cleanup...\n')

  // 1. Ensure all required categories exist
  for (const cat of REQUIRED_CATEGORIES) {
    await db.materialCategory.upsert({
      where: { name: cat.name },
      update: { sortOrder: cat.sortOrder },
      create: { name: cat.name, sortOrder: cat.sortOrder },
    })
  }
  console.log(`✓ Categories verified (${REQUIRED_CATEGORIES.length} categories)\n`)

  // 2. Fetch all materials
  const all = await db.material.findMany({ select: { id: true, name: true, brand: true } })
  console.log(`Found ${all.length} total materials\n`)

  let updated = 0
  let skipped = 0

  for (const mat of all) {
    const currentBrand = mat.brand || ''
    const newBrand = BRAND_REMAP[currentBrand]

    if (!newBrand) {
      // Brand not in remap table — default to BathSense
      await db.material.update({ where: { id: mat.id }, data: { brand: 'BathSense' } })
      console.log(`  ↳ Unknown brand "${currentBrand}" on "${mat.name}" → BathSense`)
      updated++
      continue
    }

    if (newBrand !== currentBrand) {
      await db.material.update({ where: { id: mat.id }, data: { brand: newBrand } })
      console.log(`  ${currentBrand} → ${newBrand}  ("${mat.name}")`)
      updated++
    } else {
      skipped++
    }
  }

  console.log(`\n✓ Updated ${updated} materials`)
  console.log(`✓ Kept    ${skipped} materials (brand already correct)`)

  // 3. Verify final brand distribution
  const brands = await db.material.groupBy({
    by: ['brand'],
    _count: { id: true },
    orderBy: { brand: 'asc' },
  })

  console.log('\n--- Final brand distribution ---')
  for (const b of brands) {
    console.log(`  ${b.brand || '(no brand)'}: ${b._count.id} products`)
  }

  console.log('\nBrand cleanup complete.')
}

main()
  .catch((e) => { console.error('Error:', e); process.exit(1) })
  .finally(() => db.$disconnect())

