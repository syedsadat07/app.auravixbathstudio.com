/**
 * AURAVIX BATH STUDIO — Database seed
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('Seeding AURAVIX BATH STUDIO…')

  // ---------------- Users ----------------
  const sa1Pass = await bcrypt.hash('steve@1234JOBS', 10)
  const sa2Pass = await bcrypt.hash('white@0007teek', 10)
  const adminPass = await bcrypt.hash('admin@1234', 10)

  const sa1 = await db.user.upsert({
    where: { email: 'syedsadat@auravixbathstudio.com' },
    update: {},
    create: {
      name: 'Syed Sadat',
      username: 'syedsadat',
      email: 'syedsadat@auravixbathstudio.com',
      mobile: '9845000001',
      passwordHash: sa1Pass,
      role: 'SUPER_ADMIN',
    },
  })
  const sa2 = await db.user.upsert({
    where: { email: 'syedshams@auravixbathstudio.com' },
    update: {},
    create: {
      name: 'Syed Shams',
      username: 'syedshams',
      email: 'syedshams@auravixbathstudio.com',
      mobile: '9845000002',
      passwordHash: sa2Pass,
      role: 'SUPER_ADMIN',
    },
  })
  const admin1 = await db.user.upsert({
    where: { email: 'rajesh@auravixbathstudio.com' },
    update: {},
    create: {
      name: 'Rajesh Kumar',
      username: 'rajesh',
      email: 'rajesh@auravixbathstudio.com',
      mobile: '9845000003',
      passwordHash: adminPass,
      role: 'ADMIN',
    },
  })
  const admin2 = await db.user.upsert({
    where: { email: 'priya@auravixbathstudio.com' },
    update: {},
    create: {
      name: 'Priya Sharma',
      username: 'priya',
      email: 'priya@auravixbathstudio.com',
      mobile: '9845000004',
      passwordHash: adminPass,
      role: 'ADMIN',
    },
  })
  console.log('✓ users')

  // ---------------- Packages ----------------
  const pkgBasic = await db.package.upsert({
    where: { name: 'Basic' },
    update: { pricePerSqft: 2500 },
    create: {
      name: 'Basic',
      pricePerSqft: 2500,
      description: 'Essential renovation — quality ceramic tiling, standard sanitaryware and fittings.',
      duration: '10–12 days',
    },
  })
  const pkgPremium = await db.package.upsert({
    where: { name: 'Premium' },
    update: { pricePerSqft: 3500 },
    create: {
      name: 'Premium',
      pricePerSqft: 3500,
      description: 'Enhanced finishes — vitrified tiles, premium CP fittings and designer vanity.',
      duration: '14–18 days',
    },
  })
  const pkgLuxury = await db.package.upsert({
    where: { name: 'Luxury' },
    update: { pricePerSqft: 4500 },
    create: {
      name: 'Luxury',
      pricePerSqft: 4500,
      description: 'Signature experience — luxury finishes, rain shower, LED mirror and enclosures.',
      duration: '18–25 days',
    },
  })
  console.log('✓ packages')

  // ---------------- Categories + Materials ----------------
  const cats = ['Tiles', 'Vanity', 'Shower', 'WC', 'Basin', 'Faucets', 'Add-ons', 'Others']
  const catIds: Record<string, string> = {}
  for (let i = 0; i < cats.length; i++) {
    const c = await db.materialCategory.upsert({
      where: { name: cats[i] },
      update: { sortOrder: i },
      create: { name: cats[i], sortOrder: i },
    })
    catIds[c.name] = c.id
  }

  const materials: Array<{
    name: string
    category: string
    subCategory?: string
    brand?: string
    sku?: string
    description?: string
    price: number
    unit: string
    coverage?: number
    coverageUnit?: string
    wastagePercent?: number
    quantityRule: string
    imageUrl?: string
  }> = [
    { name: 'Ceramic Tile', category: 'Tiles', subCategory: 'Wall & Floor', brand: 'AURAVIX Essentials', sku: 'ABS-TIL-CER', description: 'Glossy ceramic wall & floor tile, beveled edges. Price per sq.ft.', price: 65, unit: 'sq.ft', coverage: 1, coverageUnit: 'sq.ft', wastagePercent: 10, quantityRule: 'AREA', imageUrl: '/materials/ceramic-tile.png' },
    { name: 'Vitrified Tile', category: 'Tiles', subCategory: 'Floor', brand: 'AURAVIX Select', sku: 'ABS-TIL-VIT', description: 'Polished vitrified floor tile, marble finish. Price per sq.ft.', price: 80, unit: 'sq.ft', coverage: 1, coverageUnit: 'sq.ft', wastagePercent: 10, quantityRule: 'AREA', imageUrl: '/materials/vitrified-tile.png' },
    { name: 'Standard Vanity', category: 'Vanity', subCategory: 'Vanity', brand: 'AURAVIX Basics', sku: 'ABS-VAN-STD', description: 'Standard vanity unit with mirror and storage.', price: 6500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/vanity.png' },
    { name: 'Premium Vanity', category: 'Vanity', subCategory: 'Vanity', brand: 'AURAVIX Select', sku: 'ABS-VAN-PRM', description: 'Premium wooden vanity with soft-close drawers.', price: 8500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/vanity.png' },
    { name: 'Luxury Vanity', category: 'Vanity', subCategory: 'Vanity', brand: 'AURAVIX Luxe', sku: 'ABS-VAN-LUX', description: 'Luxury vanity with quartz counter and backlit mirror.', price: 14500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/vanity.png' },
    { name: 'Standard Shower', category: 'Shower', subCategory: 'Shower', brand: 'AURAVIX Basics', sku: 'ABS-SHW-STD', description: 'Overhead shower with single-flow head.', price: 3500, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/rain-shower.png' },
    { name: 'Premium Shower', category: 'Shower', subCategory: 'Shower', brand: 'AURAVIX Select', sku: 'ABS-SHW-PRM', description: 'Premium multi-flow overhead shower system.', price: 5500, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/rain-shower.png' },
    { name: 'Rain Shower', category: 'Shower', subCategory: 'Shower', brand: 'AURAVIX Luxe', sku: 'ABS-SHW-RAIN', description: 'Ceiling-mounted 12" square rain shower with thermostatic mixer.', price: 8500, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/rain-shower.png' },
    { name: 'Hand Shower', category: 'Shower', subCategory: 'Shower', brand: 'AURAVIX Basics', sku: 'ABS-SHW-HAND', description: 'Hand shower with flexible hose and hook.', price: 2200, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Floor Mounted WC', category: 'WC', subCategory: 'WC', brand: 'AURAVIX Basics', sku: 'ABS-WC-FLR', description: 'Floor-mounted EWC, siphon flush.', price: 5500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/wall-hung-wc.png' },
    { name: 'Wall Hung WC', category: 'WC', subCategory: 'WC', brand: 'AURAVIX Select', sku: 'ABS-WC-WALL', description: 'Wall-hung rimless WC with concealed cistern.', price: 12500, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/wall-hung-wc.png' },
    { name: 'Counter Basin', category: 'Basin', subCategory: 'Basin', brand: 'AURAVIX Select', sku: 'ABS-BSN-CNT', description: 'Table-top counter basin, ceramic.', price: 4500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/counter-basin.png' },
    { name: 'Wall Hung Basin', category: 'Basin', subCategory: 'Basin', brand: 'AURAVIX Basics', sku: 'ABS-BSN-WALL', description: 'Wall-hung basin with bottle trap.', price: 3200, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/counter-basin.png' },
    { name: 'Designer Basin', category: 'Basin', subCategory: 'Basin', brand: 'AURAVIX Luxe', sku: 'ABS-BSN-DES', description: 'Designer artisan vessel basin.', price: 7500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/counter-basin.png' },
    { name: 'Basin Faucet', category: 'Faucets', subCategory: 'Faucets', brand: 'AURAVIX Select', sku: 'ABS-FCT-BSN', description: 'Single-lever basin mixer, chrome.', price: 2800, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Shower Mixer', category: 'Faucets', subCategory: 'Faucets', brand: 'AURAVIX Select', sku: 'ABS-FCT-SMX', description: 'Concealed shower mixer with diverter knob.', price: 4200, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Diverter', category: 'Faucets', subCategory: 'Faucets', brand: 'AURAVIX Select', sku: 'ABS-FCT-DIV', description: '2-inlet concealed diverter for overhead + hand shower.', price: 5200, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Health Faucet', category: 'Faucets', subCategory: 'Faucets', brand: 'AURAVIX Basics', sku: 'ABS-FCT-HLT', description: 'Health faucet with braided hose.', price: 1200, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Angle Valve', category: 'Faucets', subCategory: 'Faucets', brand: 'AURAVIX Basics', sku: 'ABS-FCT-ANG', description: 'Brass angle valve, chrome plated.', price: 450, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/faucet.png' },
    { name: 'Shower Enclosure', category: 'Add-ons', subCategory: 'Add-on', brand: 'AURAVIX Luxe', sku: 'ABS-ADD-ENC', description: 'Toughened glass shower enclosure, 6mm, chrome profiles.', price: 18000, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/shower-enclosure.png' },
    { name: 'Bath Tub', category: 'Add-ons', subCategory: 'Add-on', brand: 'AURAVIX Luxe', sku: 'ABS-ADD-TUB', description: 'Freestanding acrylic bath tub with floor-mounted mixer.', price: 32000, unit: 'set', quantityRule: 'PIECE', imageUrl: '/materials/bath-tub.png' },
    { name: 'LED Mirror', category: 'Add-ons', subCategory: 'Add-on', brand: 'AURAVIX Luxe', sku: 'ABS-ADD-LED', description: 'LED backlit mirror with touch sensor and defogger.', price: 4500, unit: 'piece', quantityRule: 'PIECE', imageUrl: '/materials/led-mirror.png' },
  ]

  const materialIdByName: Record<string, string> = {}
  for (const m of materials) {
    const existing = await db.material.findFirst({ where: { name: m.name } })
    const data = {
      categoryId: catIds[m.category],
      name: m.name,
      subCategory: m.subCategory,
      brand: m.brand,
      sku: m.sku,
      description: m.description,
      price: m.price,
      unit: m.unit,
      coverage: m.coverage ?? 1,
      coverageUnit: m.coverageUnit ?? 'piece',
      wastagePercent: m.wastagePercent ?? 0,
      quantityRule: m.quantityRule,
      imageUrl: m.imageUrl,
      status: 'ACTIVE',
    }
    const rec = existing
      ? await db.material.update({ where: { id: existing.id }, data })
      : await db.material.create({ data: { ...data, createdById: sa1.id } })
    materialIdByName[m.name] = rec.id
  }
  console.log('✓ materials', Object.keys(materialIdByName).length)

  // ---------------- Settings ----------------
  const settings: Record<string, string> = {
    company_name: 'AURAVIX BATH STUDIO',
    company_address: '#42, 3rd Floor, Jayanagar 4th Block, Bengaluru, Karnataka 560011',
    company_phone: '+91 8047112200',
    company_email: 'hello@auravixbathstudio.com',
    company_website: 'www.auravixbathstudio.com',
    gstin: '29ABCDE1234F1Z5',
    pan: 'ABCDE1234F',
    reg_number: 'U74999KA2026PTC000000',
    quote_prefix: 'ABS-Q',
    quote_validity_days: '30',
    gst_rate: '18',
    consultation_fee: '299',
    bank_details: 'AURAVIX BATH STUDIO PVT LTD | HDFC Bank, Jayanagar Branch | A/C 50200 1234 5678 | IFSC HDFC0001234',
    upi_details: 'auravixbath@hdfcbank',
    terms:
      '1. This quotation is valid for 30 days from the date of issue.\n2. 50% advance payment required to commence work; 40% on mid-stage inspection; 10% on handover.\n3. Prices are based on standard site conditions. Any civil/carpentry modifications beyond scope will be charged separately.\n4. Delivery & installation timeline: 2–3 weeks from design freeze and advance receipt.\n5. Products remain AURAVIX property until full payment is received.\n6. Warranty: 1 year on workmanship; manufacturer warranty on all fixtures as applicable.\n7. Consultation fee of ₹299 is adjustable against the final project value.',
    orders_target: '10',
    admins_can_publish: 'true',
    logo_url: '/brand/logo.png',
  }
  for (const [key, value] of Object.entries(settings)) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
  console.log('✓ settings')

  // ---------------- Demo leads / customers / appointments ----------------
  const today = new Date()
  today.setHours(16, 0, 0, 0)
  const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000)
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000)
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000)
  const daysAhead = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000)

  const demoLeads: Array<{
    name: string
    phone: string
    email: string
    address: string
    city: string
    status: string
    lostReason?: string
    admin: string
    appointment?: Date | null
    createdDaysAgo: number
    notes?: string
  }> = [
    { name: 'Dhananjay', phone: '7019573007', email: 'dkumar.fost@gmail.com', address: '#203, Raj Meridian Apartment 2nd Cross Rd, KHB Colony, 5th Block, Koramangala', city: 'Bengaluru', status: 'CONSULTATION_SCHEDULED', admin: 'SA1', appointment: daysAhead(2), createdDaysAgo: 1, notes: 'Interested in Premium package for master bathroom.' },
    { name: 'Vaibhav Raj', phone: '9900112233', email: 'vaibhav.raj@gmail.com', address: '22, Brigade Residency, Uttharahalli Main Road', city: 'Bengaluru', status: 'CONSULTATION_SCHEDULED', admin: 'SA1', appointment: today, createdDaysAgo: 3 },
    { name: 'Manjula', phone: '9845099887', email: 'manjula.devi@outlook.com', address: '501, Sobha Dream Acres, Panathur', city: 'Bengaluru', status: 'CONSULTATION_SCHEDULED', admin: 'SA1', appointment: tomorrow, createdDaysAgo: 2 },
    { name: 'guruprasad rao', phone: '9343736558', email: 'gprao2002@gmail.com', address: '#007, Westside, Jayanagar', city: 'Bengaluru', status: 'MEETING_DONE', admin: 'SA1', createdDaysAgo: 20 },
    { name: 'Priyadarshini', phone: '9845058970', email: 'priyamagavi@gmail.com', address: '266-267, Lg Lake Dew 4th main Belli Shivalaya Bharathy Bangalore 560077', city: 'Bengaluru', status: 'CONVERTED', admin: 'SA1', createdDaysAgo: 40 },
    { name: 'amar sangwe', phone: '9632124578', email: 'amar.sangwe@gmail.com', address: 'B-704, Prestige Tech Park, Kadubeesanahalli', city: 'Bengaluru', status: 'MEETING_DONE', admin: 'RAJESH', createdDaysAgo: 12 },
    { name: 'Santosh H', phone: '7353881075', email: 'chandra.shekar@designcafe.com', address: 'A204, Vajra Global, Bengaluru', city: 'Bengaluru', status: 'CLOSED_LOST', lostReason: 'CANCELLED_PLANS', admin: 'SA1', createdDaysAgo: 25 },
    { name: 'Philip Daniel', phone: '9539827731', email: 'philip.deniel@gmail.com', address: '12, Cooke Town, Fraser Town', city: 'Bengaluru', status: 'CLOSED_LOST', lostReason: 'BUDGET', admin: 'SA1', createdDaysAgo: 30 },
    { name: 'Kavya Nair', phone: '8877665544', email: 'kavya.nair@gmail.com', address: '402, Purva Skywood, Harlur Road', city: 'Bengaluru', status: 'QUOTE_SHARED', admin: 'RAJESH', createdDaysAgo: 8 },
    { name: 'Rohit Shetty', phone: '9663344556', email: 'rohit.shetty@gmail.com', address: '9, Dollars Colony, RMV 2nd Stage', city: 'Bengaluru', status: 'FOLLOW_UP', admin: 'PRIYA', createdDaysAgo: 15 },
    { name: 'Lakshmi Iyer', phone: '9445566778', email: 'lakshmi.iyer@yahoo.com', address: '31, Basavanagudi, Bull Temple Road', city: 'Bengaluru', status: 'QUOTE_PREPARING', admin: 'PRIYA', createdDaysAgo: 5 },
    { name: 'Imran Khan', phone: '9123456780', email: 'imran.khan@gmail.com', address: '17, Langford Gardens, Richmond Town', city: 'Bengaluru', status: 'NEW', admin: 'RAJESH', createdDaysAgo: 0 },
    { name: 'Deepa Menon', phone: '9345678123', email: 'deepa.menon@gmail.com', address: '88, HSR Layout Sector 2', city: 'Bengaluru', status: 'CONTACTED', admin: 'PRIYA', createdDaysAgo: 1 },
  ]

  const adminByName: Record<string, string> = {
    SA1: sa1.id,
    SA2: sa2.id,
    RAJESH: admin1.id,
    PRIYA: admin2.id,
  }

  const leadIdByName: Record<string, string> = {}
  for (const l of demoLeads) {
    const existingCustomer = await db.customer.findFirst({ where: { phone: l.phone } })
    const customer = existingCustomer
      ? await db.customer.update({ where: { id: existingCustomer.id }, data: { name: l.name, email: l.email, address: l.address, city: l.city } })
      : await db.customer.create({
          data: { name: l.name, phone: l.phone, email: l.email, address: l.address, city: l.city },
        })
    const existingLead = await db.lead.findFirst({ where: { customerId: customer.id } })
    const base = {
      customerId: customer.id,
      assignedAdminId: adminByName[l.admin],
      status: l.status,
      lostReason: l.lostReason,
      appointmentDate: l.appointment ?? null,
      notes: l.notes,
      createdAt: daysAgo(l.createdDaysAgo),
    }
    let lead = existingLead
    if (lead) {
      lead = await db.lead.update({ where: { id: lead.id }, data: base })
    } else {
      const counterKey = 'lead'
      const existingCounter = await db.counter.findUnique({ where: { key: counterKey } })
      let num: number
      if (!existingCounter) {
        await db.counter.create({ data: { key: counterKey, value: 1000 } })
        num = 1000
      } else {
        const updated = await db.counter.update({ where: { key: counterKey }, data: { value: { increment: 1 } } })
        num = updated.value
      }
      lead = await db.lead.create({ data: { ...base, leadNumber: `BEN${String(num).padStart(5, '0')}` } })
    }
    leadIdByName[l.name] = lead.id
    if (l.appointment) {
      const hasAppt = await db.appointment.findFirst({ where: { leadId: lead.id } })
      if (!hasAppt) {
        await db.appointment.create({
          data: { leadId: lead.id, adminId: adminByName[l.admin], scheduledAt: l.appointment, status: 'SCHEDULED', notes: 'Site visit + measurement' },
        })
      }
    }
  }
  console.log('✓ leads')

  // ---------------- Demo quotations ----------------
  const gstRate = 18

  async function buildVersionData(opts: {
    customerName: string
    bathrooms: Array<{ name: string; type: string; length: number; width: number; height?: number }>
    packageName: string
    tileName: string
    fixtures: Array<{ material: string; qty: number }>
    addons: Array<{ material: string; qty: number }>
    consultation: boolean
    discountType: 'FLAT' | 'PERCENT'
    discount: number
  }) {
    const pkg = await db.package.findUnique({ where: { name: opts.packageName } })
    if (!pkg) throw new Error('package missing')
    const bathrooms = opts.bathrooms.map((b) => ({ ...b, areaSqft: Math.round(b.length * b.width * 100) / 100 }))
    const totalArea = bathrooms.reduce((s, b) => s + b.areaSqft, 0)
    const packageAmount = totalArea * pkg.pricePerSqft

    const items: Array<{ section: string; materialId: string | null; name: string; quantity: number; unit: string; rate: number; amount: number }> = []
    const tile = await db.material.findUnique({ where: { id: materialIdByName[opts.tileName] } })
    if (tile) {
      const qty = Math.ceil((totalArea / tile.coverage) * (1 + tile.wastagePercent / 100))
      items.push({ section: 'TILES', materialId: tile.id, name: tile.name, quantity: qty, unit: tile.unit, rate: tile.price, amount: qty * tile.price })
    }
    for (const f of opts.fixtures) {
      const m = await db.material.findUnique({ where: { id: materialIdByName[f.material] } })
      if (m) items.push({ section: 'FIXTURES', materialId: m.id, name: m.name, quantity: f.qty, unit: m.unit, rate: m.price, amount: f.qty * m.price })
    }
    for (const a of opts.addons) {
      const m = await db.material.findUnique({ where: { id: materialIdByName[a.material] } })
      if (m) items.push({ section: 'ADDONS', materialId: m.id, name: m.name, quantity: a.qty, unit: m.unit, rate: m.price, amount: a.qty * m.price })
    }
    if (opts.consultation) {
      items.push({ section: 'OTHER', materialId: null, name: 'Design Consultation', quantity: 1, unit: 'unit', rate: 299, amount: 299 })
    }
    const itemsAmount = items.reduce((s, i) => s + i.amount, 0)
    const grossValue = packageAmount + itemsAmount
    const discountAmount = opts.discountType === 'PERCENT' ? (grossValue * opts.discount) / 100 : opts.discount
    const taxableValue = grossValue - discountAmount
    const gstAmount = (taxableValue * gstRate) / 100
    const totalPayable = taxableValue + gstAmount
    return { bathrooms, totalArea, packageId: pkg.id, packageName: pkg.name, packageRate: pkg.pricePerSqft, packageAmount, items, itemsAmount, grossValue, discountType: opts.discountType, discount: opts.discount, discountAmount, taxableValue, gstRate, gstAmount, totalPayable }
  }

  async function createDemoQuotation(opts: {
    customerName: string
    createdById: string
    status: string
    versionType: string
    validityDays: number
    createdDaysAgo: number
    bathrooms: Array<{ name: string; type: string; length: number; width: number; height?: number }>
    packageName: string
    tileName: string
    fixtures: Array<{ material: string; qty: number }>
    addons: Array<{ material: string; qty: number }>
    consultation: boolean
    discountType: 'FLAT' | 'PERCENT'
    discount: number
  }) {
    const exists = await db.quotation.findFirst({ where: { customer: { name: opts.customerName } } })
    if (exists) return exists
    const customer = await db.customer.findFirst({ where: { name: opts.customerName } })
    if (!customer) return null
    const lead = await db.lead.findFirst({ where: { customerId: customer.id } })
    const count = await db.quotation.count()
    const quotationNumber = `ABS-Q-${String(245 + count).padStart(6, '0')}`
    const v = await buildVersionData(opts)
    const createdAt = daysAgo(opts.createdDaysAgo)
    const quotation = await db.quotation.create({
      data: {
        quotationNumber,
        customerId: customer.id,
        leadId: lead?.id,
        createdById: opts.createdById,
        status: opts.status,
        validityDays: opts.validityDays,
        createdAt,
        updatedAt: createdAt,
      },
    })
    const version = await db.quotationVersion.create({
      data: {
        quotationId: quotation.id,
        versionNumber: 1,
        versionType: opts.versionType,
        status: opts.status,
        totalArea: v.totalArea,
        packageId: v.packageId,
        packageName: v.packageName,
        packageRate: v.packageRate,
        packageAmount: v.packageAmount,
        itemsAmount: v.itemsAmount,
        grossValue: v.grossValue,
        discountType: v.discountType,
        discount: v.discount,
        discountAmount: v.discountAmount,
        taxableValue: v.taxableValue,
        gstRate: v.gstRate,
        gstAmount: v.gstAmount,
        totalPayable: v.totalPayable,
        createdById: opts.createdById,
        createdAt,
        bathrooms: { create: v.bathrooms.map((b) => ({ name: b.name, type: b.type, length: b.length, width: b.width, height: b.height ?? null, areaSqft: b.areaSqft })) },
        items: { create: v.items.map((i) => ({ section: i.section, materialId: i.materialId, name: i.name, quantity: i.quantity, unit: i.unit, rate: i.rate, amount: i.amount })) },
      },
    })
    await db.quotation.update({ where: { id: quotation.id }, data: { versions: { set: [{ id: version.id }] } } })
    return quotation
  }

  // Q1 — Priyadarshini (converted → order-like pipeline)
  await createDemoQuotation({
    customerName: 'Priyadarshini', createdById: sa1.id, status: 'PAYMENT_RECEIVED', versionType: 'UPGRADED',
    validityDays: 30, createdDaysAgo: 25,
    bathrooms: [{ name: 'Master Bathroom', type: 'MASTER', length: 9, width: 5, height: 10 }],
    packageName: 'Premium', tileName: 'Vitrified Tile',
    fixtures: [{ material: 'Premium Vanity', qty: 1 }, { material: 'Rain Shower', qty: 1 }, { material: 'Wall Hung WC', qty: 1 }, { material: 'Counter Basin', qty: 1 }, { material: 'Diverter', qty: 1 }, { material: 'Health Faucet', qty: 1 }, { material: 'Angle Valve', qty: 2 }],
    addons: [{ material: 'LED Mirror', qty: 1 }, { material: 'Shower Enclosure', qty: 1 }],
    consultation: true, discountType: 'FLAT', discount: 5000,
  })
  // Q2 — Kavya Nair (quote shared → follow-up pipeline)
  await createDemoQuotation({
    customerName: 'Kavya Nair', createdById: admin1.id, status: 'QUOTE_SHARED', versionType: 'INITIAL',
    validityDays: 30, createdDaysAgo: 6,
    bathrooms: [{ name: 'Common Bathroom', type: 'COMMON', length: 7, width: 4, height: 9.5 }],
    packageName: 'Basic', tileName: 'Ceramic Tile',
    fixtures: [{ material: 'Standard Vanity', qty: 1 }, { material: 'Standard Shower', qty: 1 }, { material: 'Floor Mounted WC', qty: 1 }, { material: 'Wall Hung Basin', qty: 1 }, { material: 'Basin Faucet', qty: 1 }, { material: 'Health Faucet', qty: 1 }],
    addons: [], consultation: true, discountType: 'PERCENT', discount: 3,
  })
  // Q3 — Rohit Shetty (published, follow-up)
  await createDemoQuotation({
    customerName: 'Rohit Shetty', createdById: admin2.id, status: 'PUBLISHED', versionType: 'INITIAL',
    validityDays: 30, createdDaysAgo: 4,
    bathrooms: [
      { name: 'Master Bathroom', type: 'MASTER', length: 10, width: 6, height: 10 },
      { name: 'Powder Room', type: 'POWDER_ROOM', length: 4, width: 3, height: 9 },
    ],
    packageName: 'Luxury', tileName: 'Vitrified Tile',
    fixtures: [{ material: 'Luxury Vanity', qty: 1 }, { material: 'Rain Shower', qty: 1 }, { material: 'Wall Hung WC', qty: 1 }, { material: 'Designer Basin', qty: 1 }, { material: 'Diverter', qty: 1 }, { material: 'Angle Valve', qty: 3 }],
    addons: [{ material: 'Bath Tub', qty: 1 }, { material: 'LED Mirror', qty: 1 }],
    consultation: true, discountType: 'FLAT', discount: 10000,
  })
  // Q4 — Lakshmi Iyer (draft)
  await createDemoQuotation({
    customerName: 'Lakshmi Iyer', createdById: admin2.id, status: 'DRAFT', versionType: 'INITIAL',
    validityDays: 30, createdDaysAgo: 1,
    bathrooms: [{ name: 'Attached Bathroom', type: 'ATTACHED', length: 6, width: 4, height: 9 }],
    packageName: 'Premium', tileName: 'Ceramic Tile',
    fixtures: [{ material: 'Premium Vanity', qty: 1 }, { material: 'Premium Shower', qty: 1 }, { material: 'Floor Mounted WC', qty: 1 }],
    addons: [{ material: 'LED Mirror', qty: 1 }],
    consultation: false, discountType: 'FLAT', discount: 0,
  })
  console.log('✓ quotations')

  console.log('Seed complete ✔')
  console.log('Super Admin 1: syedsadat@auravixbathstudio.com / steve@1234JOBS')
  console.log('Super Admin 2: syedshams@auravixbathstudio.com / white@0007teek')
  console.log('Admin demo:    rajesh@auravixbathstudio.com / admin@1234')
  console.log('Admin demo:    priya@auravixbathstudio.com / admin@1234')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
