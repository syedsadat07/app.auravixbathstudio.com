import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Full-database JSON backup / restore and business-data reset.
 *
 * TABLES is ordered parents-first so restores can insert in order and
 * deletes can run in reverse order without violating foreign keys.
 */
export const TABLES = [
  'user',
  'customer',
  'materialCategory',
  'material',
  'package',
  'setting',
  'counter',
  'brandBundle',
  'brandBundleItem',
  'lead',
  'appointment',
  'quotation',
  'quotationVersion',
  'bathroom',
  'quotationItem',
  'stockReservation',
  'inventoryTransaction',
  'payment',
  'refund',
  'refundComment',
  'monthlyTarget',
  'auditLog',
] as const

export type TableName = (typeof TABLES)[number]

export const BACKUP_FORMAT = 'auravix-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  createdAt: string
  createdBy: string
  counts: Record<string, number>
  data: Record<TableName, Record<string, unknown>[]>
}

type Delegate = {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>
  deleteMany: (args?: unknown) => Promise<{ count: number }>
  createMany: (args: { data: Record<string, unknown>[] }) => Promise<{ count: number }>
}

function delegate(client: Prisma.TransactionClient | typeof db, table: TableName): Delegate {
  return (client as unknown as Record<TableName, Delegate>)[table]
}

export async function createBackup(createdBy: string): Promise<BackupFile> {
  const data = {} as BackupFile['data']
  const counts: Record<string, number> = {}
  for (const table of TABLES) {
    const rows = await delegate(db, table).findMany()
    data[table] = rows
    counts[table] = rows.length
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    createdBy,
    counts,
    data,
  }
}

export function validateBackup(input: unknown): BackupFile {
  if (!input || typeof input !== 'object') throw new Error('Backup file is not valid JSON.')
  const b = input as Partial<BackupFile>
  if (b.format !== BACKUP_FORMAT) throw new Error('This is not an AURAVIX backup file.')
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new Error('Unsupported backup version.')
  }
  if (!b.data || typeof b.data !== 'object') throw new Error('Backup file has no data.')
  for (const table of TABLES) {
    const rows = (b.data as Record<string, unknown>)[table]
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Backup table "${table}" is malformed.`)
  }
  const users = (b.data as Record<string, unknown[]>).user
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('Backup contains no users — refusing to restore (you would be locked out).')
  }
  return b as BackupFile
}

const CHUNK = 500

/** Wipes every table and re-inserts the backup contents, atomically. */
export async function restoreBackup(backup: BackupFile): Promise<Record<string, number>> {
  const restored: Record<string, number> = {}
  await db.$transaction(
    async (tx) => {
      for (const table of [...TABLES].reverse()) {
        await delegate(tx, table).deleteMany()
      }
      for (const table of TABLES) {
        const rows = backup.data[table] ?? []
        for (let i = 0; i < rows.length; i += CHUNK) {
          await delegate(tx, table).createMany({ data: rows.slice(i, i + CHUNK) })
        }
        restored[table] = rows.length
      }
    },
    { timeout: 180_000, maxWait: 20_000 }
  )
  return restored
}

/**
 * Clears the sales pipeline (customers, leads, appointments, quotations,
 * orders, payments, refunds) and restarts document numbering.
 * Keeps users, the material catalog + stock levels, packages, bundles,
 * settings, inventory ledger, targets and audit logs.
 */
export async function resetBusinessData(): Promise<Record<string, number>> {
  const cleared: Record<string, number> = {}
  await db.$transaction(
    async (tx) => {
      const steps: TableName[] = [
        'refundComment',
        'refund',
        'payment',
        'stockReservation',
        'quotationItem',
        'bathroom',
        'quotationVersion',
        'quotation',
        'appointment',
        'lead',
        'customer',
      ]
      for (const table of steps) {
        const { count } = await delegate(tx, table).deleteMany()
        cleared[table] = count
      }
      // All reservations are gone, so nothing is reserved any more.
      await tx.material.updateMany({ data: { reservedQty: 0 } })
      // Restart lead / quotation / payment / refund numbering.
      await tx.counter.deleteMany({ where: { key: { in: ['lead', 'quotation', 'payment', 'refund'] } } })
    },
    { timeout: 120_000, maxWait: 20_000 }
  )
  return cleared
}
