import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const versions = await db.quotationVersion.findMany({ select: { id: true } })
for (const v of versions) {
  await db.bathroom.deleteMany({ where: { versionId: v.id } })
  await db.quotationItem.deleteMany({ where: { versionId: v.id } })
}
await db.quotationVersion.deleteMany({})
await db.quotation.deleteMany({})
await db.counter.deleteMany({ where: { key: 'quotation' } })
console.log('quotations cleared')
await db.$disconnect()
