'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Clock, Info, Loader2, Package, Pencil, RefreshCw } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiPatch, useApi } from '@/lib/client'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types (per /api/packages contract)
// ---------------------------------------------------------------------------

interface PackageItem {
  id: string
  name: string
  pricePerSqft: number
  description: string | null
  duration: string | null
  status: string
}

interface PackageForm {
  name: string
  pricePerSqft: string
  description: string
  duration: string
  active: boolean
}

// ---------------------------------------------------------------------------
// PackagesView
// ---------------------------------------------------------------------------

export default function PackagesView() {
  const { isSuperAdmin } = useAuth()
  const { data, loading, error, refresh } = useApi<{ packages: PackageItem[] }>('/api/packages')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PackageItem | null>(null)
  const [form, setForm] = useState<PackageForm>({
    name: '',
    pricePerSqft: '',
    description: '',
    duration: '',
    active: true,
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // API returns all statuses for everyone; admins only see ACTIVE
  const packages = (data?.packages ?? []).filter((p) => isSuperAdmin || p.status === 'ACTIVE')

  useEffect(() => {
    if (!dialogOpen || !editing) return
    setFormError(null)
    setForm({
      name: editing.name,
      pricePerSqft: String(editing.pricePerSqft ?? ''),
      description: editing.description ?? '',
      duration: editing.duration ?? '',
      active: editing.status === 'ACTIVE',
    })
  }, [dialogOpen, editing])

  function openEdit(p: PackageItem) {
    setEditing(p)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!editing) return
    const name = form.name.trim()
    if (!name) return setFormError('Package name is required.')
    const pricePerSqft = Number(form.pricePerSqft)
    if (!Number.isFinite(pricePerSqft) || pricePerSqft < 0)
      return setFormError('Enter a valid rate per sq.ft.')

    setSaving(true)
    setFormError(null)
    try {
      await apiPatch(`/api/packages/${editing.id}`, {
        name,
        pricePerSqft,
        description: form.description.trim() || null,
        duration: form.duration.trim() || null,
        status: form.active ? 'ACTIVE' : 'INACTIVE',
      })
      toast.success(`Package "${name}" updated. Rate changes are audit-logged.`)
      setDialogOpen(false)
      await refresh()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 md:h-9 md:w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
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
            <p className="font-bold text-foreground">Failed to load packages</p>
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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Packages
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Renovation packages with per sq.ft pricing.
        </p>
      </div>

      {/* Admin notice */}
      {!isSuperAdmin && (
        <Alert className="rounded-2xl border-orange-200 bg-orange-50 text-orange-800">
          <Info className="size-4" />
          <AlertDescription>Only Super Admins can change package rates.</AlertDescription>
        </Alert>
      )}

      {/* Grid */}
      {packages.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-orange-50">
              <Package className="size-6 text-primary" />
            </div>
            <p className="font-bold text-foreground">No packages found</p>
            <p className="text-sm text-muted-foreground">
              Packages define the base rate for every quotation.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((p) => (
            <Card key={p.id} className="flex flex-col gap-0 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-foreground">
                  {p.name}
                </h3>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0',
                    p.status === 'ACTIVE'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-stone-200 bg-stone-100 text-stone-600'
                  )}
                >
                  {p.status}
                </Badge>
              </div>

              <p className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-primary">
                  {formatINR(p.pricePerSqft)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground"> /sq.ft</span>
              </p>

              {p.description ? (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
              ) : (
                <p className="mt-2 text-sm italic text-muted-foreground/70">No description.</p>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-4">
                {p.duration ? (
                  <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                    <Clock className="size-3" />
                    {p.duration}
                  </Badge>
                ) : (
                  <span />
                )}
                {isSuperAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(p)}
                    className="min-h-11 gap-1.5 font-semibold"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Formula note */}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        Package rate × total bathroom area = package cost.
      </p>

      {/* Edit dialog (SA) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
            <DialogDescription>
              Rate changes apply to future quotations only — existing quotes keep their snapshot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pkg-name">Name</Label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-price">Rate per sq.ft (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ₹
                </span>
                <Input
                  id="pkg-price"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.pricePerSqft}
                  onChange={(e) => setForm((f) => ({ ...f, pricePerSqft: e.target.value }))}
                  className="h-11 pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-description">Description</Label>
              <Textarea
                id="pkg-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="What's included in this package"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pkg-duration">Duration</Label>
              <Input
                id="pkg-duration"
                value={form.duration}
                onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                placeholder="e.g. 15–20 days"
                className="h-11"
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive packages cannot be used for new quotations.
                </p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                aria-label="Toggle package status"
              />
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
              onClick={() => void handleSave()}
              disabled={saving}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
