import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
// Remove test quotation + its versions (Test Bath from agent curl tests)
const q = await db.quotation.findFirst({ where: { customer: { name: 'Test Customer' } } })
const q2 = await db.quotation.findFirst({ where: { quotationNumber: 'ABS-Q-000249' } })
for (const target of [q, q2]) {
  if (target) {
    const versions = await db.quotationVersion.findMany({ where: { quotationId: target.id } })
    for (const v of versions) {
      await db.bathroom.deleteMany({ where: { versionId: v.id } })
      await db.quotationItem.deleteMany({ where: { versionId: v.id } })
    }
    await db.quotationVersion.deleteMany({ where: { quotationId: target.id } })
    await db.quotation.delete({ where: { id: target.id } })
    console.log('deleted test quotation', target.quotationNumber)
  }
}
// remove disabled test admin
const ta = await db.user.findFirst({ where: { role: 'ADMIN', status: 'DISABLED' } })
if (ta) { await db.user.delete({ where: { id: ta.id } }); console.log('deleted test admin', ta.email) }
// remove test leads created by agent tests (phones 999...)
const testCustomers = await db.customer.findMany({ where: { phone: { startsWith: '9999' } } })
for (const c of testCustomers) {
  const leads = await db.lead.findMany({ where: { customerId: c.id } })
  for (const l of leads) {
    await db.appointment.deleteMany({ where: { leadId: l.id } })
    await db.lead.delete({ where: { id: l.id } })
  }
  await db.customer.delete({ where: { id: c.id } })
  console.log('deleted test customer', c.name)
}
console.log('cleanup done')
await db.$disconnect()
