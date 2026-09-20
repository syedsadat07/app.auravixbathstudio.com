'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Building2,
  CircleDollarSign,
  Loader2,
  RefreshCw,
  Save,
  ScrollText,
  Settings as SettingsIcon,
  ShieldAlert,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiPut, useApi } from '@/lib/client'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Settings — SA only. GET /api/settings → {settings: Record<key,value>}
// PUT /api/settings {settings} → {settings}
// ---------------------------------------------------------------------------

const SETTING_KEYS = [
  'company_name',
  'company_address',
  'company_phone',
  'company_email',
  'company_website',
  'gstin',
  'pan',
  'reg_number',
  'quote_prefix',
  'quote_validity_days',
  'gst_rate',
  'consultation_fee',
  'orders_target',
  'admins_can_publish',
  'bank_details',
  'upi_details',
  'terms',
] as const

type SettingsMap = Partial<Record<(typeof SETTING_KEYS)[number], string>>

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-0 rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-primary">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  )
}

export default function SettingsView() {
  const { isSuperAdmin } = useAuth()
  const { data, loading, error, refresh } = useApi<{ settings: Record<string, string> }>(
    '/api/settings'
  )

  const [form, setForm] = useState<SettingsMap>({})
  const snapshotRef = useRef<SettingsMap>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data?.settings) return
    const next: SettingsMap = {}
    for (const key of SETTING_KEYS) next[key] = data.settings[key] ?? ''
    setForm(next)
    snapshotRef.current = next
  }, [data])

  const dirty = JSON.stringify(form) !== JSON.stringify(snapshotRef.current)

  function set(key: keyof SettingsMap, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function discard() {
    setForm({ ...snapshotRef.current })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await apiPut<{ settings: Record<string, string> }>('/api/settings', {
        settings: form,
      })
      const next: SettingsMap = {}
      for (const key of SETTING_KEYS) next[key] = res.settings[key] ?? ''
      setForm(next)
      snapshotRef.current = next
      toast.success('Settings saved.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <ShieldAlert className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Access denied</p>
            <p className="text-sm text-muted-foreground">
              Only Super Admins can change company settings.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-5 p-4 pb-32 md:p-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-36 md:h-9 md:w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-md gap-0 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" />
            </div>
            <p className="font-bold text-foreground">Failed to load settings</p>
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
    <div className="space-y-5 p-4 pb-32 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground md:text-base">
          Company profile, quotation defaults, payments and terms.
        </p>
      </div>

      {/* Company Profile */}
      <SectionCard
        icon={Building2}
        title="Company Profile"
        description="Shown on quotation PDFs and across the app."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="s-company-name">Company Name</Label>
            <Input
              id="s-company-name"
              value={form.company_name ?? ''}
              onChange={(e) => set('company_name', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-company-phone">Phone</Label>
            <Input
              id="s-company-phone"
              type="tel"
              value={form.company_phone ?? ''}
              onChange={(e) => set('company_phone', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="s-company-address">Address</Label>
            <Textarea
              id="s-company-address"
              rows={2}
              value={form.company_address ?? ''}
              onChange={(e) => set('company_address', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-company-email">Email</Label>
            <Input
              id="s-company-email"
              type="email"
              value={form.company_email ?? ''}
              onChange={(e) => set('company_email', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-company-website">Website</Label>
            <Input
              id="s-company-website"
              value={form.company_website ?? ''}
              onChange={(e) => set('company_website', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-gstin">GSTIN</Label>
            <Input
              id="s-gstin"
              value={form.gstin ?? ''}
              onChange={(e) => set('gstin', e.target.value.toUpperCase())}
              className="h-11 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-pan">PAN</Label>
            <Input
              id="s-pan"
              value={form.pan ?? ''}
              onChange={(e) => set('pan', e.target.value.toUpperCase())}
              className="h-11 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-reg-number">Reg. Number</Label>
            <Input
              id="s-reg-number"
              value={form.reg_number ?? ''}
              onChange={(e) => set('reg_number', e.target.value)}
              className="h-11"
            />
          </div>
        </div>
      </SectionCard>

      {/* Quotation Defaults */}
      <SectionCard
        icon={SettingsIcon}
        title="Quotation Defaults"
        description="Numbering, validity, tax and target defaults for new quotes."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="s-quote-prefix">Quote Prefix</Label>
            <Input
              id="s-quote-prefix"
              value={form.quote_prefix ?? ''}
              onChange={(e) => set('quote_prefix', e.target.value.toUpperCase())}
              placeholder="e.g. ABS-Q"
              className="h-11 font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-validity">Quote Validity (days)</Label>
            <Input
              id="s-validity"
              type="number"
              min="0"
              inputMode="numeric"
              value={form.quote_validity_days ?? ''}
              onChange={(e) => set('quote_validity_days', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-gst">GST Rate</Label>
            <div className="relative">
              <Input
                id="s-gst"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={form.gst_rate ?? ''}
                onChange={(e) => set('gst_rate', e.target.value)}
                className="h-11 pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-consultation">Consultation Fee</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                ₹
              </span>
              <Input
                id="s-consultation"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.consultation_fee ?? ''}
                onChange={(e) => set('consultation_fee', e.target.value)}
                className="h-11 pl-8"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-target">Monthly Orders Target</Label>
            <Input
              id="s-target"
              type="number"
              min="0"
              inputMode="numeric"
              value={form.orders_target ?? ''}
              onChange={(e) => set('orders_target', e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Admin Publishing</p>
              <p className="text-xs text-muted-foreground">
                Admins can publish quotations without approval
              </p>
            </div>
            <Switch
              checked={(form.admins_can_publish ?? '') === 'true'}
              onCheckedChange={(v) => set('admins_can_publish', v ? 'true' : 'false')}
              aria-label="Admins can publish quotations without approval"
            />
          </div>
        </div>
      </SectionCard>

      {/* Payments */}
      <SectionCard
        icon={CircleDollarSign}
        title="Payments"
        description="Bank &amp; UPI details printed on every quotation."
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="s-bank">Bank Details</Label>
            <Textarea
              id="s-bank"
              rows={4}
              value={form.bank_details ?? ''}
              onChange={(e) => set('bank_details', e.target.value)}
              placeholder={'Account Name\nAccount Number\nIFSC\nBranch'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-upi">UPI Details</Label>
            <Input
              id="s-upi"
              value={form.upi_details ?? ''}
              onChange={(e) => set('upi_details', e.target.value)}
              placeholder="e.g. auravixbathstudio@upi"
              className="h-11"
            />
          </div>
        </div>
      </SectionCard>

      {/* Terms & Conditions */}
      <SectionCard
        icon={ScrollText}
        title="Terms &amp; Conditions"
        description="Standard terms attached to every quotation."
      >
        <div className="space-y-2">
          <Label htmlFor="s-terms">Terms &amp; Conditions</Label>
          <Textarea
            id="s-terms"
            rows={8}
            value={form.terms ?? ''}
            onChange={(e) => set('terms', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Shown on every quotation PDF.</p>
        </div>
      </SectionCard>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:p-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <p
            className={cn(
              'flex items-center gap-2 text-sm font-medium',
              dirty ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <span
              className={cn(
                'size-2 rounded-full',
                dirty ? 'bg-amber-500' : 'bg-green-500'
              )}
            />
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={discard} disabled={saving} className="min-h-11">
                Discard
              </Button>
            )}
            <Button
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
