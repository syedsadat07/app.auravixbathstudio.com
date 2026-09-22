#!/usr/bin/env bun
/**
 * AURAVIX BATH STUDIO — Product catalog importer
 * ------------------------------------------------
 * Replaces all existing materials with a new product list from a CSV
 * (file path) or a PUBLIC Google Sheet URL, and fetches product photos
 * from product links (og:image / JSON-LD / <img> heuristic).
 *
 * Usage:
 *   bun scripts/import-products.mjs <path-to.csv> [--dry-run] [--no-photos] [--keep-missing]
 *   bun scripts/import-products.mjs "https://docs.google.com/spreadsheets/d/<ID>/edit?gid=0#gid=0" [--dry-run]
 *
 * The sheet must be publicly accessible (Share → Anyone with the link → Viewer,
 * or File → Share → Publish to web). Private sheets are redirected to Google login.
 *
 * Recognized column headers (case/space/punctuation-insensitive), first match wins:
 *   name  : name | product | product name | item | item name | title | description(+name)
 *   sku   : sku | sku code | code | item code | product code | model | model no
 *   price : price | mrp | rate | unit price | selling price | price inr | price(inr)
 *   category   : category | type | section | group
 *   subCategory: subcategory | sub category | sub type
 *   brand      : brand | manufacturer | make
 *   unit       : unit | uom | units | measurement
 *   link       : link | url | product link | product url | product page | page
 *   image      : image | image url | photo | picture | img
 *   coverage   : coverage | coverage area | coverage sqft
 *   wastage    : wastage | wastage % | wastage percent
 *   description: description | details | notes | remarks
 *
 * Safety: quotation items referencing removed materials keep their snapshot
 * (name/rate/amount) — only the materialId link is nulled out before delete.
 */
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

const db = new PrismaClient()
const ROOT = join(import.meta.dir, '..')
const IMG_DIR = join(ROOT, 'public', 'materials')
mkdirSync(IMG_DIR, { recursive: true })

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const NO_PHOTOS = args.includes('--no-photos')
const SOURCE = args.find(a => !a.startsWith('--'))

/* ---------------- CSV fetch & parse ---------------- */

function csvToUrl(src) {
  const m = src.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!m) return null
  let gid = 0
  const gm = src.match(/[#&?]gid=(\d+)/)
  if (gm) gid = gm[1]
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&gid=${gid}`
}

async function loadCsv(src) {
  if (/^https?:\/\//.test(src)) {
    const url = csvToUrl(src)
    if (!url) throw new Error('URL is not a Google Sheets link')
    console.log('Fetching Google Sheet as CSV:', url)
    const res = await fetch(url, { redirect: 'follow' })
    const text = await res.text()
    if (text.trimStart().startsWith('<')) {
      throw new Error(
        'Google returned an HTML login/consent page — the sheet is NOT public.\n' +
        'Fix: Share → General access → "Anyone with the link" → Viewer, then retry.'
      )
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching sheet`)
    return text
  }
  if (!existsSync(src)) throw new Error(`File not found: ${src}`)
  return readFileSync(src, 'utf8')
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows = []
  let row = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else inQ = false
      } else cell += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(v => v.trim() !== ''))
}

/* ---------------- column mapping ---------------- */

const ALIASES = {
  name: ['name', 'product', 'productname', 'product name', 'item', 'itemname', 'item name', 'title', 'producttitle'],
  sku: ['sku', 'skucode', 'sku code', 'code', 'itemcode', 'item code', 'productcode', 'product code', 'model', 'modelno', 'model no', 'modelnumber'],
  price: ['price', 'mrp', 'rate', 'unitprice', 'unit price', 'sellingprice', 'selling price', 'priceinr', 'price inr', 'price(inr)', 'price(rs)', 'rs', 'amount'],
  category: ['category', 'type', 'section', 'group', 'producttype'],
  subCategory: ['subcategory', 'sub category', 'sub-category', 'subtype', 'sub type'],
  brand: ['brand', 'manufacturer', 'make', 'company'],
  unit: ['unit', 'uom', 'units', 'measurement', 'unittype'],
  link: ['link', 'url', 'productlink', 'product link', 'producturl', 'product url', 'productpage', 'product page', 'page', 'website'],
  image: ['image', 'imageurl', 'image url', 'photo', 'picture', 'img', 'photourl', 'image link'],
  coverage: ['coverage', 'coveragearea', 'coverage area', 'coveragesqft', 'coverage (sq.ft)', 'coveragesqft/perbox', 'coverage sqft'],
  wastage: ['wastage', 'wastage%', 'wastage percent', 'wastagepercent', 'wastage %'],
  description: ['description', 'details', 'notes', 'remarks', 'specification', 'specifications'],
}

const norm = s => String(s || '').toLowerCase().replace(/[_\-.()]/g, ' ').replace(/\s+/g, ' ').trim()

function detectColumns(header) {
  const map = {}
  for (const [field, aliases] of Object.entries(ALIASES)) {
    let idx = header.findIndex(h => aliases.includes(norm(h)))
    if (idx === -1) idx = header.findIndex(h => aliases.some(a => norm(h).includes(a)))
    if (idx !== -1) map[field] = idx
  }
  return map
}

/* ---------------- value normalizers ---------------- */

function parsePrice(v) {
  if (v == null) return null
  const n = String(v).replace(/[₹$,\s]|rs\.?|inr/gi, '')
  const m = n.match(/\d+(\.\d+)?/)
  if (!m) return null
  const p = parseFloat(m[0])
  return isFinite(p) ? p : null
}

const UNIT_RULES = [
  { re: /sq\.?\s*ft|square\s*ft|sqft|sft/i, unit: 'sq.ft', rule: 'AREA' },
  { re: /sq\.?\s*m|square\s*m|sqm/i, unit: 'sq.m', rule: 'AREA' },
  { re: /metre|meter\b|rm|rft|running/i, unit: 'meter', rule: 'PIECE' },
  { re: /set|kit|system/i, unit: 'set', rule: 'PIECE' },
  { re: /box|carton/i, unit: 'box', rule: 'AREA' },
  { re: /kg|kilogram/i, unit: 'kg', rule: 'PIECE' },
  { re: /litre|liter|ltr/i, unit: 'litre', rule: 'PIECE' },
  { re: /pcs?|pieces?|nos?\.?\b|number/i, unit: 'piece', rule: 'PIECE' },
]

function parseUnit(v) {
  const s = String(v || '').trim()
  if (!s) return { unit: 'piece', rule: 'PIECE' }
  for (const r of UNIT_RULES) if (r.re.test(s)) return { unit: r.unit, rule: r.rule }
  return { unit: s.toLowerCase(), rule: 'PIECE' }
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'product'
}

/* ---------------- product photo scraping ---------------- */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function extractImageUrl(html) {
  const strategies = [
    () => html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i),
    () => html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i),
    () => html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i),
    () => {
      const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)
      if (ld) { try { const j = JSON.parse(ld[1]); const img = j.image || (Array.isArray(j) && j.find(x => x.image)?.image); if (img) return [null, Array.isArray(img) ? img[0] : (typeof img === 'object' ? img.url : img)] } catch {} }
      return null
    },
    () => html.match(/<img[^>]+(?:data-large|data-src|data-zoom)[^>]*=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp))["']/i),
    () => html.match(/<img[^>]+src=["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp))["']/i),
    () => html.match(/["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/i),
  ]
  for (const s of strategies) {
    try {
      const m = s()
      if (m) {
        const url = (m[1] || m[0]).trim()
        if (/^https?:\/\//.test(url) && !/\.svg|sprite|logo|icon|favicon|placeholder|1x1|pixel/i.test(url)) return url
      }
    } catch {}
  }
  return null
}

async function fetchBuffer(url, timeoutMs = 25000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' }, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const type = res.headers.get('content-type') || ''
    if (!/^image\//.test(type) && !type.includes('octet-stream')) throw new Error(`not an image (${type})`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2000) throw new Error(`image too small (${buf.length}B)`)
    return buf
  } finally { clearTimeout(t) }
}

async function getPage(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 25000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(t) }
}

async function resolvePhoto(row) {
  if (row.image && /^https?:\/\//.test(row.image)) return row.image
  if (row.link && /^https?:\/\//.test(row.link)) {
    try {
      const html = await getPage(row.link)
      return extractImageUrl(html)
    } catch (e) {
      console.log(`   ⚠ page fetch failed for ${row.link}: ${e.message}`)
      return null
    }
  }
  return null
}

async function savePhoto(url, slug) {
  const buf = await fetchBuffer(url)
  const file = `${slug}.png`
  const out = join(IMG_DIR, file)
  await sharp(buf).rotate().resize(512, 512, { fit: 'cover', background: '#ffffff' })
    .png({ compressionLevel: 9, palette: true, quality: 82 })
    .toFile(out)
  return `/materials/${file}`
}

/* ---------------- main ---------------- */

async function main() {
  if (!SOURCE) {
    console.error('Usage: bun scripts/import-products.mjs <csv-path | google-sheet-url> [--dry-run] [--no-photos]')
    process.exit(1)
  }
  const csv = await loadCsv(SOURCE)
  const rows = parseCsv(csv)
  if (rows.length < 2) throw new Error('Sheet appears empty (needs header + at least 1 product row)')

  const header = rows[0]
  const colMap = detectColumns(header)
  console.log('Header:', JSON.stringify(header))
  console.log('Column map:', JSON.stringify(Object.fromEntries(Object.entries(colMap).map(([k, v]) => [k, header[v]]))))
  if (colMap.name == null || colMap.price == null) {
    throw new Error(`Could not detect required "name"/"price" columns in header: ${header.join(' | ')}`)
  }

  const products = []
  for (const r of rows.slice(1)) {
    const name = (r[colMap.name] || '').trim()
    const price = parsePrice(colMap.price != null ? r[colMap.price] : null)
    if (!name || price == null) continue
    const { unit, rule } = parseUnit(colMap.unit != null ? r[colMap.unit] : null)
    const wastageRaw = colMap.wastage != null ? parsePrice(r[colMap.wastage]) : null
    products.push({
      name,
      sku: colMap.sku != null ? (r[colMap.sku] || '').trim() : '',
      price,
      category: colMap.category != null ? (r[colMap.category] || '').trim() : '',
      subCategory: colMap.subCategory != null ? (r[colMap.subCategory] || '').trim() : null,
      brand: colMap.brand != null ? (r[colMap.brand] || '').trim() : null,
      unit, quantityRule: rule,
      coverage: colMap.coverage != null ? parsePrice(r[colMap.coverage]) : null,
      wastagePercent: wastageRaw != null ? wastageRaw : null,
      link: colMap.link != null ? (r[colMap.link] || '').trim() : '',
      image: colMap.image != null ? (r[colMap.image] || '').trim() : '',
      description: colMap.description != null ? (r[colMap.description] || '').trim() : null,
    })
  }
  if (!products.length) throw new Error('No valid product rows found (each row needs a name and a numeric price)')

  console.log(`\nParsed ${products.length} products:`)
  for (const p of products) {
    console.log(`  • ${p.name} | SKU:${p.sku || '—'} | ₹${p.price} | ${p.category || 'Uncategorised'} | ${p.unit} | link:${p.link ? 'Y' : 'N'}`)
  }
  if (DRY_RUN) { console.log('\n[dry-run] Database untouched. Exiting.'); return }

  /* --- replace materials --- */
  const existing = await db.material.findMany({ select: { id: true, name: true } })
  console.log(`\nExisting materials: ${existing.length} — clearing (quotation item snapshots preserved)…`)
  for (const m of existing) {
    await db.quotationItem.updateMany({ where: { materialId: m.id }, data: { materialId: null } })
  }
  await db.material.deleteMany()

  // categories: use sheet categories, keep known defaults, create as needed
  const catNames = [...new Set(products.map(p => p.category || 'General'))]
  const cats = {}
  for (let i = 0; i < catNames.length; i++) {
    const name = catNames[i]
    const found = await db.materialCategory.findUnique({ where: { name } })
    cats[name] = found ?? (await db.materialCategory.create({ data: { name, sortOrder: i } }))
  }

  /* --- photos --- */
  const photoLog = []
  if (!NO_PHOTOS) {
    console.log(`\nFetching product photos for ${products.length} items…`)
    for (const p of products) {
      const slug = slugify(p.sku || p.name)
      try {
        const url = await resolvePhoto(p)
        if (!url) { photoLog.push([p.name, 'no image found']); continue }
        const imageUrl = await savePhoto(url, slug)
        p.imageUrl = imageUrl
        photoLog.push([p.name, `ok → ${imageUrl}`])
        console.log(`   ✓ ${p.name}: ${url}`)
      } catch (e) {
        photoLog.push([p.name, `FAILED: ${e.message}`])
        console.log(`   ✗ ${p.name}: ${e.message}`)
      }
    }
  }

  /* --- insert --- */
  const sa = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  for (const p of products) {
    const cat = cats[p.category || 'General']
    await db.material.create({
      data: {
        categoryId: cat.id,
        name: p.name,
        subCategory: p.subCategory || p.category || null,
        brand: p.brand || null,
        sku: p.sku || null,
        description: p.description || null,
        price: p.price,
        unit: p.unit,
        coverage: p.coverage ?? (p.quantityRule === 'AREA' ? 1 : 1),
        coverageUnit: p.quantityRule === 'AREA' ? 'sq.ft' : 'piece',
        wastagePercent: p.wastagePercent ?? (p.quantityRule === 'AREA' ? 10 : 0),
        quantityRule: p.quantityRule,
        imageUrl: p.imageUrl || null,
        status: 'ACTIVE',
        createdById: sa?.id ?? null,
      },
    })
  }

  console.log(`\n✅ Done. ${products.length} materials imported into ${catNames.length} categories.`)
  console.log('\nPhoto report:')
  for (const [n, s] of photoLog) console.log(`  ${n}: ${s}`)

  // audit trail
  await db.auditLog.create({
    data: {
      userId: sa?.id ?? null, userName: 'System Import', userRole: 'SUPER_ADMIN',
      action: 'PRODUCT_IMPORT', entity: 'Material',
      details: `Replaced catalog: ${products.length} products imported (${photoLog.filter(x => x[1].startsWith('ok')).length} photos).`,
    },
  }).catch(() => {})
}

if (import.meta.main) {
  main()
    .catch(e => { console.error('\n❌ IMPORT FAILED:', e.message); process.exit(1) })
    .finally(() => db.$disconnect())
}

/* export helpers so they can be unit-tested without running main */
export { extractImageUrl, getPage, resolvePhoto, savePhoto, parseCsv, detectColumns, parsePrice, parseUnit, slugify }
