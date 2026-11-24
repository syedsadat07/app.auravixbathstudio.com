'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  BarChart3,
  BookUser,
  Boxes,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import type { AppView, ViewParams } from '@/lib/nav'
import { apiPost, useApi, useDebounced } from '@/lib/client'
import { initialsOf } from '@/lib/format'
import { cn } from '@/lib/utils'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LiquidNavbar, type LiquidNavItem } from '@/components/ui/liquid-glass-navbar'

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------

interface NavItem {
  view: AppView
  label: string
  icon: LucideIcon
}

const MAIN_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'leads', label: 'My Leads', icon: Users },
  { view: 'quotations', label: 'Quotations', icon: FileText },
  { view: 'orders', label: 'Orders', icon: ShoppingBag },
  { view: 'refunds', label: 'Refunds', icon: RotateCcw },
  { view: 'packages', label: 'Packages', icon: Package },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
]

const ADMIN_NAV: NavItem[] = [
  { view: 'materials', label: 'Materials', icon: Layers },
  { view: 'bundles', label: 'Brand Bundles', icon: Boxes },
  { view: 'inventory', label: 'Inventory & Stock', icon: Warehouse },
  { view: 'admins', label: 'Admin Management', icon: UserCog },
  { view: 'settings', label: 'Settings', icon: Settings },
  { view: 'audit-logs', label: 'Audit Logs', icon: ShieldCheck },
]

const BOTTOM_NAV: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'leads', label: 'Leads', icon: Users },
  { view: 'quotations', label: 'Quotes', icon: FileText },
  { view: 'orders', label: 'Orders', icon: ShoppingBag },
]

function isBottomActive(itemView: AppView, current: AppView): boolean {
  if (itemView === 'dashboard') return current === 'dashboard'
  if (itemView === 'leads') return current === 'leads' || current === 'lead-detail'
  if (itemView === 'quotations')
    return current === 'quotations' || current === 'quotation-wizard' || current === 'quotation-detail'
  return current === itemView
}

// ---------------------------------------------------------------------------
// Search (global)
// ---------------------------------------------------------------------------

interface SearchResults {
  leads: { id: string; leadNumber: string; name: string }[]
  customers: { id: string; name: string; phone?: string }[]
  quotations: { id: string; quotationNumber: string; customerName: string }[]
  admins: { id: string; name: string; email?: string }[]
  materials: { id: string; name: string }[]
}

function isResultsEmpty(r: SearchResults | null): boolean {
  if (!r) return true
  return (
    r.leads.length === 0 &&
    r.customers.length === 0 &&
    r.quotations.length === 0 &&
    r.admins.length === 0 &&
    r.materials.length === 0
  )
}

// ---------------------------------------------------------------------------
// Sidebar pieces
// ---------------------------------------------------------------------------

function BrandBlock() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
      <img
        src="/brand/auravix-logo.jpeg"
        alt="AURAVIX BATH STUDIO logo"
        className="size-8 shrink-0 rounded-lg object-cover border border-[#c79a63]/40"
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold tracking-wide text-white">AURAVIX</p>
        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.22em] text-[#c79a63]">
          Bath Studio
        </p>
      </div>
    </div>
  )
}

/** Convert a Lucide icon component to a React element for LiquidNavbar */
function mkIcon(Icon: LucideIcon, active: boolean) {
  return (
    <Icon
      className={cn('size-4 shrink-0 transition-colors', active ? 'text-[#c79a63]' : 'text-stone-400')}
    />
  )
}

function SidebarNav({
  activeView,
  isSuperAdmin,
  onNavigate,
}: {
  activeView: AppView
  isSuperAdmin: boolean
  onNavigate: (view: AppView) => void
}) {
  const allMainItems: LiquidNavItem[] = MAIN_NAV.map((item) => ({
    label: item.label,
    icon: mkIcon(item.icon, activeView === item.view),
    fx:
      item.view === 'dashboard'
        ? 'glow'
        : item.view === 'leads'
        ? 'wave'
        : item.view === 'quotations'
        ? 'drop'
        : item.view === 'orders'
        ? 'pop'
        : item.view === 'refunds'
        ? 'spin'
        : item.view === 'packages'
        ? 'plane'
        : 'glow',
  }))
  const allAdminItems: LiquidNavItem[] = ADMIN_NAV.map((item) => ({
    label: item.label,
    icon: mkIcon(item.icon, activeView === item.view),
    fx:
      item.view === 'materials'
        ? 'drop'
        : item.view === 'bundles'
        ? 'pop'
        : item.view === 'inventory'
        ? 'plane'
        : item.view === 'admins'
        ? 'wave'
        : item.view === 'settings'
        ? 'spin'
        : 'glow',
  }))

  const mainActiveIdx = MAIN_NAV.findIndex((n) => n.view === activeView)
  const adminActiveIdx = ADMIN_NAV.findIndex((n) => n.view === activeView)

  return (
    <nav aria-label="Main navigation" className="scrollbar-slim flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-2">
      <LiquidNavbar
        items={allMainItems}
        active={mainActiveIdx >= 0 ? mainActiveIdx : undefined}
        defaultActive={mainActiveIdx >= 0 ? mainActiveIdx : 0}
        tone="dark"
        orientation="vertical"
        sound={true}
        onChange={(i) => onNavigate(MAIN_NAV[i].view)}
        className="w-full"
      />
      {isSuperAdmin && (
        <>
          <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Administration
          </p>
          <LiquidNavbar
            items={allAdminItems}
            active={adminActiveIdx >= 0 ? adminActiveIdx : undefined}
            defaultActive={adminActiveIdx >= 0 ? adminActiveIdx : 0}
            tone="dark"
            orientation="vertical"
            sound={true}
            onChange={(i) => onNavigate(ADMIN_NAV[i].view)}
            className="w-full"
          />
        </>
      )}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Change password form (shared by menu dialog + blocking dialog)
// ---------------------------------------------------------------------------

function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const { refreshUser } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    if (!currentPassword) return setError('Please enter your current password.')
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.')
    if (newPassword !== confirmPassword) return setError('New passwords do not match.')

    setSubmitting(true)
    try {
      await apiPost('/api/auth/change-password', { currentPassword, newPassword })
      toast.success('Password changed successfully.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      await refreshUser()
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cp-current">Current Password</Label>
        <Input
          id="cp-current"
          type="password"
          autoComplete="current-password"
          className="h-11"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-new">New Password</Label>
        <div className="relative">
          <Input
            id="cp-new"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11 pr-10"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="cp-confirm">Confirm New Password</Label>
        <Input
          id="cp-confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          className="h-11"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={submitting}
        className="h-11 w-full bg-primary font-semibold text-white hover:bg-[var(--brand-dark)]"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Update Password
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// AppShell
// ---------------------------------------------------------------------------

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, isSuperAdmin } = useAuth()
  const { view, navigate } = useNav()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)

  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounced(query, 300)
  const trimmed = debouncedQuery.trim()
  const searchActive = searchOpen && trimmed.length >= 2
  const { data: results, loading: searching } = useApi<SearchResults>(
    searchActive ? `/api/search?q=${encodeURIComponent(trimmed)}` : null
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" aria-label="Loading" />
      </div>
    )
  }

  if (!user) return null

  const roleLabel = user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'

  function handleNavigate(v: AppView) {
    navigate(v)
    setSheetOpen(false)
  }

  function handleSearchNavigate(v: AppView, params?: ViewParams) {
    navigate(v, params)
    setSearchOpen(false)
    setQuery('')
  }

  async function handleLogout() {
    setSheetOpen(false)
    await logout()
    navigate('dashboard')
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[var(--sidebar)] text-stone-300 lg:flex">
        <BrandBlock />
        <SidebarNav activeView={view} isSuperAdmin={isSuperAdmin} onNavigate={handleNavigate} />
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-8 shrink-0 border border-white/15">
              <AvatarFallback className="bg-primary/25 text-xs font-semibold text-white">
                {initialsOf(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs font-semibold text-white">{user.name}</p>
              <p className="truncate text-[10px] uppercase tracking-wider text-stone-400">
                {roleLabel}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Header + content column */}
      <div className="flex min-h-screen w-full min-w-0 flex-col lg:pl-60">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 bg-[var(--charcoal-deep)] px-4 text-white">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/10 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src="/brand/auravix-logo.jpeg"
              alt=""
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-md object-cover border border-[#c79a63]/40"
            />
            <span className="truncate text-sm font-bold tracking-wide sm:text-base">
              AURAVIX BATH STUDIO
            </span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSearchOpen(true)
              }}
              aria-label="Search"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Search className="size-4" />
              <span className="hidden md:inline">Search…</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Account menu"
                  className="flex min-h-11 items-center gap-2 rounded-full pr-1 pl-1 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-2"
                >
                  <Avatar className="size-8 border border-white/20">
                    <AvatarFallback className="bg-primary/25 text-xs font-semibold text-white">
                      {initialsOf(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block max-w-[140px] truncate text-xs font-semibold">
                      {user.name}
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-white/60">
                      {roleLabel}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  <Badge variant="secondary" className="mt-1.5">
                    {roleLabel}
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPwOpen(true)} className="min-h-[40px]">
                  <KeyRound />
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={handleLogout}
                  className="min-h-[40px]"
                >
                  <LogOut />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>

        <footer className="mt-auto border-t px-6 py-4 pb-safe text-xs text-muted-foreground">
          © {new Date().getFullYear()} AURAVIX BATH STUDIO — Internal CRM · v1.0
        </footer>
        <div className="h-16 lg:hidden" aria-hidden="true" />
      </div>

      {/* Mobile bottom navigation — Liquid Navbar */}
      <div className="fixed inset-x-0 bottom-2 z-40 flex justify-center px-2 lg:hidden pointer-events-none">
        <div className="pointer-events-auto">
          <LiquidNavbar
            items={[
              ...BOTTOM_NAV.map((item) => ({
                label: item.label,
                icon: <item.icon className="size-4 shrink-0" />,
                fx: 'pop' as const,
              })),
              {
                label: 'More',
                icon: <MoreHorizontal className="size-4 shrink-0" />,
                fx: 'pop' as const,
              },
            ]}
            active={
              sheetOpen
                ? 4
                : Math.max(0, BOTTOM_NAV.findIndex((item) => isBottomActive(item.view, view)))
            }
            tone="dark"
            orientation="horizontal"
            sound={true}
            onChange={(i) => {
              if (i === 4) setSheetOpen(true)
              else handleNavigate(BOTTOM_NAV[i].view)
            }}
          />
        </div>
      </div>

      {/* Mobile drawer (hamburger / More) */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-[280px] gap-0 bg-[var(--sidebar)] p-0 text-stone-300 sm:max-w-[280px]"
        >
          <SheetHeader className="border-b border-white/10 p-0">
            <SheetTitle className="sr-only">AURAVIX BATH STUDIO navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Navigate between CRM sections and log out.
            </SheetDescription>
            <BrandBlock />
          </SheetHeader>
          <SidebarNav activeView={view} isSuperAdmin={isSuperAdmin} onNavigate={handleNavigate} />
          <div className="mt-auto space-y-3 border-t border-white/10 p-4 pb-safe">
            <div className="flex items-center gap-3">
              <Avatar className="size-9 shrink-0 border border-white/15">
                <AvatarFallback className="bg-primary/25 text-xs font-semibold text-white">
                  {initialsOf(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs text-stone-400">Logged in as</p>
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="min-h-11 w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Global search dialog */}
      <Dialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open)
          if (!open) setQuery('')
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Global Search</DialogTitle>
            <DialogDescription>
              Search leads, customers, quotations, admins and materials.
            </DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search leads, customers, quotes…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[380px]">
              {searching && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Searching…
                </div>
              )}
              {!searching && !searchActive && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              )}
              {!searching && searchActive && isResultsEmpty(results) && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No results found for “{trimmed}”.
                </div>
              )}
              {results && results.leads.length > 0 && (
                <CommandGroup heading="Leads">
                  {results.leads.map((l) => (
                    <CommandItem
                      key={`lead-${l.id}`}
                      value={`lead-${l.id}`}
                      onSelect={() => handleSearchNavigate('lead-detail', { id: l.id })}
                      className="min-h-[44px] cursor-pointer"
                    >
                      <Users className="text-muted-foreground" />
                      <span className="truncate font-medium">{l.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {l.leadNumber}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results && results.customers.length > 0 && (
                <CommandGroup heading="Customers">
                  {results.customers.map((c) => (
                    <CommandItem
                      key={`customer-${c.id}`}
                      value={`customer-${c.id}`}
                      onSelect={() => handleSearchNavigate('customer-detail', { id: c.id })}
                      className="min-h-[44px] cursor-pointer"
                    >
                      <BookUser className="text-muted-foreground" />
                      <span className="truncate font-medium">{c.name}</span>
                      {c.phone && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {c.phone}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results && results.quotations.length > 0 && (
                <CommandGroup heading="Quotations">
                  {results.quotations.map((q) => (
                    <CommandItem
                      key={`quote-${q.id}`}
                      value={`quote-${q.id}`}
                      onSelect={() => handleSearchNavigate('quotation-detail', { id: q.id })}
                      className="min-h-[44px] cursor-pointer"
                    >
                      <FileText className="text-muted-foreground" />
                      <span className="truncate font-medium">{q.quotationNumber}</span>
                      <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                        {q.customerName}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results && results.admins.length > 0 && (
                <CommandGroup heading="Admins">
                  {results.admins.map((a) => (
                    <CommandItem
                      key={`admin-${a.id}`}
                      value={`admin-${a.id}`}
                      onSelect={() => handleSearchNavigate('admins', { search: a.name })}
                      className="min-h-[44px] cursor-pointer"
                    >
                      <UserCog className="text-muted-foreground" />
                      <span className="truncate font-medium">{a.name}</span>
                      {a.email && (
                        <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                          {a.email}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {results && results.materials.length > 0 && (
                <CommandGroup heading="Materials">
                  {results.materials.map((m) => (
                    <CommandItem
                      key={`material-${m.id}`}
                      value={`material-${m.id}`}
                      onSelect={() => handleSearchNavigate('materials', { search: m.name })}
                      className="min-h-[44px] cursor-pointer"
                    >
                      <Package className="text-muted-foreground" />
                      <span className="truncate font-medium">{m.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Change password (from user menu) */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update your account password. Minimum 8 characters.
            </DialogDescription>
          </DialogHeader>
          <ChangePasswordForm onSuccess={() => setPwOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Blocking change-password dialog for temporary passwords */}
      <Dialog open={!!user?.mustChangePassword}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Set a New Password</DialogTitle>
            <DialogDescription>
              For security, you must replace your temporary password before continuing.
            </DialogDescription>
          </DialogHeader>
          <ChangePasswordForm />
        </DialogContent>
      </Dialog>
    </div>
  )
}
