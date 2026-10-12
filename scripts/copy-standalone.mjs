// Copies static assets into the standalone build output (Next.js does not do this itself).
// Cross-platform replacement for: cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
import { cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, '.next')
const standaloneDir = join(buildDir, 'standalone')

if (!existsSync(standaloneDir)) {
  console.error('❌ .next/standalone not found — run `next build` first.')
  process.exit(1)
}

cpSync(join(buildDir, 'static'), join(standaloneDir, '.next', 'static'), { recursive: true })

if (existsSync(join(root, 'public'))) {
  cpSync(join(root, 'public'), join(standaloneDir, 'public'), { recursive: true })
}

console.log('✅ Copied .next/static and public/ into .next/standalone')