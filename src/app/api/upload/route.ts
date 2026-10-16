import { NextRequest, NextResponse } from 'next/server'
import { promises as fs, existsSync } from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { requireUser, ApiError, jsonError, audit } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const
type AllowedExt = (typeof ALLOWED_EXTENSIONS)[number]

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * POST /api/upload
 * Accepts:
 *   - JSON body: { image: "data:image/(jpeg|jpg|png|webp);base64,..." }
 *   - Multipart form-data: field "file" or "image"
 *
 * Saves to public/uploads/<timestamp>-<rand12hex>.<ext>
 * Backs up to Supabase Storage 'materials' bucket
 * Returns: { url: "/uploads/<filename>" }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser()

    const contentTypeHeader = req.headers.get('content-type') || ''
    let buffer: Buffer
    let ext: string
    let mimeType: string

    if (contentTypeHeader.includes('application/json')) {
      let body: { image?: unknown } = {}
      try {
        body = await req.json()
      } catch {
        throw new ApiError(400, 'Invalid JSON body')
      }

      if (!body.image || typeof body.image !== 'string') {
        throw new ApiError(400, 'Missing or invalid image field in request body')
      }

      const match = body.image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
      if (!match) {
        throw new ApiError(400, 'Invalid image data URL format. Expected base64 data URL.')
      }

      const declaredMime = match[1].toLowerCase()
      ext = MIME_TO_EXT[declaredMime] || declaredMime.replace('image/', '')
      if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExt)) {
        throw new ApiError(400, 'Unsupported image type. Only JPG, PNG, and WebP are allowed.')
      }

      mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      buffer = Buffer.from(match[2], 'base64')
    } else if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = (formData.get('file') || formData.get('image')) as File | null
      if (!file) {
        throw new ApiError(400, 'No file provided in form-data (expected "file" or "image")')
      }

      const declaredMime = file.type.toLowerCase()
      ext = MIME_TO_EXT[declaredMime] || path.extname(file.name).replace('.', '').toLowerCase()
      if (ext === 'jpeg') ext = 'jpg'

      if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExt)) {
        throw new ApiError(400, 'Unsupported image type. Only JPG, PNG, and WebP are allowed.')
      }

      mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    } else {
      throw new ApiError(400, 'Content-Type must be application/json or multipart/form-data')
    }

    if (buffer.length === 0) {
      throw new ApiError(400, 'Uploaded image data is empty')
    }

    // Maximum 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      throw new ApiError(400, 'Image exceeds maximum size limit of 5MB')
    }

    const randSuffix = randomBytes(6).toString('hex')
    const filename = `${Date.now()}-${randSuffix}.${ext}`

    // 1. Write to local public/uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    try {
      await fs.mkdir(uploadsDir, { recursive: true })
      await fs.writeFile(path.join(uploadsDir, filename), buffer)
    } catch (fsErr) {
      console.error('Failed to write to public/uploads:', fsErr)
    }

    // 2. Also write to standalone public/uploads if standalone build folder exists
    const standaloneUploadsDir = path.join(process.cwd(), '.next', 'standalone', 'public', 'uploads')
    try {
      if (existsSync(path.join(process.cwd(), '.next', 'standalone'))) {
        await fs.mkdir(standaloneUploadsDir, { recursive: true })
        await fs.writeFile(path.join(standaloneUploadsDir, filename), buffer)
      }
    } catch {
      // Standalone folder might not exist in dev, ignore
    }

    // 3. Backup to Supabase Storage bucket for persistence across deploys/restarts
    try {
      await supabase.storage.from('materials').upload(filename, buffer, {
        contentType: mimeType,
        upsert: true,
      })
    } catch (storageErr) {
      console.warn('Supabase storage backup failed:', storageErr)
    }

    // 4. Audit log
    await audit(user, 'IMAGE_UPLOAD', 'Upload', filename, `Uploaded image ${filename} (${buffer.length} bytes)`)

    return NextResponse.json({
      url: `/uploads/${filename}`,
    })
  } catch (e) {
    return jsonError(e)
  }
}
