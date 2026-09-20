'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  BadgeCheck,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  UserCog,
  UserX,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiPatch, apiPost, useApi, useDebounced } from '@/lib/client'
import { fmtDate, initialsOf } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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

// ---------------------------------------------------------------------------
// Types (per /api/users contract)
// ---------------------------------------------------------------------------

interface AdminUser {
  id: string
  name: string
  username: string
  email: string
  mobile: string | null
  role: string
  status: string
  mustChangePassword: boolean
  createdAt: string
  leadCount: number
  quoteCount: number
}

const EMPTY_CREATE_FORM = {
  name: '',
  username: '',
  email: '',
  mobile: '',
  password: '',
  confirmPassword: '',
}

type CreateForm = typeof EMPTY_CREATE_FORM

/** 10-char random password without ambiguous characters. */
function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const out = new Uint32Array(length)
  crypto.getRandomValues(out)
  let pwd = ''
  for (let i = 0; i < length; i++) pwd += chars[out[i] % chars.length]
  return pwd
}

// ---------------------------------------------------------------------------
// AdminManagementView — Super Admin only
// ---------------------------------------------------------------------------

export default function AdminManagementView() {
  const { user, isSuperAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const q = useDebounced(search, 350)
  const { data, loading, error, refresh } = useApi<{ users: AdminUser[] }>(
    `/api/users?search=${encodeURIComponent(q)}`
  )
  const users = data?.users ?? []

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', mobile: '' })
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset password flow
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetting, setResetting] = useState(false)
  const [tempPassword, setTempPassword] = useState<{ user: AdminUser; password: string } | null>(
    null
  )

  // Disable / enable flow
  const [toggleTarget, setToggleTarget] = useState<AdminUser | null>(null)
  const [toggling, setToggling] = useState(false)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!editOpen || !editTarget) return
    setEditError(null)
    setEditForm({ name: editTarget.name, email: editTarget.email, mobile: editTarget.mobile ?? '' })
  }, [editOpen, editTarget])

  useEffect(() => {
    if (createOpen) {
      setCreateForm({ ...EMPTY_CREATE_FORM })
      setCreateError(null)
    }
  }, [createOpen])

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
              Only Super Admins can manage admin accounts.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  function actionPermissions(u: AdminUser) {
    const isSelf = u.id === user?.id
    const targetIsSuperAdmin = u.role === 'SUPER_ADMIN'
    return {
      isSelf,
      canEdit: true,
      // No reset/disable for OTHER super admins; self can reset but never disable self.
      canReset: isSelf || !targetIsSuperAdmin,
      canToggleStatus: !targetIsSuperAdmin,
    }
  }

  async function handleEditSave() {
    if (!editTarget) return
    const name = editForm.name.trim()
    const email = editForm.email.trim()
    if (!name) return setEditError('Name is required.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setEditError('Enter a valid email address.')

    setSaving(true)
    setEditError(null)
    try {
      await apiPatch(`/api/users/${editTarget.id}`, {
        name,
        email,
        mobile: editForm.mobile.trim() || null,
      })
      toast.success('Account updated.')
      setEditOpen(false)
      await refresh()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return
    setResetting(true)
    try {
      const res = await apiPost<{ temporaryPassword: string }>(
        `/api/users/${resetTarget.id}/reset-password`
      )
      setTempPassword({ user: resetTarget, password: res.temporaryPassword })
      setResetTarget(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password.')
    } finally {
      setResetting(false)
    }
  }

  async function handleToggleStatus() {
    if (!toggleTarget) return
    const next = toggleTarget.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    setToggling(true)
    try {
      await apiPatch(`/api/users/${toggleTarget.id}`, { status: next })
      toast.success(
        next === 'DISABLED'
          ? `${toggleTarget.name} has been disabled.`
          : `${toggleTarget.name} has been re-enabled.`
      )
      setToggleTarget(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update status.')
    } finally {
      setToggling(false)
    }
  }

  async function handleCreate() {
    const name = createForm.name.trim()
    const username = createForm.username.trim()
    const email = createForm.email.trim()
    const mobile = createForm.mobile.trim()
    if (!name || !username || !email)
      return setCreateError('Name, username and email are required.')
    if (!/^\S+@\S+\.\S+$/.test(email)) return setCreateError('Enter a valid email address.')
    if (createForm.password.length < 8)
      return setCreateError('Password must be at least 8 characters.')
    if (createForm.password !== createForm.confirmPassword)
      return setCreateError('Passwords do not match.')

    setCreating(true)
    setCreateError(null)
    try {
      await apiPost('/api/users', { name, username, email, mobile, password: createForm.password, role: 'ADMIN' })
      toast.success(`Admin account created for ${name}.`, {
        description:
          'Share the username and password securely — the admin will be asked to change the password at first login if it was generated.',
      })
      setCreateOpen(false)
      await refresh()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 md:h-9 md:w-64" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="h-11 w-36" />
        </div>
        <Skeleton className="h-11" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
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
            <p className="font-bold text-foreground">Failed to load accounts</p>
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
            Admin Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            Create and manage admin accounts.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="size-4" />
          Create Admin
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search admins by name, email or username..."
          aria-label="Search admins"
          className="h-11 pl-9"
        />
      </div>

      {/* User cards */}
      {users.length === 0 ? (
        <Card className="gap-0 rounded-2xl p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-orange-50">
              <UserCog className="size-6 text-primary" />
            </div>
            <p className="font-bold text-foreground">No accounts found</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'No admins match your search.' : 'Create the first admin account to get started.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {users.map((u) => {
            const perm = actionPermissions(u)
            const active = u.status === 'ACTIVE'
            return (
              <Card key={u.id} className="gap-0 rounded-2xl p-4">
                <div className="flex gap-3">
                  <Avatar className="size-11 shrink-0">
                    <AvatarFallback className="bg-orange-50 font-bold text-primary">
                      {initialsOf(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-bold text-foreground">{u.name}</h3>
                      {u.role === 'SUPER_ADMIN' ? (
                        <Badge className="border-transparent bg-[#232327] text-white">
                          Super Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-orange-200 bg-orange-50 text-primary"
                        >
                          Admin
                        </Badge>
                      )}
                      {u.id === user?.id && (
                        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                          <BadgeCheck className="size-3" />
                          You
                        </Badge>
                      )}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {u.email} · @{u.username}
                    </p>
                    {u.mobile && <p className="text-xs text-muted-foreground">{u.mobile}</p>}
                    <p className="mt-1 flex items-center gap-1.5 text-xs">
                      <span
                        className={cn(
                          'size-2 rounded-full',
                          active ? 'bg-green-500' : 'bg-red-500'
                        )}
                      />
                      <span className={active ? 'font-medium text-green-700' : 'font-medium text-red-600'}>
                        {active ? 'Active' : 'Disabled'}
                      </span>
                      <span className="text-muted-foreground">· joined {fmtDate(u.createdAt)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{u.leadCount} Leads</Badge>
                  <Badge variant="secondary">{u.quoteCount} Quotations</Badge>
                  {u.mustChangePassword && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700">
                      Temp password
                    </Badge>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditTarget(u)
                      setEditOpen(true)
                    }}
                    className="min-h-11 flex-1 gap-1.5 font-semibold"
                  >
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                  {perm.canReset && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setResetTarget(u)}
                      className="min-h-11 flex-1 gap-1.5 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                    >
                      <KeyRound className="size-3.5" />
                      Reset Password
                    </Button>
                  )}
                  {perm.canToggleStatus && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setToggleTarget(u)}
                      className={cn(
                        'min-h-11 flex-1 gap-1.5',
                        active
                          ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                          : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                      )}
                    >
                      {active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                      {active ? 'Disable' : 'Enable'}
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update the profile details of {editTarget?.name ?? 'this account'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">Name</Label>
              <Input
                id="admin-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-mobile">Mobile</Label>
              <Input
                id="admin-mobile"
                type="tel"
                value={editForm.mobile}
                onChange={(e) => setEditForm((f) => ({ ...f, mobile: e.target.value }))}
                placeholder="e.g. +91 98765 43210"
                className="h-11"
              />
            </div>
          </div>
          {editError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>{editError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving} className="min-h-11">
              Cancel
            </Button>
            <Button
              onClick={() => void handleEditSave()}
              disabled={saving}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password confirm */}
      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password for {resetTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A temporary password will be generated and the current password will stop working
              immediately. The admin must change it at next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting} className="min-h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleResetPassword()
              }}
              disabled={resetting}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {resetting && <Loader2 className="size-4 animate-spin" />}
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Temporary password display (shown only once) */}
      <Dialog open={!!tempPassword} onOpenChange={(o) => !o && setTempPassword(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary password generated</DialogTitle>
            <DialogDescription>
              New temporary password for {tempPassword?.user.name} ({tempPassword?.user.email}).
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="min-h-11 flex-1 select-all break-all rounded-xl border bg-muted px-4 py-3 font-mono text-lg font-bold tracking-wider text-foreground">
              {tempPassword?.password}
            </code>
            <Button
              variant="outline"
              onClick={() => {
                if (!tempPassword) return
                void navigator.clipboard
                  .writeText(tempPassword.password)
                  .then(() => toast.success('Password copied to clipboard.'))
                  .catch(() => toast.error('Could not copy — please copy manually.'))
              }}
              className="min-h-11 shrink-0 gap-1.5"
            >
              <Copy className="size-4" />
              Copy
            </Button>
          </div>
          <Alert className="rounded-xl border-amber-200 bg-amber-50 text-amber-800">
            <AlertCircle className="size-4" />
            <AlertTitle>Shown only once</AlertTitle>
            <AlertDescription>
              This password cannot be viewed again. The admin must change it at next login.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button
              onClick={() => setTempPassword(null)}
              className="min-h-11 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable / enable confirm */}
      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.status === 'ACTIVE' ? 'Disable' : 'Enable'} {toggleTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.status === 'ACTIVE'
                ? 'A disabled admin cannot log in until re-enabled. Their existing leads and quotations remain intact.'
                : 'This admin will be able to log in again and manage their leads and quotations.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling} className="min-h-11">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleToggleStatus()
              }}
              disabled={toggling}
              className={cn(
                'min-h-11 gap-2 font-semibold text-white',
                toggleTarget?.status === 'ACTIVE'
                  ? 'bg-destructive hover:bg-destructive/90'
                  : 'bg-primary hover:bg-[var(--brand-dark)]'
              )}
            >
              {toggling && <Loader2 className="size-4 animate-spin" />}
              {toggleTarget?.status === 'ACTIVE' ? 'Disable Account' : 'Enable Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create admin dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Admin</DialogTitle>
            <DialogDescription>
              Admins manage their own leads, customers and quotations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-username">Username *</Label>
              <Input
                id="create-username"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Used to log in"
                autoCapitalize="none"
                spellCheck={false}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@auravixbathstudio.com"
                autoCapitalize="none"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-mobile">Mobile</Label>
              <Input
                id="create-mobile"
                type="tel"
                value={createForm.mobile}
                onChange={(e) => setCreateForm((f) => ({ ...f, mobile: e.target.value }))}
                placeholder="e.g. +91 98765 43210"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Password *</Label>
              <div className="flex gap-2">
                <Input
                  id="create-password"
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCreateForm((f) => ({ ...f, password: generatePassword(10) }))
                  }
                  className="min-h-11 shrink-0"
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-confirm">Confirm Password *</Label>
              <Input
                id="create-confirm"
                type="password"
                value={createForm.confirmPassword}
                onChange={(e) => setCreateForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter password"
                className="h-11"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Role</p>
                <p className="text-xs text-muted-foreground">Admin</p>
              </div>
              <Badge
                variant="outline"
                className="border-orange-200 bg-orange-50 text-primary"
              >
                ADMIN
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Admin will be asked to change password at first login if generated.
            </p>
          </div>
          {createError && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating} className="min-h-11">
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={creating}
              className="min-h-11 gap-2 bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              {creating && <Loader2 className="size-4 animate-spin" />}
              Create Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
