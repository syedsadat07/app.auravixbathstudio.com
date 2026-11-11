import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
async function main() {
  const q = await prisma.quotation.findFirst({
    where: { quotationNumber: 'ABS-Q-000263' },
    include: {
      customer: true,
      createdBy: true,
      versions: {
        where: { versionNumber: 4 },
        include: {
          bathrooms: true,
          items: true
        }
      }
    }
  });

  const settings = await prisma.setting.findMany();
  const settingsMap = {};
  for (const s of settings) settingsMap[s.key] = s.value;

  console.log('Quotation:', JSON.stringify(q, null, 2));
  console.log('Settings:', JSON.stringify(settingsMap, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
