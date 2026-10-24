import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const BUNDLE_TYPES = ['BASIC', 'PREMIUM', 'LUXURY', 'CUSTOM']

/**
 * GET /api/bundles?status=ACTIVE|ALL
 * Returns all brand bundles with their items and materials.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser()
    const { searchParams } = req.nextUrl
    const statusParam = searchParams.get('status')

    const bundles = await db.brandBundle.findMany({
      where: statusParam === 'ALL' ? {} : { status: 'ACTIVE' },
      include: {
        items: {
          include: {
            material: {
              select: { id: true, name: true, brand: true, sku: true, unit: true, price: true, imageUrl: true, category: { select: { id: true, name: true } } },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ bundles })
  } catch (e) {
    return jsonError(e)
  }
}

interface BundleItemInput {
  materialId: string
  quantity: number
  unit?: string
  rate?: number
  installCost?: number
  sortOrder?: number
  notes?: string
}

interface BundleCreateBody {
  name?: string
  bundleType?: string
  description?: string
  status?: string
  items?: BundleItemInput[]
}

/**
 * POST /api/bundles — SUPER_ADMIN only.
 * Creates a new brand bundle with its items.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin()
    let body: BundleCreateBody
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const name = body.name?.trim()
    if (!name) throw new ApiError(400, 'Bundle name is required')

    const bundleType =
      body.bundleType && BUNDLE_TYPES.includes(body.bundleType) ? body.bundleType : 'CUSTOM'
    const status = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const items: BundleItemInput[] = Array.isArray(body.items) ? body.items : []

    // Validate all materialIds exist
    for (const item of items) {
      if (!item.materialId) throw new ApiError(400, 'Each item must have a materialId')
      const mat = await db.material.findUnique({ where: { id: item.materialId } })
      if (!mat) throw new ApiError(400, `Material ${item.materialId} not found`)
      if (mat.status !== 'ACTIVE') throw new ApiError(400, `Material "${mat.name}" is not active`)
    }

    const bundle = await db.brandBundle.create({
      data: {
        name,
        bundleType,
        description: body.description?.trim() || null,
        status,
        createdById: user.id,
        items: {
          create: items.map((item, i) => ({
            materialId: item.materialId,
            quantity: Number(item.quantity) || 1,
            unit: item.unit?.trim() || 'piece',
            rate: Number(item.rate) || 0,
            installCost: Number(item.installCost) || 0,
            sortOrder: item.sortOrder ?? i,
            notes: item.notes?.trim() || null,
          })),
        },
      },
      include: {
        items: {
          include: {
            material: { select: { id: true, name: true, brand: true, unit: true, price: true, imageUrl: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    await audit(user, 'BUNDLE_CREATE', 'BUNDLE', bundle.id, `Created bundle "${bundle.name}" (${bundle.bundleType})`)
    return NextResponse.json({ bundle }, { status: 201 })
  } catch (e) {
    return jsonError(e)
  }
}
