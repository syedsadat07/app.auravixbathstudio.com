/**
 * Script to upsert Ceramic and Vitrified tiles into the database.
 * Run: node scripts/seed-tiles.mjs
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // Ensure Tiles category exists
  const cat = await db.materialCategory.upsert({
    where: { name: 'Tiles' },
    update: {},
    create: { name: 'Tiles', sortOrder: 0 },
  })
  console.log('Category:', cat.id, cat.name)

  // Get first super admin for createdById
  const admin = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  if (!admin) {
    console.error('No SUPER_ADMIN user found. Please seed users first.')
    process.exit(1)
  }

  const tiles = [
    {
      name: 'Ceramic Tile',
      subCategory: 'Wall & Floor',
      brand: 'AURAVIX Essentials',
      sku: 'ABS-TIL-CER',
      description: 'Glossy ceramic wall & floor tile, beveled edges. Price per sq.ft.',
      price: 65,
      unit: 'sq.ft',
      coverage: 1,
      coverageUnit: 'sq.ft',
      wastagePercent: 10,
      quantityRule: 'AREA',
      imageUrl: '/materials/ceramic-tile.png',
    },
    {
      name: 'Vitrified Tile',
      subCategory: 'Floor',
      brand: 'AURAVIX Select',
      sku: 'ABS-TIL-VIT',
      description: 'Polished vitrified floor tile, marble finish. Price per sq.ft.',
      price: 80,
      unit: 'sq.ft',
      coverage: 1,
      coverageUnit: 'sq.ft',
      wastagePercent: 10,
      quantityRule: 'AREA',
      imageUrl: '/materials/vitrified-tile.png',
    },
  ]

  for (const t of tiles) {
    const existing = await db.material.findFirst({ where: { name: t.name } })
    const data = {
      categoryId: cat.id,
      name: t.name,
      subCategory: t.subCategory,
      brand: t.brand,
      sku: t.sku,
      description: t.description,
      price: t.price,
      unit: t.unit,
      coverage: t.coverage,
      coverageUnit: t.coverageUnit,
      wastagePercent: t.wastagePercent,
      quantityRule: t.quantityRule,
      imageUrl: t.imageUrl,
      status: 'ACTIVE',
    }
    if (existing) {
      await db.material.update({ where: { id: existing.id }, data })
      console.log(`Updated: ${t.name} (id: ${existing.id})`)
    } else {
      const rec = await db.material.create({ data: { ...data, createdById: admin.id } })
      console.log(`Created: ${t.name} (id: ${rec.id})`)
    }
  }

  console.log('Done.')
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
