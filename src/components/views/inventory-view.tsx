'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  History,
  Info,
  Loader2,
  Package,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Warehouse,
  X,
} from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { apiPost, useApi } from '@/lib/client'
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

interface InventoryItem {
  id: string
  name: string
  category: { id: string; name: string }
  subCategory: string | null
  brand: string | null
  sku: string | null
  unit: string
  purchaseCost: number
  sellingPrice: number
  currentStock: number
  reservedQty: number
  availableQty: number
  reorderThreshold: number
  supplier: string | null
  packageQty: number
  isLowStock: boolean
  isOutOfStock: boolean
  valuationPurchase: number
  valuationSelling: number
  imageUrl: string | null
}

interface InventoryMetrics {
  totalMaterials: number
  lowStockCount: number
  outOfStockCount: number
  totalValuationCost: number
  totalValuationSelling: number
}

interface InventoryTx {
  id: string
  materialId: string
  material?: { id: string; name: string; unit: string; brand: string | null }
  type: string
  qty: number
  purchaseCost?: number | null
  notes?: string | null
  supplier?: string | null
  refType?: string | null
  refId?: string | null
  createdAt: string
  createdBy?: { id: string; name: string } | null
}

interface InventoryResponse {
  items: InventoryItem[]
  metrics: InventoryMetrics
  recentTransactions: InventoryTx[]
}

export default function InventoryView() {
  const { isSuperAdmin } = useAuth()
  const [filter, setFilter] = useState<'all' | 'low_stock' | 'out_of_stock'>('all')
  const [search, setSearch] = useState('')

  const sp = new URLSearchParams()
  if (filter !== 'all') sp.set('filter', filter)
  if (search.trim()) sp.set('q', search.trim())

  const { data, loading, error, refresh } = useApi<InventoryResponse>(
    `/api/inventory?${sp.toString()}`
  )

  const items = data?.items ?? []
  const metrics = data?.metrics ?? {
    totalMaterials: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalValuationCost: 0,
    totalValuationSelling: 0,
  }
  const recentTransactions = data?.recentTransactions ?? []

  // Dialog states
  const [activeAction, setActiveAction] = useState<'RECEIVE' | 'ISSUE' | 'ADJUST' | null>(null)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [historyMovements, setHistoryMovements] = useState<InventoryTx[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Form states
  const [qtyInput, setQtyInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [supplierInput, setSupplierInput] = useState('')
  const [notesInput, setNotesInput] = useState('')
  const [reasonInput, setReasonInput] = useState('Count reconciliation')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function openAction(action: 'RECEIVE' | 'ISSUE' | 'ADJUST', item: InventoryItem) {
    setActiveAction(action)
    setSelectedItem(item)
    setQtyInput('')
    setCostInput(item.purchaseCost ? String(item.purchaseCost) : '')
    setSupplierInput(item.supplier ?? '')
    setNotesInput('')
    setReasonInput('Physical count adjustment')
    setFormError(null)
  }

  async function openHistory(item: InventoryItem) {
    setHistoryItem(item)
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/inventory/${item.id}/movements`)
      const json = await res.json()
      setHistoryMovements(json.movements ?? [])
    } catch {
      toast.error('Failed to load transaction history.')
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleSubmitAction() {
    if (!selectedItem) return
    const qty = Number(qtyInput)

    if (activeAction === 'RECEIVE') {
      if (!qty || qty <= 0) return setFormError('Enter a valid received quantity greater than 0.')
      setSubmitting(true)
      try {
        await apiPost('/api/inventory/receive', {
          materialId: selectedItem.id,
          qty,
          unitCost: costInput ? Number(costInput) : undefined,
          supplier: supplierInput.trim() || undefined,
          notes: notesInput.trim() || undefined,
        })
        toast.success(`Received ${qty} ${selectedItem.unit} of ${selectedItem.name}.`)
        setActiveAction(null)
        void refresh()
      } catch (e: any) {
        setFormError(e.message || 'Failed to record receipt.')
      } finally {
        setSubmitting(false)
      }
    } else if (activeAction === 'ISSUE') {
      if (!qty || qty <= 0) return setFormError('Enter a valid issued quantity greater than 0.')
      if (qty > selectedItem.currentStock)
        return setFormError(
          `Cannot issue ${qty} ${selectedItem.unit}. Only ${selectedItem.currentStock} in stock.`
        )
      setSubmitting(true)
      try {
        await apiPost('/api/inventory/issue', {
          materialId: selectedItem.id,
          qty,
          notes: notesInput.trim() || undefined,
        })
        toast.success(`Issued ${qty} ${selectedItem.unit} of ${selectedItem.name}.`)
        setActiveAction(null)
        void refresh()
      } catch (e: any) {
        setFormError(e.message || 'Failed to record stock issue.')
      } finally {
        setSubmitting(false)
      }
    } else if (activeAction === 'ADJUST') {
      if (Number.isNaN(qty) || qty < 0)
        return setFormError('Enter a valid new stock count (0 or greater).')
      setSubmitting(true)
      try {
        await apiPost('/api/inventory/adjust', {
          materialId: selectedItem.id,
          newStock: qty,
          reason: reasonInput,
          notes: notesInput.trim() || undefined,
        })
        toast.success(`Stock for ${selectedItem.name} updated to ${qty} ${selectedItem.unit}.`)
        setActiveAction(null)
        void refresh()
      } catch (e: any) {
        setFormError(e.message || 'Failed to adjust stock.')
      } finally {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Inventory & Stock
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track real-time stock levels, quotation allocations, receipts, and warehouse movements.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()} className="gap-2">
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          onClick={() => setFilter('all')}
          className={cn(
            'cursor-pointer rounded-2xl p-4 transition-all hover:border-primary',
            filter === 'all' && 'border-primary ring-1 ring-primary'
          )}
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Catalog Items</span>
            <Warehouse className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{metrics.totalMaterials}</p>
          <p className="mt-1 text-xs text-muted-foreground">Active products tracked</p>
        </Card>

        <Card
          onClick={() => setFilter('low_stock')}
          className={cn(
            'cursor-pointer rounded-2xl p-4 transition-all hover:border-amber-400',
            filter === 'low_stock' && 'border-amber-500 ring-1 ring-amber-500'
          )}
        >
          <div className="flex items-center justify-between text-amber-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Low Stock Alert</span>
            <AlertTriangle className="size-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{metrics.lowStockCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Below reorder threshold</p>
        </Card>

        <Card
          onClick={() => setFilter('out_of_stock')}
          className={cn(
            'cursor-pointer rounded-2xl p-4 transition-all hover:border-red-400',
            filter === 'out_of_stock' && 'border-red-500 ring-1 ring-red-500'
          )}
        >
          <div className="flex items-center justify-between text-red-600">
            <span className="text-xs font-semibold uppercase tracking-wider">Out of Stock</span>
            <AlertCircle className="size-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{metrics.outOfStockCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Immediate replenishment needed</p>
        </Card>

        <Card className="rounded-2xl p-4">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock Valuation</span>
            <PackageCheck className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">
            {formatINR(metrics.totalValuationSelling)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cost: {formatINR(metrics.totalValuationCost)}
          </p>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, brand, SKU or sub-category..."
            className="h-11 pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className="h-11 text-xs"
          >
            All Stock
          </Button>
          <Button
            variant={filter === 'low_stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('low_stock')}
            className="h-11 text-xs"
          >
            Low Stock ({metrics.lowStockCount})
          </Button>
          <Button
            variant={filter === 'out_of_stock' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('out_of_stock')}
            className="h-11 text-xs"
          >
            Out of Stock ({metrics.outOfStockCount})
          </Button>
        </div>
      </div>

      {/* Inventory Items List */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="rounded-2xl p-12 text-center">
          <Warehouse className="mx-auto size-12 text-muted-foreground/40" />
          <h3 className="mt-3 font-bold text-foreground">No matching inventory items</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || filter !== 'all'
              ? 'Try resetting search or filters.'
              : 'Add materials in the Materials catalog to start tracking stock.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="flex flex-col justify-between gap-4 rounded-2xl p-4 transition-all hover:border-primary/50 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-foreground">{item.name}</h3>
                  <Badge variant="outline" className="text-[10px]">
                    {item.category?.name}
                  </Badge>
                  {item.subCategory && (
                    <Badge variant="secondary" className="text-[10px]">
                      {item.subCategory}
                    </Badge>
                  )}
                  {item.isOutOfStock ? (
                    <Badge variant="destructive" className="text-[10px] uppercase">
                      Out of Stock
                    </Badge>
                  ) : item.isLowStock ? (
                    <Badge
                      variant="outline"
                      className="border-amber-300 bg-amber-50 text-[10px] text-amber-700 uppercase"
                    >
                      Low Stock
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-green-300 bg-green-50 text-[10px] text-green-700"
                    >
                      In Stock
                    </Badge>
                  )}
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {item.brand && <span>Brand: <strong className="text-foreground">{item.brand}</strong></span>}
                  {item.sku && <span>SKU: <strong className="text-foreground">{item.sku}</strong></span>}
                  {item.supplier && <span>Vendor: <strong className="text-foreground">{item.supplier}</strong></span>}
                  <span>Sell Price: <strong className="text-foreground">{formatINR(item.sellingPrice)}</strong> / {item.unit}</span>
                  {isSuperAdmin && (
                    <span>Cost: <strong className="text-foreground">{formatINR(item.purchaseCost)}</strong></span>
                  )}
                </div>
              </div>

              {/* Quantities display */}
              <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">On Hand</p>
                  <p className="text-lg font-bold text-foreground">
                    {item.currentStock} <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Reserved</p>
                  <p className="text-sm font-semibold text-amber-600">
                    {item.reservedQty} <span className="text-xs font-normal">{item.unit}</span>
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="text-sm font-extrabold text-emerald-600">
                    {item.availableQty} <span className="text-xs font-normal">{item.unit}</span>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 border-l pl-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAction('RECEIVE', item)}
                    className="h-9 gap-1 text-xs text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                    title="Receive goods from supplier"
                  >
                    <PackagePlus className="size-3.5" />
                    Receive
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAction('ISSUE', item)}
                    className="h-9 gap-1 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    title="Dispatch / Issue stock for order"
                  >
                    <PackageMinus className="size-3.5" />
                    Issue
                  </Button>

                  {isSuperAdmin && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openAction('ADJUST', item)}
                      className="size-9 p-0 text-muted-foreground hover:text-foreground"
                      title="Adjust / Reconcile stock"
                    >
                      <SlidersHorizontal className="size-4" />
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openHistory(item)}
                    className="size-9 p-0 text-muted-foreground hover:text-foreground"
                    title="View movement history"
                  >
                    <History className="size-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Action Dialog (Receive, Issue, Adjust) */}
      <Dialog open={activeAction !== null} onOpenChange={(open) => !open && setActiveAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {activeAction === 'RECEIVE' && `Receive Stock — ${selectedItem?.name}`}
              {activeAction === 'ISSUE' && `Issue / Dispatch Stock — ${selectedItem?.name}`}
              {activeAction === 'ADJUST' && `Reconcile Stock — ${selectedItem?.name}`}
            </DialogTitle>
            <DialogDescription>
              {activeAction === 'RECEIVE' && 'Add newly received inventory from suppliers.'}
              {activeAction === 'ISSUE' && 'Record materials dispatched to a bathroom project or customer site.'}
              {activeAction === 'ADJUST' && 'Update physical stock count to match warehouse inventory.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>Current stock: <strong className="text-foreground">{selectedItem?.currentStock} {selectedItem?.unit}</strong></p>
              <p>Allocated in approved quotes: <strong className="text-amber-600">{selectedItem?.reservedQty} {selectedItem?.unit}</strong></p>
            </div>

            <div className="space-y-1.5">
              <Label>
                {activeAction === 'RECEIVE' && `Quantity to Receive (${selectedItem?.unit}) *`}
                {activeAction === 'ISSUE' && `Quantity to Issue (${selectedItem?.unit}) *`}
                {activeAction === 'ADJUST' && `New Physical Stock Count (${selectedItem?.unit}) *`}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                placeholder={activeAction === 'ADJUST' ? String(selectedItem?.currentStock ?? 0) : '0'}
                className="h-11"
                autoFocus
              />
            </div>

            {activeAction === 'RECEIVE' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Unit Purchase Cost (₹)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={costInput}
                      onChange={(e) => setCostInput(e.target.value)}
                      placeholder="Cost"
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Supplier / Vendor</Label>
                    <Input
                      value={supplierInput}
                      onChange={(e) => setSupplierInput(e.target.value)}
                      placeholder="e.g. Kajaria Depot"
                      className="h-11"
                    />
                  </div>
                </div>
              </>
            )}

            {activeAction === 'ADJUST' && (
              <div className="space-y-1.5">
                <Label>Reason for Adjustment</Label>
                <Select value={reasonInput} onValueChange={setReasonInput}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Physical count adjustment">Physical count adjustment</SelectItem>
                    <SelectItem value="Damaged / Broken tiles">Damaged / Broken tiles</SelectItem>
                    <SelectItem value="Supplier return">Supplier return</SelectItem>
                    <SelectItem value="Internal usage / Display showroom">Showroom display usage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Notes / PO / Invoice Ref</Label>
              <Textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="Optional delivery notes or reference number..."
                rows={2}
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
            <Button variant="outline" onClick={() => setActiveAction(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAction}
              disabled={submitting}
              className="gap-2 bg-primary font-semibold text-white"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement History Dialog */}
      <Dialog open={historyItem !== null} onOpenChange={(open) => !open && setHistoryItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Stock Movement History — {historyItem?.name}</DialogTitle>
            <DialogDescription>
              Chronological log of receipts, dispatches, and inventory adjustments.
            </DialogDescription>
          </DialogHeader>

          {loadingHistory ? (
            <div className="flex justify-center p-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : historyMovements.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No transactions recorded for this product yet.
            </div>
          ) : (
            <div className="space-y-2">
              {historyMovements.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border p-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-bold',
                          tx.type === 'RECEIVED'
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : tx.type === 'ISSUED'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        )}
                      >
                        {tx.type}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        {tx.qty > 0 ? `+${tx.qty}` : tx.qty} {historyItem?.unit}
                      </span>
                    </div>
                    {tx.notes && <p className="text-muted-foreground">{tx.notes}</p>}
                    <p className="text-[11px] text-muted-foreground/80">
                      Logged by {tx.createdBy?.name ?? 'System'} · {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {tx.purchaseCost ? (
                    <span className="text-muted-foreground">{formatINR(tx.purchaseCost)} / unit</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
