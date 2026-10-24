import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireSuperAdmin, audit, ApiError, jsonError } from '@/lib/auth'
import { db } from '@/lib/db'

const BUNDLE_TYPES = ['BASIC', 'PREMIUM', 'LUXURY', 'CUSTOM']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser()
    const { id } = await params
    const bundle = await db.brandBundle.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            material: {
              select: {
                id: true,
                name: true,
                brand: true,
                sku: true,
                unit: true,
                price: true,
                imageUrl: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        createdBy: { select: { id: true, name: true } },
      },
    })
    if (!bundle) throw new ApiError(404, 'Bundle not found')
    return NextResponse.json({ bundle })
  } catch (e) {
    return jsonError(e)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    const { id } = await params
    const bundle = await db.brandBundle.findUnique({ where: { id } })
    if (!bundle) throw new ApiError(404, 'Bundle not found')

    let body: any
    try {
      body = await req.json()
    } catch {
      throw new ApiError(400, 'Invalid JSON body')
    }

    const data: any = {}
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.description !== 'undefined') data.description = body.description?.trim() || null
    if (typeof body.bundleType === 'string' && BUNDLE_TYPES.includes(body.bundleType)) {
      data.bundleType = body.bundleType
    }
    if (typeof body.status === 'string' && ['ACTIVE', 'INACTIVE'].includes(body.status)) {
      data.status = body.status
    }

    // If updating items
    if (Array.isArray(body.items)) {
      // Delete existing and recreate
      await db.brandBundleItem.deleteMany({ where: { bundleId: id } })
      data.items = {
        create: body.items.map((item: any, i: number) => ({
          materialId: item.materialId,
          quantity: Number(item.quantity) || 1,
          unit: item.unit?.trim() || 'piece',
          rate: Number(item.rate) || 0,
          installCost: Number(item.installCost) || 0,
          sortOrder: item.sortOrder ?? i,
          notes: item.notes?.trim() || null,
        })),
      }
    }

    const updated = await db.brandBundle.update({
      where: { id },
      data,
      include: {
        items: {
          include: {
            material: { select: { id: true, name: true, brand: true, unit: true, price: true, imageUrl: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    await audit(user, 'BUNDLE_UPDATE', 'BUNDLE', bundle.id, `Updated bundle "${updated.name}"`)
    return NextResponse.json({ bundle: updated })
  } catch (e) {
    return jsonError(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireSuperAdmin()
    const { id } = await params
    const bundle = await db.brandBundle.findUnique({ where: { id } })
    if (!bundle) throw new ApiError(404, 'Bundle not found')

    await db.brandBundleItem.deleteMany({ where: { bundleId: id } })
    await db.brandBundle.delete({ where: { id } })

    await audit(user, 'BUNDLE_DELETE', 'BUNDLE', bundle.id, `Deleted bundle "${bundle.name}"`)
    return NextResponse.json({ success: true })
  } catch (e) {
    return jsonError(e)
  }
}
