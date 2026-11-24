'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Calendar,
  Database,
  Download,
  FileJson,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Upload,
} from 'lucide-react'

import { apiPost } from '@/lib/client'
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

interface BackupRecord {
  filename: string
  date: string
  records?: number
}

const STORAGE_KEY = 'auravix_backup_history'

async function triggerDownloadBackup(): Promise<{ filename: string; totalRecords: number }> {
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
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || `auravix-backup-${Date.now()}.json`

  let totalRecords = 0
  try {
    const text = await blob.text()
    const parsed = JSON.parse(text)
    if (parsed.counts) {
      totalRecords = Object.values(parsed.counts as Record<string, number>).reduce((a, b) => a + b, 0)
    }
    // Re-create blob from text for clean download
    const dlBlob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(dlBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { filename, totalRecords }
}

export default function BackupResetSettings() {
  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [backingUp, setBackingUp] = useState(false)

  // Reset dialog state
  const [resetOpen, setResetOpen] = useState(false)
  const [resetScope, setResetScope] = useState<'all' | 'quotations' | 'dates'>('all')
  const [resetText, setResetText] = useState('')
  const [resetting, setResetting] = useState(false)

  // Restore dialog state
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreText, setRestoreText] = useState('')
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const [restoring, setRestoring] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setBackups(JSON.parse(saved))
      }
    } catch {
      /* ignore */
    }
  }, [])

  function saveBackupRecord(record: BackupRecord) {
    const updated = [record, ...backups.slice(0, 9)]
    setBackups(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      /* ignore */
    }
  }

  async function handleCreateBackup() {
    setBackingUp(true)
    try {
      const { filename, totalRecords } = await triggerDownloadBackup()
      saveBackupRecord({
        filename,
        date: new Date().toLocaleString(),
        records: totalRecords,
      })
      toast.success('Backup archive downloaded successfully.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Backup generation failed.')
    } finally {
      setBackingUp(false)
    }
  }

  async function handleExecuteReset() {
    setResetting(true)
    try {
      // Create a safety backup first for any destructive wipe
      if (resetScope !== 'dates') {
        try {
          const { filename, totalRecords } = await triggerDownloadBackup()
          saveBackupRecord({
            filename,
            date: new Date().toLocaleString() + ' (Safety Backup)',
            records: totalRecords,
          })
        } catch (e) {
          console.warn('Safety backup could not be saved before reset:', e)
        }
      }

      const res = await apiPost<{ ok: boolean; count?: number; scope?: string }>('/api/reset', {
        confirm: 'RESET',
        scope: resetScope,
      })

      if (resetScope === 'dates') {
        toast.success(`Quotation dates updated to current date (${res.count ?? 0} quotations).`)
      } else if (resetScope === 'quotations') {
        toast.success('All quotation data and counter reset. A safety backup was saved.')
      } else {
        toast.success('All demo business data reset to baseline. Safety backup downloaded.')
      }

      setResetOpen(false)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reset failed.')
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
      toast.success('Database restored successfully from backup.')
      setRestoreOpen(false)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed.')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Data Backup & Safety Restores Card */}
      <Card className="gap-0 rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
              <Database className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Data Backup &amp; Safety Restores</h2>
              <p className="text-xs text-muted-foreground">
                Generate standalone SQL archives of all business records and ledgers.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={handleCreateBackup}
              disabled={backingUp}
              className="min-h-10 gap-2 bg-[#0088cc] font-medium text-white shadow-sm hover:bg-[#0077b3]"
            >
              {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Create Backup Now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRestoreFile(null)
                setRestoreText('')
                setRestoreOpen(true)
              }}
              className="min-h-10 gap-2"
            >
              <Upload className="size-4" />
              Restore Backup
            </Button>
          </div>
        </div>

        <div className="mt-5 border-t border-border/60 pt-4">
          {backups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No backup files created yet. Click above to generate your first backup.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Recent Backups in this Browser</span>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEY)
                    setBackups([])
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear list
                </button>
              </div>
              <div className="divide-y divide-border/40 rounded-xl border border-border/60 bg-muted/20">
                {backups.map((b, i) => (
                  <div key={i} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <FileJson className="size-4 text-sky-500" />
                      <div>
                        <p className="font-mono font-medium text-foreground">{b.filename}</p>
                        <p className="text-muted-foreground">
                          {b.date} {b.records ? `• ${b.records} records` : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCreateBackup}
                      disabled={backingUp}
                      className="h-8 gap-1 text-xs"
                    >
                      <Download className="size-3" /> Re-download
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Reset Demo Data Card */}
      <Card className="gap-0 rounded-2xl border border-red-500/40 bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-red-600 dark:text-red-500">Reset Demo Data</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              This operation resets the demo customers, invoices, leads, products, and tasks to their baseline
              demonstration dataset. Existing custom credentials will revert to password123.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-border/60 pt-4">
          <Button
            type="button"
            onClick={() => {
              setResetScope('all')
              setResetText('')
              setResetOpen(true)
            }}
            className="min-h-10 gap-2 bg-[#d32f2f] font-semibold text-white shadow-sm hover:bg-[#b71c1c]"
          >
            <RotateCcw className="size-4" />
            Reset to Factory Demo State
          </Button>
        </div>
      </Card>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetOpen} onOpenChange={(o) => !resetting && setResetOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="size-5" />
              Reset System Data
            </DialogTitle>
            <DialogDescription>
              Select the scope of data you wish to reset. For destructive resets, an automatic safety backup will be
              downloaded first.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground">Select Reset Scope</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    resetScope === 'all'
                      ? 'border-red-500 bg-red-500/5 text-foreground'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="resetScope"
                    value="all"
                    checked={resetScope === 'all'}
                    onChange={() => setResetScope('all')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                      Reset Entire Demo Pipeline
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Clears all customers, leads, quotations, orders, payments, and refunds. Preserves materials
                      catalog, packages, settings, and users.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    resetScope === 'quotations'
                      ? 'border-amber-500 bg-amber-500/5 text-foreground'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="resetScope"
                    value="quotations"
                    checked={resetScope === 'quotations'}
                    onChange={() => setResetScope('quotations')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      Reset Quotation Data Only
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Wipes all quotation records, version drafts, and restarts quote numbering from ABS-Q-000001. Keeps
                      customers and leads intact.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    resetScope === 'dates'
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="resetScope"
                    value="dates"
                    checked={resetScope === 'dates'}
                    onChange={() => setResetScope('dates')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      Reset Quotation Dates to Current Date
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Does not delete any data. Updates the creation and validity dates of all existing quotations to
                      today so they are active.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-confirm" className="text-xs font-semibold">
                Type <span className="font-mono font-bold text-red-600">RESET</span> to confirm
              </Label>
              <Input
                id="reset-confirm"
                value={resetText}
                onChange={(e) => setResetText(e.target.value)}
                autoComplete="off"
                placeholder="RESET"
                className="h-10 font-mono"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleExecuteReset}
              disabled={resetText !== 'RESET' || resetting}
              className="gap-2 bg-red-600 hover:bg-red-700"
            >
              {resetting ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {resetScope === 'dates' ? 'Update Quotation Dates' : 'Confirm & Reset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog */}
      <Dialog open={restoreOpen} onOpenChange={(o) => !restoring && setRestoreOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-primary" />
              Restore Database from Backup
            </DialogTitle>
            <DialogDescription>
              Select an official AURAVIX JSON backup file to restore. All current database records will be replaced with
              the contents of the backup.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="restore-file">Backup File (.json)</Label>
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
                className="h-10 font-mono"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={restoring}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={!restoreFile || restoreText !== 'RESTORE' || restoring}
              className="gap-2"
            >
              {restoring ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Restore Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

