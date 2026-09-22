#!/usr/bin/env bun
/**
 * AURAVIX BATH STUDIO — Import real product catalog from the company Google Sheet
 * (bespoke importer for sheet 1AYv06R4xEslcgJ-A9eqrAKR4Q15YJC4AigS5MaWdf4A)
 *
 * Sheet structure:
 *   Block 1 — standard kit list (cols: 3=Product Name, 4=Price, 5=Code, 6=Link) + "Total" row
 *   Block 2 — variant catalog (first row of each group carries the group name,
 *             following rows inherit it) e.g. Commode ×5, Wash Basin ×5, …
 *
 * Photo resolution chain per product:
 *   1. direct image URL (vikingindia .jpg)          → download
 *   2. reachable product page (vikingindia)         → og:image extraction
 *   3. share.google short link                      → resolve imgurl= (Google Image share) → direct image
 *   4. bot-protected pages (jaquar 403)             → z-ai image-search "brand + slug words + SKU"
 *
 * Usage:
 *   bun scripts/import-auravix-sheet.mjs --dry-run   # parse + plan only, no DB writes, no photos
 *   bun scripts/import-auravix-sheet.mjs             # full replace + photos
 */
import { PrismaClient } from '@prisma/client'
import { parseCsv, extractImageUrl, getPage, savePhoto } from './import-products.mjs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const run = promisify(execFile)
const db = new PrismaClient()
const DRY_RUN = process.argv.includes('--dry-run')

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1AYv06R4xEslcgJ-A9eqrAKR4Q15YJC4AigS5MaWdf4A/gviz/tq?tqx=out:csv&gid=0'

/* ---------- helpers ---------- */

function parsePrice(v) {
  const m = String(v || '').replace(/[₹$,\s]|rs\.?|inr/gi, '').match(/\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}

const FIXMAP = {
  rimlessblind: 'Rimless Blind', installationwallhungwc: 'Installation Wall Hung WC',
  washbasin: 'Wash Basin', singleflow: 'Single Flow', countertop: 'Counter Top',
  thinrim: 'Thin Rim', curvedsquare: 'Curved Square', healthfaucet: 'Health Faucet',
  backflowpreventer: 'Backflow Preventer', bathtub: 'Bath Tub',
}

function slugWords(url) {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean).filter(s => !/^(en|product|products|p|mp|dp)$/i.test(s))
    const slug = segs.sort((a, b) => b.length - a.length)[0] || ''
    if (!/^[a-z0-9-]+$/i.test(slug) || slug.length < 4) return ''
    return slug.split('-')
      .map(w => FIXMAP[w] || w)
      .map(w => (/^(wc|ss|led|ewc|cp)$/i.test(w) ? w.toUpperCase() : (/^\d+(mm|cm|ltr)?$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))))
      .filter(w => !/^copy$/i.test(w))
      .join(' ')
  } catch { return '' }
}

function mapCategory(n) {
  const s = n.toLowerCase()
  if (/basin mixer|diverter|mixer|spout|health faucet|angle valve|angle cock/.test(s)) return 'Faucets & Mixers'
  if (/commode|ewc|cistern|flush plate/.test(s)) return 'Sanitaryware'
  if (/basin/.test(s)) return 'Wash Basin'
  if (/shower|hose/.test(s)) return 'Shower System'
  if (/coupling|trap|connection pipe|drain/.test(s)) return 'Waste & Drainage'
  return 'Accessories'
}

function brandFromLink(link) {
  if (/jaquar\./i.test(link)) return 'Jaquar'
  if (/vikingindia\./i.test(link)) return 'Viking'
  const m = String(link).match(/moglix\.com\/([a-z0-9-]+)/i)
  if (m) { const w = m[1].split('-')[0]; return w.charAt(0).toUpperCase() + w.slice(1) } // "plantex-304-…" → Plantex
  return null
}

function truncateWords(s, max) {
  if (!s) return s
  if (s.length <= max) return s
  const words = s.slice(0, max).split(' ')
  words.pop()
  return words.join(' ').replace(/\s+(with|of|for|and|in|to|a)$/i, '')
}

function stripPrefix(title, sub) {
  const t = (title || '').trim()
  const low = t.toLowerCase()
  const variants = [sub.toLowerCase(), 'wash ' + sub.toLowerCase(), 'wall ' + sub.toLowerCase()]
  for (const v of variants) {
    if (low.startsWith(v)) {
      const rest = t.slice(v.length).trim()
      if (rest.length >= 3) return rest
    }
  }
  return t
}

// names generic enough to be enriched with the product-page slug title
const GENERIC = ['basin', 'ewc', 'spout', 'flush plate', 'shower head', 'shower arm', 'hand shower',
  'health faucet', 'full frame cistern', 'bottle trap', 'floor drain cover', 'shower hook']

// keyword used to verify the slug title actually describes this product
const KEYWORD = { ewc: 'wc' }

async function curlPage(url, timeoutMs = 25) {
  try {
    const { stdout } = await run('curl', ['-sL', '--max-time', String(timeoutMs),
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      '-w', '\nURL_EFFECTIVE:%{url_effective}', url], { timeout: timeoutMs * 1000 + 5000, maxBuffer: 20 * 1024 * 1024 })
    return stdout
  } catch { return '' }
}

async function resolveShareGoogle(link) {
  // share.google/<id> redirects to google.com/imgres?imgurl=<direct image>&imgrefurl=<product page>
  const html = await curlPage(link)
  const effective = html.match(/URL_EFFECTIVE:(\S+)/)?.[1] || ''
  const pick = (src) => {
    const m = src.match(/[?&]imgurl=([^&"']+)/)
    const r = src.match(/[?&]imgrefurl=([^&"']+)/)
    return { directImage: m ? decodeURIComponent(m[1]) : null, refUrl: r ? decodeURIComponent(r[1]) : null }
  }
  let r = pick(effective)
  if (!r.directImage) r = pick(html)
  if (!r.directImage) {
    const og = html.match(/["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)[^"']*)["']/i)
    if (og) r.directImage = og[1]
  }
  return r
}

async function parseSheet() {
  const res = await fetch(SHEET_CSV, { redirect: 'follow' })
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new Error('Sheet not public anymore (HTML returned)')
  const rows = parseCsv(text)

  const products = []
  let group = null
  const conflicts = []
  const shareCache = new Map()

  for (const raw of rows) {
    const c = raw.map(s => (s ?? '').trim())
    const name = c[3] || ''
    const priceRaw = c[4] || ''
    const code = (c[5] || '').replace(/\s+/g, ' ')
    const link = c[6] || ''
    if (!name && !priceRaw && !code && !link) continue
    if (!priceRaw && /^product(\s*name)?$/i.test(name)) continue            // section headers
    if (/^product code$/i.test(code)) continue
    if (/^total$/i.test(name)) continue                                     // kit total row

    let inherited = false
    let baseName = name
    if (!baseName) { baseName = group; inherited = true } else { group = baseName }
    if (!baseName) continue

    const price = parsePrice(priceRaw)
    const skuNorm = code.replace(/[\s_]/g, '').toUpperCase()
    if (skuNorm && products.some(p => p.skuNorm === skuNorm)) {
      conflicts.push(`${baseName} ${code} (dup of earlier "${products.find(p => p.skuNorm === skuNorm).name}") — skipped`)
      continue
    }

    const p = {
      name: baseName, inherited,
      subCategory: baseName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(),
      sku: code || null, skuNorm,
      price: price ?? 0, priceMissing: price == null,
      link, slugTitle: '', directImage: null,
      quantityHint: /\((\d+)\s*qty\)/i.exec(baseName)?.[1] || null,
    }

    if (/share\.google\//.test(link)) {
      if (!shareCache.has(link)) shareCache.set(link, await resolveShareGoogle(link))
      const r = shareCache.get(link)
      p.directImage = r.directImage
      if (r.refUrl) {
        p.slugTitle = slugWords(r.refUrl)
        p.brand = brandFromLink(r.refUrl)
        p.description = `Source: ${link} → ${r.refUrl}`
      }
    } else if (!/\.jpe?g|\.png|\.webp/i.test(link)) {
      p.slugTitle = slugWords(link)
    }
    if (!p.brand) p.brand = brandFromLink(link)

    products.push(p)
  }

  // name enrichment
  for (const p of products) {
    p.category = mapCategory(p.name)
    const generic = GENERIC.includes(p.subCategory.toLowerCase())
    const keyWord = KEYWORD[p.subCategory.toLowerCase()] || p.subCategory.toLowerCase().split(' ')[0]
    if (p.inherited) {
      const budget = Math.max(12, 64 - p.subCategory.length - 3)
      const t = truncateWords(stripPrefix(p.slugTitle, p.subCategory), budget)
      p.name = (t || p.sku) ? `${p.subCategory} – ${t || p.sku}` : p.subCategory
    } else if (generic && p.slugTitle && p.slugTitle.toLowerCase().includes(keyWord)) {
      const budget = Math.max(12, 64 - p.subCategory.length - 3)
      const t = truncateWords(stripPrefix(p.slugTitle, p.subCategory), budget)
      if (t && t.length >= 3) p.name = `${p.subCategory} – ${t}${p.quantityHint ? ` (${p.quantityHint} qty)` : ''}`
    }
    if (!p.description) p.description = `Source: ${p.link || 'company sheet'}`
  }

  // disambiguate identical names
  const byName = new Map()
  for (const p of products) {
    const k = p.name.toLowerCase()
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(p)
  }
  for (const list of byName.values()) {
    if (list.length < 2) continue
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1].skuNorm || '', b = list[i].skuNorm || ''
      let diff = ''
      if (a && b) {
        const as = a.split('-'), bs = b.split('-')
        for (let j = 0; j < Math.max(as.length, bs.length); j++) {
          if (as[j] !== bs[j]) { diff = bs[j] || as[j]; break }
        }
      }
      list[i].name += diff ? ` (${diff})` : ` – ${i + 1}`
    }
  }
  return { products, conflicts }
}

/* ---------- phase B: photos ---------- */

async function imageSearch(query, count = 3) {
  try {
    const { stdout } = await run('z-ai', ['image-search', '-q', query, '--count', String(count), '--gl', 'us', '--no-rank'], { timeout: 150000, maxBuffer: 20 * 1024 * 1024 })
    const start = stdout.indexOf('{')
    if (start === -1) return []
    const j = JSON.parse(stdout.slice(start))
    if (j.success && Array.isArray(j.results)) return j.results.map(r => r.original_url).filter(Boolean)
    return []
  } catch (e) {
    console.log(`      search failed: ${String(e.message).slice(0, 80)}`)
    return []
  }
}

function slugOf(p, i) {
  return (p.skuNorm || p.subCategory).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || `item-${i}`
}

async function fetchPhotos(products) {
  const cache = new Map()   // link → imageUrl
  let ok = 0, fail = 0

  // pass 1 — direct images & reachable product pages (serial, fast)
  const pending = []
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (p.link && cache.has(p.link)) { p.imageUrl = cache.get(p.link); ok++; console.log(`   [${i + 1}/${products.length}] ${p.sku || p.name} → cached`); continue }
    let url = p.directImage || (/\.(jpe?g|png|webp)(\?|$)/i.test(p.link || '') ? p.link : null)
    if (!url && p.link && !/jaquar\./i.test(p.link) && !/share\.google/.test(p.link)) {
      try { url = extractImageUrl(await getPage(p.link)) } catch {}
    }
    if (url) {
      try {
        p.imageUrl = await savePhoto(url, slugOf(p, i))
        cache.set(p.link, p.imageUrl); ok++
        console.log(`   [${i + 1}/${products.length}] ${p.sku || p.name} → ${p.imageUrl}`)
      } catch (e) { fail++; console.log(`   [${i + 1}/${products.length}] ${p.sku || p.name} ✗ ${e.message}`) }
    } else pending.push(p)
  }

  // pass 2 — image-search fallback with 4 workers
  console.log(`   … ${pending.length} items need image search`)
  let idx = 0
  async function worker() {
    while (idx < pending.length) {
      const p = pending[idx++]
      if (p.link && cache.has(p.link)) { p.imageUrl = cache.get(p.link); ok++; continue }
      const q = [p.brand || '', p.slugTitle || p.subCategory, p.sku, 'bathroom fitting product'].filter(Boolean).join(' ')
      const hits = await imageSearch(q, 3)
      let done = false
      for (const h of hits) {
        try { p.imageUrl = await savePhoto(h, slugOf(p, idx)); done = true; break } catch {}
      }
      if (done) { cache.set(p.link, p.imageUrl); ok++; console.log(`   ✓ ${p.sku || p.name} → ${p.imageUrl}`) }
      else { fail++; p.imageUrl = null; console.log(`   ✗ ${p.sku || p.name} — no image`) }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return { ok, fail }
}

/* ---------- phase C: database ---------- */

const CAT_ORDER = ['Sanitaryware', 'Wash Basin', 'Faucets & Mixers', 'Shower System', 'Waste & Drainage', 'Accessories']

async function writeDb(products) {
  const existing = await db.material.findMany({ select: { id: true } })
  console.log(`\nRemoving ${existing.length} old materials (historic quotation items keep their snapshots)…`)
  for (const m of existing) {
    await db.quotationItem.updateMany({ where: { materialId: m.id }, data: { materialId: null } })
  }
  await db.material.deleteMany()

  const cats = {}
  for (let i = 0; i < CAT_ORDER.length; i++) {
    const name = CAT_ORDER[i]
    const found = await db.materialCategory.findUnique({ where: { name } })
    cats[name] = found
      ? (await db.materialCategory.update({ where: { id: found.id }, data: { sortOrder: i } }))
      : (await db.materialCategory.create({ data: { name, sortOrder: i } }))
  }

  const sa = await db.user.findFirst({ where: { role: 'SUPER_ADMIN' } })
  for (const p of products) {
    await db.material.create({
      data: {
        categoryId: cats[p.category].id,
        name: p.name,
        subCategory: p.subCategory,
        brand: p.brand,
        sku: p.sku,
        description: p.description,
        price: p.price,
        unit: 'piece',
        coverage: 1,
        coverageUnit: 'piece',
        wastagePercent: 0,
        quantityRule: 'PIECE',
        imageUrl: p.imageUrl || null,
        status: 'ACTIVE',
        createdById: sa?.id ?? null,
      },
    })
  }

  // drop now-empty legacy categories
  const allCats = await db.materialCategory.findMany({ include: { _count: { select: { materials: true } } } })
  for (const c of allCats) {
    if (c._count.materials === 0) await db.materialCategory.delete({ where: { id: c.id } })
  }

  await db.auditLog.create({
    data: {
      userId: sa?.id ?? null, userName: 'System Import', userRole: 'SUPER_ADMIN',
      action: 'PRODUCT_IMPORT', entity: 'Material',
      details: `Replaced catalog from company Google Sheet: ${products.length} products across ${CAT_ORDER.length} categories.`,
    },
  }).catch(() => {})
}

/* ---------- main ---------- */

async function main() {
  console.log('Fetching company product sheet…')
  const { products, conflicts } = await parseSheet()

  const byCat = {}
  for (const p of products) (byCat[p.category] ||= []).push(p)
  console.log(`\nParsed ${products.length} unique products:`)
  for (const cat of Object.keys(byCat)) {
    console.log(`\n  ▍${cat} (${byCat[cat].length})`)
    for (const p of byCat[cat]) {
      console.log(`    • ${p.name} | ${p.sku || '—'} | ₹${p.price}${p.priceMissing ? ' (MISSING IN SHEET)' : ''} | ${p.brand || ''} | photo:${p.directImage || /\.(jpe?g|png|webp)(\?|$)/i.test(p.link) ? 'direct' : p.slugTitle ? 'page' : 'search'}`)
    }
  }
  if (conflicts.length) {
    console.log(`\nDeduped ${conflicts.length} duplicate SKU rows:`)
    for (const c of conflicts) console.log('  ⚠ ' + c)
  }
  const missing = products.filter(p => p.priceMissing)
  if (missing.length) {
    console.log('\nRows without a price (imported with ₹0 — set price in Materials admin):')
    for (const p of missing) console.log(`  ⚠ ${p.name} (${p.sku || 'no code'})`)
  }

  if (DRY_RUN) { console.log('\n[dry-run] Nothing written. Re-run without --dry-run to import.'); return }
  if (products.length < 30) throw new Error(`Only ${products.length} products parsed — sheet layout changed? Aborting for safety.`)

  console.log(`\nResolving product photos (${products.length} items)…`)
  const stats = await fetchPhotos(products)

  await writeDb(products)
  console.log(`\n✅ Import complete: ${products.length} materials, photos ok=${stats.ok} failed=${stats.fail}.`)
  const counts = await db.materialCategory.findMany({ include: { _count: { select: { materials: true } } }, orderBy: { sortOrder: 'asc' } })
  console.log(counts.map(c => `${c.name}: ${c._count.materials}`).join(' | '))
}

if (import.meta.main) {
  main()
    .catch(e => { console.error('\n❌ IMPORT FAILED:', e.message); process.exit(1) })
    .finally(() => db.$disconnect())
}
