'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ImagePlus,
  Info,
  Layers,
  Loader2,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  X,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import { apiPatch, apiPost, useApi, useDebounced } from '@/lib/client'
import { formatINR, initialsOf } from '@/lib/format'
import { quantityRuleLabels, unitOptions } from '@/lib/status'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types (per /api/materials + /api/material-categories + /api/upload contracts)
// ---------------------------------------------------------------------------

interface Material {
  id: string
  name: string
  subCategory: string | null
  brand: string | null
  sku: string | null
  description: string | null
  price: number
  unit: string
  coverage: number
  coverageUnit: string
  wastagePercent: number
  quantityRule: string
  imageUrl: string | null
  status: string
  category: { id: string; name: string }
  createdAt: string
}

interface MaterialCategory {
  id: string
  name: string
  materialCount: number
}

const NEW_CATEGORY = '__NEW__'

const EMPTY_FORM = {
  name: '',
  categoryId: '',
  newCategoryName: '',
  subCategory: '',
  brand: '',
  sku: '',
  description: '',
  price: '',
  unit: 'piece',
  coverage: '1',
  coverageUnit: 'sq.ft',
  wastagePercent: '0',
  quantityRule: 'PIECE',
  imageUrl: '',
}

type MaterialForm = typeof EMPTY_FORM

/** Client-side resize: max 512px, JPEG q0.82 → base64 data URL. */
function resizeImage(file: File, max = 512, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the image file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Invalid or corrupted image file.'))
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * scale))
          const h = Math.max(1, Math.round(img.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) return reject(new Error('Canvas is not supported in this browser.'))
          ctx.drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Image processing failed.'))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

const fmtNum = (n: number | null | undefined) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

// ---------------------------------------------------------------------------
// Thumbnail with error fallback to initial letter
// ---------------------------------------------------------------------------

function MaterialThumb({ material }: { material: Material }) {
  const [failed, setFailed] = useState(false)
  if (material.imageUrl && !failed) {
    return (
      <img
        src={material.imageUrl}
        alt={material.name}
        onError={() => setFailed(true)}
        className="size-24 shrink-0 rounded-xl bg-muted object-cover"
      />
    )
  }
  return (
    <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl font-extrabold text-muted-foreground">
      {initialsOf(material.name)}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MaterialsView
// ---------------------------------------------------------------------------

export default function MaterialsView() {
  const { isSuperAdmin } = useAuth()
  const { params } = useNav()

  const [search, setSearch] = useState(params.search ?? '')
  const q = useDebounced(search, 350)
  const [category, setCategory] = useState('') // '' = all categories
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'INACTIVE' | 'ALL'>('ACTIVE')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Material | null>(null)
  const [form, setForm] = useState<MaterialForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Super Admin fetches ALL and filters status client-side (API only supports ACTIVE|ALL).
  const sp = new URLSearchParams()
  if (q) sp.set('search', q)
  if (category) sp.set('category', category)
  if (isSuperAdmin) sp.set('status', 'ALL')

  const { data, loading, error, refresh } = useApi<{ materials: Material[] }>(
    `/api/materials?${sp.toString()}`
  )
  const categoriesApi = useApi<{ categories: MaterialCategory[] }>('/api/material-categories')

  const materials = data?.materials ?? []
  const visible =
    isSuperAdmin && statusFilter !== 'ALL'
      ? materials.filter((m) => m.status === statusFilter)
      : materials

  // Prefill form whenever the dialog opens
  useEffect(() => {
    if (!dialogOpen) return
    setFormError(null)
    if (editing) {
      setForm({
        name: editing.name,
        categoryId: editing.category?.id ?? '',
        newCategoryName: '',
        subCategory: editing.subCategory ?? '',
        brand: editing.brand ?? '',
        sku: editing.sku ?? '',
        description: editing.description ?? '',
        price: String(editing.price ?? ''),
        unit: editing.unit || 'piece',
        coverage: String(editing.coverage ?? 1),
        coverageUnit: editing.coverageUnit || 'sq.ft',
        wastagePercent: String(editing.wastagePercent ?? 0),
        quantityRule: editing.quantityRule || 'PIECE',
        imageUrl: editing.imageUrl ?? '',
      })
    } else {
      setForm({ ...EMPTY_FORM })
    }
  }, [dialogOpen, editing])

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(m: Material) {
    setEditing(m)
    setDialogOpen(true)
  }

  function set<K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleImageFile(file: File) {
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      toast.error('Only JPG, PNG or WebP images are allowed.')
      return
    }
    setUploading(true)
    try {
      const dataUrl = await resizeImage(file, 512, 0.82)
      const res = await apiPost<{ url: string }>('/api/upload', { image: dataUrl })
      setForm((f) => ({ ...f, imageUrl: res.url }))
      toast.success('Image uploaded.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    const name = form.name.trim()
    if (!name) return setFormError('Material name is required.')
    if (!form.categoryId) return setFormError('Select a category (or create a new one).')
    if (form.categoryId === NEW_CATEGORY && !form.newCategoryName.trim())
      return setFormError('Enter a name for the new category.')
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0)
      return setFormError('Enter a valid price greater than 0.')
    if (!form.unit) return setFormError('Price unit is required.')
    const coverage = Number(form.coverage)
    if (!Number.isFinite(coverage) || coverage <= 0)
      return setFormError('Coverage area must be greater than 0.')
    const wastage = Math.min(100, Math.max(0, Number(form.wastagePercent) || 0))

    setSaving(true)
    setFormError(null)
    try {
      let categoryId = form.categoryId
      if (categoryId === NEW_CATEGORY) {
        const created = await apiPost<{ category: { id: string } }>('/api/material-categories', {
          name: form.newCategoryName.trim(),
        })
        categoryId = created.category.id
        void categoriesApi.refresh()
      }
      const payload = {
        name,
        categoryId,
        subCategory: form.subCategory.trim() || undefined,
        brand: form.brand.trim() || undefined,
        sku: form.sku.trim() || undefined,
        description: form.description.trim() || undefined,
        price,
        unit: form.unit,
        coverage,
        coverageUnit: form.coverageUnit,
        wastagePercent: wastage,
        quantityRule: form.quantityRule,
        imageUrl: form.imageUrl || undefined,
      }
      if (editing) {
        await apiPatch(`/api/materials/${editing.id}`, payload)
        toast.success(`Material "${name}" updated.`)
      } else {
        await apiPost('/api/materials', payload)
        toast.success(`Material "${name}" created.`)
      }
      setDialogOpen(false)
      await refresh()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleStatus(m: Material) {
    const next = m.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    setTogglingId(m.id)
    try {
      await apiPatch(`/api/materials/${m.id}/status`, { status: next })
      toast.success(
        next === 'ACTIVE' ? `"${m.name}" activated.` : `"${m.name}" deactivated.`
      )
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status.')
    } finally {
      setTogglingId(null)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 md:h-9 md:w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-full md:w-48" />
          {isSuperAdmin && <Skeleton className="h-11 w-full md:w-40" />}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load materials</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => refresh()} className="mt-2 min-h-11 gap-2 font-semibold">
              <RefreshCw className="size-4" />
              Retry
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
            Materials
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Master library of tiles, fixtures and add-ons with pricing &amp; coverage.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={openAdd} className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]">
            <Plus className="size-4" />
            Add Material
          </Button>
        )}
      </div>

      {/* Admin notice */}
      {!isSuperAdmin && (
        <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800">
          <Info className="size-4" />
          <AlertDescription>
            Materials are managed by Super Admins. Contact them for pricing changes.
          </AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search materials..."
            aria-label="Search materials"
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-3">
          <Select value={category || 'all'} onValueChange={(v) => setCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-11 w-full md:w-52" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categoriesApi.data?.categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isSuperAdmin && (
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as 'ACTIVE' | 'INACTIVE' | 'ALL')}
            >
              <SelectTrigger className="h-11 w-full md:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-orange-50">
              <Layers className="size-6 text-primary" />
            </div>
            <p className="font-bold text-foreground">No materials found</p>
            <p className="text-sm text-muted-foreground">
              {q || category
                ? 'Try a different search or category.'
                : 'Add your first material to start building quotations.'}
            </p>
            {isSuperAdmin && (
              <Button onClick={openAdd} className="mt-2 min-h-11 gap-2 font-semibold">
                <Plus className="size-4" />
                Add Material
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <Card key={m.id} className="gap-0 rounded-2xl p-4">
              <div className="flex gap-4">
                <MaterialThumb material={m} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-bold text-foreground" title={m.name}>
                      {m.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        'shrink-0',
                        m.status === 'ACTIVE'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-stone-200 bg-stone-100 text-stone-600'
                      )}
                    >
                      {m.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {m.category?.name && (
                      <Badge variant="outline" className="text-[10px]">
                        {m.category.name}
                      </Badge>
                    )}
                    {m.subCategory && (
                      <span className="truncate text-xs text-muted-foreground">{m.subCategory}</span>
                    )}
                  </div>
                  {(m.brand || m.sku) && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[m.brand, m.sku].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  <p className="mt-2">
                    <span className="text-lg font-extrabold text-primary">{formatINR(m.price)}</span>
                    <span className="text-xs font-medium text-muted-foreground"> / {m.unit}</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 border-t pt-3">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Ruler className="size-3.5 shrink-0" />
                  Coverage: {fmtNum(m.coverage)} {m.coverageUnit}
                </p>
                {(Number(m.wastagePercent) || 0) > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Percent className="size-3.5 shrink-0" />
                    {fmtNum(m.wastagePercent)}% wastage
                  </p>
                )}
                <div>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {quantityRuleLabels[m.quantityRule] ?? m.quantityRule}
                  </Badge>
                </div>
                {m.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground" title={m.description}>
                    {m.description}
                  </p>
                )}
              </div>

              {isSuperAdmin && (
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(m)}
                    className="min-h-11 flex-1 gap-1.5 font-semibold"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {m.status === 'ACTIVE' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={togglingId === m.id}
                      onClick={() => toggleStatus(m)}
                      className="min-h-11 flex-1 gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      {togglingId === m.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <X className="size-3.5" />
                      )}
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={togglingId === m.id}
                      onClick={() => toggleStatus(m)}
                      className="min-h-11 flex-1 gap-1.5 text-green-600 hover:bg-green-50 hover:text-green-700"
                    >
                      {togglingId === m.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                      Activate
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Material' : 'Add Material'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update pricing, coverage or status of this material.'
                : 'Add a new tile, fixture or add-on to the master library.'}
            </DialogDescription>
          </DialogHeader>

          <Alert className="rounded-xl">
            <Info className="size-4" />
            <AlertDescription>Price changes are audit-logged.</AlertDescription>
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mat-name">Name *</Label>
              <Input
                id="mat-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Vitrified Floor Tile 600×600"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-category">Category *</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) => set('categoryId', v)}
              >
                <SelectTrigger id="mat-category" className="h-11">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(categoriesApi.data?.categories ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_CATEGORY}>＋ New category</SelectItem>
                </SelectContent>
              </Select>
              {form.categoryId === NEW_CATEGORY && (
                <Input
                  value={form.newCategoryName}
                  onChange={(e) => set('newCategoryName', e.target.value)}
                  placeholder="New category name"
                  className="h-11"
                  autoFocus
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-subcategory">Sub Category</Label>
              <Input
                id="mat-subcategory"
                value={form.subCategory}
                onChange={(e) => set('subCategory', e.target.value)}
                placeholder="e.g. Wall, Floor"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-brand">Brand</Label>
              <Input
                id="mat-brand"
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                placeholder="e.g. Kajaria"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-sku">Model / SKU</Label>
              <Input
                id="mat-sku"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value)}
                placeholder="e.g. KAJ-VIT-6001"
                className="h-11"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mat-description">Description</Label>
              <Textarea
                id="mat-description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Short description shown on quotations"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-price">Price (₹) *</Label>
              <Input
                id="mat-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
                placeholder="0"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Price Unit *</Label>
              <Select value={form.unit} onValueChange={(v) => set('unit', v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-coverage">Coverage Area *</Label>
              <Input
                id="mat-coverage"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.coverage}
                onChange={(e) => set('coverage', e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Coverage Unit *</Label>
              <Select value={form.coverageUnit} onValueChange={(v) => set('coverageUnit', v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mat-wastage">Wastage %</Label>
              <Input
                id="mat-wastage"
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                value={form.wastagePercent}
                onChange={(e) => set('wastagePercent', e.target.value)}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label>Quantity Rule</Label>
              <Select value={form.quantityRule} onValueChange={(v) => set('quantityRule', v)}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select rule" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(quantityRuleLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mat-image">Product Image</Label>
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  <div className="relative shrink-0">
                    <img
                      src={form.imageUrl}
                      alt="Product preview"
                      className="size-20 rounded-xl border object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={() => set('imageUrl', '')}
                      className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground">
                    <ImagePlus className="size-6" />
                  </div>
                )}
                <div className="min-w-0 space-y-1.5">
                  <Input
                    id="mat-image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void handleImageFile(file)
                    }}
                    disabled={uploading}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG or WebP — auto-resized to max 512px before upload.
                  </p>
                </div>
              </div>
              {uploading && (
                <p className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="size-3.5 animate-spin" />
                  Uploading image…
                </p>
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
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="min-h-11"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={saving || uploading}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? 'Save Changes' : 'Create Material'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
