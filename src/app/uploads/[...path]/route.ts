import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
}

/**
 * GET /uploads/[...path]
 * Serves uploaded images from disk or Supabase Storage fallback.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params
    const filename = segments.join('/')

    // Prevent directory traversal attacks
    if (!filename || filename.includes('..') || path.isAbsolute(filename)) {
      return new NextResponse('Bad request', { status: 400 })
    }

    const ext = path.extname(filename).toLowerCase()
    const contentType = MIME_MAP[ext] || 'application/octet-stream'

    // 1. Check local public/uploads directory
    const candidates = [
      path.join(process.cwd(), 'public', 'uploads', filename),
      path.join(process.cwd(), '.next', 'standalone', 'public', 'uploads', filename),
    ]

    for (const candidate of candidates) {
      try {
        const fileBuffer = await fs.readFile(candidate)
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      } catch {
        // Continue to next candidate
      }
    }

    // 2. Fallback to Supabase Storage if file not on disk (e.g. after fresh deploy)
    try {
      const { data, error } = await supabase.storage.from('materials').download(filename)
      if (!error && data) {
        const arrayBuffer = await data.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Cache on local disk for subsequent requests
        try {
          const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
          await fs.mkdir(uploadsDir, { recursive: true })
          await fs.writeFile(path.join(uploadsDir, filename), buffer)
        } catch {
          // Ignore disk cache write errors
        }

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': data.type || contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
    } catch (supabaseErr) {
      console.warn('Supabase storage fallback error:', supabaseErr)
    }

    return new NextResponse('Image not found', { status: 404 })
  } catch (e) {
    console.error('Error serving upload:', e)
    return new NextResponse('Internal error', { status: 500 })
  }
}
