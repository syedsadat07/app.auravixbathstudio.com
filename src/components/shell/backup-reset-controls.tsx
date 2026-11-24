'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, DatabaseBackup, Download, Loader2, RotateCcw, Upload } from 'lucide-react'

import { apiPost } from '@/lib/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

/** Fetches /api/backup and saves it as a file. Returns true on success. */
async function downloadBackup(): Promise<boolean> {
  const res = await fetch('/api/backup', { credentials: 'same-origin', cache: 'no-store' })
  if (!res.ok) {
    let msg = `Backup failed (${res.status})`
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || `auravix-backup-${Date.now()}.json`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

const headerBtn =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50'

export default function BackupResetControls() {
  const [backingUp, setBackingUp] = useState(false)

  const [resetOpen, setResetOpen] = useState(false)
  const [resetText, setResetText] = useState('')
  const [resetting, setResetting] = useState(false)

  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreText, setRestoreText] = useState('')
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleBackup() {
    setBackingUp(true)
    try {
      await downloadBackup()
      toast.success('Backup downloaded.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup failed')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      // Always take a safety backup first; abort the reset if it fails.
      await downloadBackup()
      await apiPost('/api/reset', { confirm: 'RESET' })
      toast.success('Business data reset. A safety backup was downloaded first.')
      setResetOpen(false)
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  async function handleRestore() {
    if (!restoreFile) return
    setRestoring(true)
    try {
      let backup: unknown
      try {
        backup = JSON.parse(await restoreFile.text())
      } catch {
        throw new Error('Selected file is not valid JSON.')
      }
      await apiPost('/api/backup/restore', { confirm: 'RESTORE', backup })
      toast.success('Backup restored successfully.')
      setRestoreOpen(false)
      setTimeout(() => window.location.reload(), 600)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Backup" className={headerBtn} disabled={backingUp}>
            {backingUp ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
            <span className="hidden md:inline">Backup</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Full archive of all business records and ledgers.
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleBackup} className="min-h-[40px]">
            <Download />
            Create Backup Now
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setRestoreFile(null)
              setRestoreText('')
              setRestoreOpen(true)
            }}
            className="min-h-[40px]"
          >
            <Upload />
            Restore from Backup…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        aria-label="Reset data"
        onClick={() => {
          setResetText('')
          setResetOpen(true)
        }}
        className={`${headerBtn} border-red-400/40 text-red-200 hover:bg-red-500/20 hover:text-white`}
      >
        <RotateCcw className="size-4" />
        <span className="hidden md:inline">Reset</span>
      </button>

      {/* Reset dialog */}
      <Dialog open={resetOpen} onOpenChange={(o) => !resetting && setResetOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-5" />
              Reset Business Data
            </DialogTitle>
            <DialogDescription>
              Permanently deletes all <b>customers, leads, appointments, quotations, orders, payments and
              refunds</b>, and restarts document numbering. Users, materials &amp; stock, packages, bundles,
              settings and audit logs are kept. A safety backup is downloaded automatically before anything is
              deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">
              Type <span className="font-mono font-bold">RESET</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              autoComplete="off"
              placeholder="RESET"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset} disabled={resetText !== 'RESET' || resetting}>
              {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              Backup &amp; Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore dialog */}
      <Dialog open={restoreOpen} onOpenChange={(o) => !restoring && setRestoreOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5" />
              Restore from Backup
            </DialogTitle>
            <DialogDescription>
              Replaces <b>all</b> current data (including users and passwords) with the contents of the selected
              backup file. Consider creating a fresh backup first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="restore-file">Backup file (.json)</Label>
              <Input
                id="restore-file"
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restore-confirm">
                Type <span className="font-mono font-bold">RESTORE</span> to confirm
              </Label>
              <Input
                id="restore-confirm"
                value={restoreText}
                onChange={(e) => setRestoreText(e.target.value)}
                autoComplete="off"
                placeholder="RESTORE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={restoring}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={!restoreFile || restoreText !== 'RESTORE' || restoring}
            >
              {restoring ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
