import sharp from 'sharp'
import { readdirSync } from 'fs'
import { join } from 'path'
const dirs = ['public/materials', 'public/brand']
for (const dir of dirs) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.png')) continue
    const p = join(dir, f)
    const buf = await sharp(p).resize(512, 512, { fit: 'cover' }).png({ compressionLevel: 9, palette: true, quality: 80 }).toBuffer()
    await sharp(buf).toFile(p + '.tmp').then(() => null)
    const { renameSync } = await import('fs')
    renameSync(p + '.tmp', p)
    console.log(f, Math.round(buf.length / 1024) + 'KB')
  }
}
