'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Boxes,
  Check,
  Edit2,
  Info,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiDelete, apiPatch, apiPost, useApi } from '@/lib/client'
import { formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface BundleItem {
  id?: string
  materialId: string
  quantity: number
  unit: string
  rate: number
  installCost: number
  sortOrder?: number
  notes?: string | null
  material?: {
    id: string
    name: string
    brand: string | null
    unit: string
    price: number
    imageUrl: string | null
    category?: { id: string; name: string }
  }
}

interface BrandBundle {
  id: string
  name: string
  bundleType: 'BASIC' | 'PREMIUM' | 'LUXURY' | 'CUSTOM'
  description: string | null
  status: 'ACTIVE' | 'INACTIVE'
  items: BundleItem[]
  createdBy?: { id: string; name: string } | null
}

interface MaterialOption {
  id: string
  name: string
  brand: string | null
  price: number
  unit: string
  category: { id: string; name: string }
}

const BUNDLE_TYPES = [
  { value: 'BASIC', label: 'Basic Bundle', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  { value: 'PREMIUM', label: 'Premium Bundle', color: 'border-purple-200 bg-purple-50 text-purple-700' },
  { value: 'LUXURY', label: 'Luxury Bundle', color: 'border-amber-200 bg-amber-50 text-amber-700' },
  { value: 'CUSTOM', label: 'Custom Bundle', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
]

export default function BundlesView() {
  const { isSuperAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')

  const { data, loading, error, refresh } = useApi<{ bundles: BrandBundle[] }>(
    `/api/bundles?status=ALL`
  )
  const { data: materialsData } = useApi<{ materials: MaterialOption[] }>(
    '/api/materials?status=ACTIVE'
  )

  const materials = materialsData?.materials ?? []
  const bundles = data?.bundles ?? []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingBundle, setEditingBundle] = useState<BrandBundle | null>(null)
  const [name, setName] = useState('')
  const [bundleType, setBundleType] = useState('BASIC')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<
    Array<{ materialId: string; quantity: number; unit: string; rate: number; installCost: number }>
  >([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function openCreate() {
    setEditingBundle(null)
    setName('')
    setBundleType('BASIC')
    setDescription('')
    setItems([])
    setFormError(null)
    setDialogOpen(true)
  }

  function openEdit(b: BrandBundle) {
    setEditingBundle(b)
    setName(b.name)
    setBundleType(b.bundleType)
    setDescription(b.description ?? '')
    setItems(
      b.items.map((i) => ({
        materialId: i.materialId,
        quantity: i.quantity,
        unit: i.unit,
        rate: i.rate,
        installCost: i.installCost,
      }))
    )
    setFormError(null)
    setDialogOpen(true)
  }

  function addItem(materialId: string) {
    const mat = materials.find((m) => m.id === materialId)
    if (!mat) return
    setItems((prev) => [
      ...prev,
      {
        materialId: mat.id,
        quantity: 1,
        unit: mat.unit,
        rate: mat.price,
        installCost: 0,
      },
    ])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function updateItem(index: number, updates: Partial<(typeof items)[0]>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }

  async function handleSave() {
    if (!name.trim()) {
      setFormError('Bundle name is required.')
      return
    }
    if (items.length === 0) {
      setFormError('Please add at least one material to the bundle.')
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        name: name.trim(),
        bundleType,
        description: description.trim() || undefined,
        items,
      }

      if (editingBundle) {
        await apiPatch(`/api/bundles/${editingBundle.id}`, payload)
        toast.success('Bundle updated successfully.')
      } else {
        await apiPost('/api/bundles', payload)
        toast.success('Brand bundle created.')
      }
      setDialogOpen(false)
      void refresh()
    } catch (e: any) {
      setFormError(e.message || 'Failed to save bundle.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(b: BrandBundle) {
    try {
      const nextStatus = b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
      await apiPatch(`/api/bundles/${b.id}`, { status: nextStatus })
      toast.success(`Bundle marked as ${nextStatus}.`)
      void refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update bundle status.')
    }
  }

  async function deleteBundle(b: BrandBundle) {
    if (!confirm(`Are you sure you want to delete bundle "${b.name}"?`)) return
    try {
      await apiDelete(`/api/bundles/${b.id}`)
      toast.success('Bundle deleted.')
      void refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete bundle.')
    }
  }

  const filteredBundles = bundles.filter((b) => {
    if (typeFilter !== 'ALL' && b.bundleType !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        b.name.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)) ||
        b.items.some((i) => i.material?.name.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Brand Bundles
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated brand fixture & tile bundles (Basic, Premium, Luxury) for 1-click quotation builder.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={openCreate} className="min-h-11 gap-2 bg-primary font-semibold text-white">
            <Plus className="size-4" />
            Create Bundle
          </Button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bundles or included materials..."
            className="h-11 pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-11 w-full sm:w-48">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All bundle types</SelectItem>
            <SelectItem value="BASIC">Basic</SelectItem>
            <SelectItem value="PREMIUM">Premium</SelectItem>
            <SelectItem value="LUXURY">Luxury</SelectItem>
            <SelectItem value="CUSTOM">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bundles Grid */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : filteredBundles.length === 0 ? (
        <Card className="rounded-2xl p-12 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-orange-50 text-primary">
            <Boxes className="size-6" />
          </div>
          <h3 className="mt-3 font-bold text-foreground">No Brand Bundles found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Create pre-configured packages of sanitaryware, tiles, and fittings for instant selection in quotations.
          </p>
          {isSuperAdmin && (
            <Button onClick={openCreate} className="mt-4 gap-2">
              <Plus className="size-4" />
              Create First Bundle
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredBundles.map((bundle) => {
            const typeConfig =
              BUNDLE_TYPES.find((t) => t.value === bundle.bundleType) ?? BUNDLE_TYPES[0]
            const totalMaterialPrice = bundle.items.reduce(
              (sum, item) => sum + (item.rate || (item.material?.price ?? 0)) * item.quantity,
              0
            )
            const totalInstallCost = bundle.items.reduce(
              (sum, item) => sum + (item.installCost || 0) * item.quantity,
              0
            )

            return (
              <Card key={bundle.id} className="flex flex-col justify-between rounded-2xl p-5 shadow-sm">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-bold text-foreground">{bundle.name}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-xs font-semibold', typeConfig.color)}>
                          {typeConfig.label}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs',
                            bundle.status === 'ACTIVE'
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-stone-200 bg-stone-100 text-stone-600'
                          )}
                        >
                          {bundle.status}
                        </Badge>
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(bundle)}
                          className="size-8 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteBundle(bundle)}
                          className="size-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {bundle.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {bundle.description}
                    </p>
                  )}

                  {/* Included items summary */}
                  <div className="mt-4 space-y-2 border-t pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Included Items ({bundle.items.length})
                    </p>
                    <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                      {bundle.items.map((item, idx) => (
                        <div
                          key={item.id ?? idx}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0 flex-1 truncate">
                            <span className="font-semibold text-foreground">
                              {item.material?.name ?? 'Material'}
                            </span>
                            {item.material?.brand && (
                              <span className="ml-1 text-muted-foreground">({item.material.brand})</span>
                            )}
                          </div>
                          <span className="shrink-0 text-muted-foreground">
                            {item.quantity} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Price footer */}
                <div className="mt-4 border-t pt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Est. Material Value</span>
                    <span className="font-semibold text-foreground">
                      {formatINR(totalMaterialPrice)}
                    </span>
                  </div>
                  {totalInstallCost > 0 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Est. Installation</span>
                      <span className="font-semibold text-foreground">
                        {formatINR(totalInstallCost)}
                      </span>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between text-sm font-extrabold text-primary">
                    <span>Total Bundle Est.</span>
                    <span>{formatINR(totalMaterialPrice + totalInstallCost)}</span>
                  </div>

                  {isSuperAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleStatus(bundle)}
                      className="mt-3 w-full text-xs font-semibold"
                    >
                      {bundle.status === 'ACTIVE' ? 'Set as Inactive' : 'Activate Bundle'}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingBundle ? 'Edit Brand Bundle' : 'Create Brand Bundle'}</DialogTitle>
            <DialogDescription>
              Configure pre-selected fixtures, fittings, and tiles under a branded package tier.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="b-name">Bundle Name *</Label>
                <Input
                  id="b-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Kohler Luxury Suite"
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-type">Bundle Tier *</Label>
                <Select value={bundleType} onValueChange={setBundleType}>
                  <SelectTrigger id="b-type" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">Basic</SelectItem>
                    <SelectItem value="PREMIUM">Premium</SelectItem>
                    <SelectItem value="LUXURY">Luxury</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-desc">Description</Label>
              <Textarea
                id="b-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details of what this bundle provides..."
                rows={2}
              />
            </div>

            {/* Item selector */}
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-sm font-bold">Included Materials & Fixtures</Label>
                <Select onValueChange={addItem}>
                  <SelectTrigger className="h-9 w-full sm:w-64 text-xs">
                    <SelectValue placeholder="＋ Add a material from catalogue" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        {m.name} {m.brand ? `(${m.brand})` : ''} — {formatINR(m.price)} / {m.unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                  No materials added to this bundle yet. Pick products from the selector above.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const mat = materials.find((m) => m.id === item.materialId)
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 items-center gap-2 rounded-lg bg-muted/30 p-2.5 text-xs"
                      >
                        <div className="col-span-5 min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {mat?.name ?? 'Product'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {mat?.brand ?? 'Brand'} · {formatINR(item.rate)} / {item.unit}
                          </p>
                        </div>
                        <div className="col-span-3">
                          <Label className="text-[10px] text-muted-foreground">Qty ({item.unit})</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-3">
                          <Label className="text-[10px] text-muted-foreground">Rate Override (₹)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.rate}
                            onChange={(e) => updateItem(idx, { rate: Number(e.target.value) || 0 })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            className="size-7 text-muted-foreground hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {formError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-2 bg-primary font-semibold text-white"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingBundle ? 'Save Changes' : 'Create Bundle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
