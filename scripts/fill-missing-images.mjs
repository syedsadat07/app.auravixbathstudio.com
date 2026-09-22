#!/usr/bin/env bun
/** Fill in missing product photos (serial image-search to avoid CLI throttling) */
import { PrismaClient } from '@prisma/client'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { savePhoto } from './import-products.mjs'

const run = promisify(execFile)
const db = new PrismaClient()

// bespoke, descriptive queries — exact SKUs rarely have image hits; generic terms match better
const QUERIES = {
  'JDS-WHT-25907_N': 'Jaquar Solo washbasin counter top basin ceramic white bathroom',
  'KUP-CHR-35005BPM': 'Jaquar single lever basin mixer tall boy chrome faucet',
  'AQT-CHR-3057': 'Jaquar angle valve with flange chrome wall mounted',
  'KUS-WHT-35953BIUFSMPM': 'Jaquar rimless wall hung EWC toilet white blind installation',
  'JCS-WHT-2400FS': 'Jaquar concealed cistern with frame floor mount slim',
  'JCP-CHR-352415': 'Jaquar Kubix concealed cistern flush plate chrome square',
  'ART-48516': 'Viking India stainless steel floor drain cockroach trap square jali',
  'CNS-WHT-963UFSM': 'Jaquar rimless wall hung WC toilet white ceramic',
  'SPJ-CHR-87429': 'Jaquar arc bathtub spout chrome wall mounted',
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function imageSearch(query, count = 4) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const { stdout } = await run('z-ai', ['image-search', '-q', query, '--count', String(count), '--gl', 'us', '--no-rank'],
        { timeout: 150000, maxBuffer: 20 * 1024 * 1024 })
      const start = stdout.indexOf('{')
      if (start === -1) return []
      const j = JSON.parse(stdout.slice(start))
      return j.success ? (j.results || []).map(r => r.original_url).filter(Boolean) : []
    } catch (e) {
      const m = String(e.message)
      if (/429/.test(m) && attempt < 4) {
        console.log(`   429 rate-limited, waiting 75s (attempt ${attempt}/4)…`)
        await sleep(75000)
        continue
      }
      console.log('   search error:', m.slice(0, 100))
      return []
    }
  }
  return []
}

async function main() {
  const missing = await db.material.findMany({ where: { imageUrl: null } })
  console.log(`Materials without photo: ${missing.length}`)
  for (const m of missing) {
    const skuKey = (m.sku || '').replace(/\s+/g, '')
    const q = QUERIES[skuKey] || [m.brand, m.name.replace(/\s*[–-]\s*/g, ' ').replace(/\(.*?\)/g, ''), 'bathroom product']
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    console.log(`\n• ${m.sku || m.name} → "${q}"`)
    const hits = await imageSearch(q)
    let done = false
    for (const h of hits) {
      try {
        const imageUrl = await savePhoto(h, (m.sku || m.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 55) || `m-${m.id.slice(-4)}`)
        await db.material.update({ where: { id: m.id }, data: { imageUrl } })
        console.log(`   ✓ ${imageUrl}`)
        done = true
        break
      } catch (e) { console.log('   hit failed:', e.message) }
    }
    if (!done) console.log('   ✗ still no image')
    await sleep(20000)   // stay well under the rate limit
  }
  const left = await db.material.count({ where: { imageUrl: null } })
  console.log(`\nDone. ${left} materials still without photo.`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
