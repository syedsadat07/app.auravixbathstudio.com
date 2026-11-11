'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Filter,
  History,
  Info,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react'

import { apiGet, apiPatch, apiPost, useApi, useDebounced } from '@/lib/client'
import { fmtDate, formatINR, initialsOf } from '@/lib/format'
import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'
import {
  REFUND_STATUSES,
  refundStatusLabels,
  refundStatusMeta,
  type RefundStatus,
} from '@/lib/status'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefundCommentItem {
  id: string
  userId: string
  userName: string
  userRole: string
  action: string
  statusFrom: string | null
  statusTo: string | null
  comment: string
  createdAt: string
}

interface RefundRecord {
  id: string
  refundNumber: string
  customerId: string
  quotationId: string | null
  orderId: string | null
  paymentId: string | null
  originalPaymentAmount: number
  requestedAmount: number
  approvedAmount: number
  completedAmount: number
  reason: string
  status: RefundStatus
  processingRef: string | null
  paymentMethod: string
  internalNotes: string | null
  requestedById: string
  reviewedById: string | null
  reviewedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  customer: {
    id: string
    name: string
    phone: string
    email?: string | null
    city?: string | null
  }
  quotation?: {
    id: string
    quotationNumber: string
    status: string
  } | null
  payment?: {
    id: string
    paymentNumber: string
    amount: number
    method: string
    reference: string | null
  } | null
  requestedBy: {
    id: string
    name: string
    role: string
  }
  reviewedBy?: {
    id: string
    name: string
    role: string
  } | null
  _count?: {
    comments: number
  }
  comments?: RefundCommentItem[]
}

interface RefundsApiResponse {
  refunds: RefundRecord[]
  stats: {
    totalCount: number
    requestedCount: number
    reviewCount: number
    approvedCount: number
    processingCount: number
    completedCount: number
    totalRequestedAmount: number
    totalApprovedAmount: number
    totalDisbursedAmount: number
  }
}

// ---------------------------------------------------------------------------
// RefundsView Component
// ---------------------------------------------------------------------------

export default function RefundsView() {
  const { user } = useAuth()
  const { params, navigate } = useNav()
  const isSuper = user?.role === 'SUPER_ADMIN'

  // Filter state
  const [activeTab, setActiveTab] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const debouncedSearch = useDebounced(searchQuery, 300)

  // Modals & Drawers
  const [requestDialogOpen, setRequestDialogOpen] = useState<boolean>(false)
  const [selectedRefundId, setSelectedRefundId] = useState<string | null>(null)
  const [statusConfirmModal, setStatusConfirmModal] = useState<{
    targetStatus: RefundStatus
    refund: RefundRecord
  } | null>(null)

  // Status Action Form State
  const [actionApprovedAmount, setActionApprovedAmount] = useState<string>('')
  const [actionCompletedAmount, setActionCompletedAmount] = useState<string>('')
  const [actionProcessingRef, setActionProcessingRef] = useState<string>('')
  const [actionComment, setActionComment] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<boolean>(false)

  // Comment Form State
  const [newCommentText, setNewCommentText] = useState<string>('')
  const [commentSubmitting, setCommentSubmitting] = useState<boolean>(false)

  // Fetch Refunds list
  const qs = useMemo(() => {
    const sp = new URLSearchParams()
    if (activeTab !== 'ALL') sp.set('status', activeTab)
    if (debouncedSearch) sp.set('search', debouncedSearch)
    if (params?.customerId) sp.set('customerId', params.customerId)
    if (params?.quotationId) sp.set('quotationId', params.quotationId)
    return sp.toString()
  }, [activeTab, debouncedSearch, params])

  const { data, loading, refresh: refreshList } = useApi<RefundsApiResponse>(`/api/refunds?${qs}`)

  // Selected Refund Detail
  const { data: detailData, refresh: refreshDetail, loading: detailLoading } = useApi<{
    refund: RefundRecord
  }>(selectedRefundId ? `/api/refunds/${selectedRefundId}` : null)

  const activeRefund = detailData?.refund || data?.refunds.find((r) => r.id === selectedRefundId)

  // Reset action fields when opening status transition modal
  const openStatusTransition = (refund: RefundRecord, targetStatus: RefundStatus) => {
    setActionApprovedAmount(String(refund.approvedAmount > 0 ? refund.approvedAmount : refund.requestedAmount))
    setActionCompletedAmount(String(refund.approvedAmount > 0 ? refund.approvedAmount : refund.requestedAmount))
    setActionProcessingRef(refund.processingRef || '')
    setActionComment('')
    setStatusConfirmModal({ targetStatus, refund })
  }

  // Handle status update submission
  const handleStatusTransitionSubmit = async () => {
    if (!statusConfirmModal) return
    const { targetStatus, refund } = statusConfirmModal

    const payload: Record<string, unknown> = {
      status: targetStatus,
      comment: actionComment.trim() || undefined,
    }

    if (targetStatus === 'APPROVED') {
      const amt = Number(actionApprovedAmount)
      if (!amt || amt <= 0) {
        toast.error('Please enter a valid approved amount greater than 0')
        return
      }
      if (amt > refund.requestedAmount) {
        toast.error(`Approved amount cannot exceed requested amount of ${formatINR(refund.requestedAmount)}`)
        return
      }
      payload.approvedAmount = amt
    }

    if (targetStatus === 'REFUNDED' || targetStatus === 'PARTIALLY_REFUNDED') {
      const amt = Number(actionCompletedAmount)
      if (!amt || amt <= 0) {
        toast.error('Please enter the exact disbursed amount')
        return
      }
      if (!actionProcessingRef.trim()) {
        toast.error('Bank UTR or Payment Gateway Refund Reference is mandatory')
        return
      }
      payload.completedAmount = amt
      payload.processingRef = actionProcessingRef.trim()
    }

    if (targetStatus === 'PROCESSING') {
      if (actionProcessingRef.trim()) {
        payload.processingRef = actionProcessingRef.trim()
      }
    }

    try {
      setActionLoading(true)
      await apiPatch(`/api/refunds/${refund.id}`, payload)
      toast.success(`Refund status updated to ${refundStatusLabels[targetStatus]}`)
      setStatusConfirmModal(null)
      refreshList()
      if (selectedRefundId) refreshDetail()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update refund status')
    } finally {
      setActionLoading(false)
    }
  }

  // Add Comment
  const handleAddComment = async () => {
    if (!selectedRefundId || !newCommentText.trim()) return
    try {
      setCommentSubmitting(true)
      await apiPost(`/api/refunds/${selectedRefundId}/comments`, {
        comment: newCommentText.trim(),
      })
      toast.success('Internal comment recorded')
      setNewCommentText('')
      refreshDetail()
    } catch (err: any) {
      toast.error(err.message || 'Failed to post comment')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const refunds = data?.refunds || []
  const stats = data?.stats

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Refund Status Management
            </h1>
            <Badge variant="outline" className="border-orange-200 bg-orange-50 text-xs font-semibold text-primary">
              Financial Workflow
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Enforce multi-step verification, administrative approvals, and gateway disbursement tracking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshList()
              if (selectedRefundId) refreshDetail()
            }}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setRequestDialogOpen(true)}
            className="gap-1.5 font-semibold shadow-sm"
          >
            <Plus className="size-4" />
            Request Refund
          </Button>
        </div>
      </div>

      {/* Financial KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Total Requested</span>
            <RotateCcw className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-foreground sm:text-2xl">
            {formatINR(stats?.totalRequestedAmount || 0)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.totalCount || 0} total refund requests
          </p>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Under Review</span>
            <Clock className="size-4 text-purple-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-foreground sm:text-2xl">
            {stats?.reviewCount || 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pending administrative audit
          </p>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Approved Pending Payout</span>
            <ShieldCheck className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-blue-700 sm:text-2xl">
            {formatINR(stats?.totalApprovedAmount || 0)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.approvedCount || 0} approved by Super Admin
          </p>
        </Card>

        <Card className="p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Total Disbursed</span>
            <Banknote className="size-4 text-green-600" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-green-700 sm:text-2xl">
            {formatINR(stats?.totalDisbursedAmount || 0)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats?.completedCount || 0} confirmed with UTR / Payout
          </p>
        </Card>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by refund #, customer, order #, or UTR..."
            className="pl-9 h-10"
          />
        </div>

        <div className="overflow-x-auto pb-1 sm:pb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="h-10 bg-muted/60 p-1">
              <TabsTrigger value="ALL" className="text-xs px-3">
                All
              </TabsTrigger>
              <TabsTrigger value="REFUND_REQUESTED" className="text-xs px-3">
                Requested
              </TabsTrigger>
              <TabsTrigger value="UNDER_REVIEW" className="text-xs px-3">
                Under Review
              </TabsTrigger>
              <TabsTrigger value="APPROVED" className="text-xs px-3">
                Approved
              </TabsTrigger>
              <TabsTrigger value="PROCESSING" className="text-xs px-3">
                Processing
              </TabsTrigger>
              <TabsTrigger value="REFUNDED" className="text-xs px-3">
                Refunded
              </TabsTrigger>
              <TabsTrigger value="REJECTED" className="text-xs px-3">
                Rejected
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Refunds Table / List */}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : refunds.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center shadow-sm">
          <RotateCcw className="size-12 text-muted-foreground/40" />
          <h3 className="mt-4 text-base font-bold text-foreground">No Refund Records Found</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {searchQuery
              ? 'No refund requests matched your search criteria.'
              : 'There are currently no refund requests in this view.'}
          </p>
          <Button
            size="sm"
            onClick={() => setRequestDialogOpen(true)}
            className="mt-4 gap-1.5"
          >
            <Plus className="size-4" />
            Create First Refund Request
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {refunds.map((refund) => {
            const meta = refundStatusMeta[refund.status] || {
              label: refund.status,
              badge: 'bg-stone-100 text-stone-700',
              desc: '',
            }

            return (
              <Card
                key={refund.id}
                className={cn(
                  'transition-all hover:border-primary/40 hover:shadow-md p-4 sm:p-5',
                  selectedRefundId === refund.id && 'ring-2 ring-primary/60 border-primary'
                )}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left Column: Refund ID + Customer Info + Reason */}
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-foreground">
                        {refund.refundNumber}
                      </span>
                      <Badge variant="outline" className={cn('text-xs font-semibold px-2 py-0.5', meta.badge)}>
                        {meta.label}
                      </Badge>
                      {refund.paymentMethod && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 uppercase">
                          {refund.paymentMethod}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-bold text-foreground">{refund.customer.name}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{refund.customer.phone}</span>
                      {refund.quotation && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium text-primary">
                            Quote: {refund.quotation.quotationNumber}
                          </span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 italic">
                      &quot;{refund.reason}&quot;
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 text-[11px] text-muted-foreground">
                      <span>Requested: {fmtDate(refund.createdAt)}</span>
                      <span>By: {refund.requestedBy.name} ({refund.requestedBy.role})</span>
                      {refund.processingRef && (
                        <span className="font-mono font-semibold text-stone-700">
                          Ref: {refund.processingRef}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Column: Amounts */}
                  <div className="flex flex-wrap items-center gap-4 lg:gap-8 border-t lg:border-t-0 lg:border-l pt-3 lg:pt-0 lg:pl-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Requested
                      </p>
                      <p className="text-base font-extrabold text-foreground">
                        {formatINR(refund.requestedAmount)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Approved
                      </p>
                      <p className={cn(
                        'text-base font-extrabold',
                        refund.approvedAmount > 0 ? 'text-blue-700' : 'text-muted-foreground'
                      )}>
                        {refund.approvedAmount > 0 ? formatINR(refund.approvedAmount) : '—'}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Disbursed
                      </p>
                      <p className={cn(
                        'text-base font-extrabold',
                        refund.completedAmount > 0 ? 'text-green-700' : 'text-muted-foreground'
                      )}>
                        {refund.completedAmount > 0 ? formatINR(refund.completedAmount) : '₹0'}
                      </p>
                    </div>

                    {/* Right Action Button */}
                    <div className="flex items-center gap-2 ml-auto lg:ml-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRefundId(refund.id)}
                        className="font-semibold text-xs"
                      >
                        Workflow &amp; Audit
                        <ArrowRight className="size-3.5 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* REFUND DETAIL & WORKFLOW DRAWER / DIALOG */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!selectedRefundId} onOpenChange={(open) => !open && setSelectedRefundId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {activeRefund ? (
            <div className="space-y-6">
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-xl font-bold font-mono">
                      {activeRefund.refundNumber}
                    </DialogTitle>
                    <Badge variant="outline" className={cn('text-xs font-semibold', refundStatusMeta[activeRefund.status]?.badge)}>
                      {refundStatusLabels[activeRefund.status]}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Created {fmtDate(activeRefund.createdAt)}
                  </span>
                </div>
                <DialogDescription>
                  Workflow lifecycle, financial verification, and immutable audit trail.
                </DialogDescription>
              </DialogHeader>

              {/* Workflow Stepper */}
              <div className="rounded-xl border bg-stone-50/60 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Workflow Progression
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className={cn(
                    'rounded-lg p-2 text-xs font-semibold border',
                    ['REFUND_REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(activeRefund.status)
                      ? 'bg-amber-100/80 border-amber-300 text-amber-800'
                      : 'bg-stone-100 text-stone-400 border-stone-200'
                  )}>
                    1. Requested
                  </div>
                  <div className={cn(
                    'rounded-lg p-2 text-xs font-semibold border',
                    ['UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(activeRefund.status)
                      ? 'bg-purple-100/80 border-purple-300 text-purple-800'
                      : 'bg-stone-100 text-stone-400 border-stone-200'
                  )}>
                    2. Under Review
                  </div>
                  <div className={cn(
                    'rounded-lg p-2 text-xs font-semibold border',
                    ['APPROVED', 'PROCESSING', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(activeRefund.status)
                      ? 'bg-blue-100/80 border-blue-300 text-blue-800'
                      : 'bg-stone-100 text-stone-400 border-stone-200'
                  )}>
                    3. Approved
                  </div>
                  <div className={cn(
                    'rounded-lg p-2 text-xs font-semibold border',
                    ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(activeRefund.status)
                      ? 'bg-green-100/80 border-green-300 text-green-800'
                      : activeRefund.status === 'PROCESSING'
                      ? 'bg-indigo-100/80 border-indigo-300 text-indigo-800 animate-pulse'
                      : 'bg-stone-100 text-stone-400 border-stone-200'
                  )}>
                    4. Disbursed
                  </div>
                </div>

                {activeRefund.status === 'REJECTED' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700 border border-red-200">
                    <XCircle className="size-4 shrink-0" />
                    This refund request was rejected during review.
                  </div>
                )}
                {activeRefund.status === 'FAILED' && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-xs font-semibold text-rose-700 border border-rose-200">
                    <AlertCircle className="size-4 shrink-0" />
                    Payout failed with payment provider. Check bank reference and re-attempt.
                  </div>
                )}
              </div>

              {/* Core Financial Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y py-4 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
                  <p className="font-bold text-foreground mt-0.5">{activeRefund.customer.name}</p>
                  <p className="text-xs text-muted-foreground">{activeRefund.customer.phone}</p>
                  {activeRefund.customer.email && (
                    <p className="text-xs text-muted-foreground">{activeRefund.customer.email}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quotation &amp; Order</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {activeRefund.quotation?.quotationNumber || 'Direct Account Request'}
                  </p>
                  {activeRefund.payment && (
                    <p className="text-xs text-muted-foreground">
                      Linked Payment: {activeRefund.payment.paymentNumber} ({formatINR(activeRefund.payment.amount)})
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Financial Summary</p>
                  <div className="mt-1 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Requested Amount:</span>
                      <span className="font-bold">{formatINR(activeRefund.requestedAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Approved Amount:</span>
                      <span className="font-bold text-blue-700">
                        {activeRefund.approvedAmount > 0 ? formatINR(activeRefund.approvedAmount) : 'Pending Approval'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Completed (Disbursed):</span>
                      <span className="font-bold text-green-700">
                        {activeRefund.completedAmount > 0 ? formatINR(activeRefund.completedAmount) : '₹0 (Not Yet Paid)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Disbursement Tracking</p>
                  <div className="mt-1 space-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Method: </span>
                      <span className="font-medium">{activeRefund.paymentMethod || 'Bank Transfer'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">UTR / Gateway Ref: </span>
                      <span className="font-mono font-bold text-foreground">
                        {activeRefund.processingRef || 'Not assigned yet'}
                      </span>
                    </div>
                    {activeRefund.completedAt && (
                      <div>
                        <span className="text-muted-foreground">Completed At: </span>
                        <span>{fmtDate(activeRefund.completedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Refund Reason & Internal Notes */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Refund Reason</p>
                  <p className="mt-1 rounded-lg bg-stone-50 p-2.5 text-xs text-foreground border">
                    {activeRefund.reason}
                  </p>
                </div>
                {activeRefund.internalNotes && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Internal Notes</p>
                    <p className="mt-1 rounded-lg bg-amber-50/50 p-2.5 text-xs text-amber-900 border border-amber-200">
                      {activeRefund.internalNotes}
                    </p>
                  </div>
                )}
              </div>

              {/* Super Admin Status Transition Controls */}
              {isSuper && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                    <ShieldCheck className="size-4" />
                    Administrative Actions (Super Admin Only)
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* UNDER_REVIEW */}
                    {activeRefund.status === 'REFUND_REQUESTED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusTransition(activeRefund, 'UNDER_REVIEW')}
                        className="text-xs font-semibold"
                      >
                        Move to Review
                      </Button>
                    )}

                    {/* APPROVE */}
                    {['REFUND_REQUESTED', 'UNDER_REVIEW'].includes(activeRefund.status) && (
                      <Button
                        size="sm"
                        onClick={() => openStatusTransition(activeRefund, 'APPROVED')}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                      >
                        Approve Refund
                      </Button>
                    )}

                    {/* REJECT */}
                    {['REFUND_REQUESTED', 'UNDER_REVIEW'].includes(activeRefund.status) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openStatusTransition(activeRefund, 'REJECTED')}
                        className="text-xs font-semibold"
                      >
                        Reject Request
                      </Button>
                    )}

                    {/* PROCESSING */}
                    {activeRefund.status === 'APPROVED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusTransition(activeRefund, 'PROCESSING')}
                        className="text-xs font-semibold text-indigo-700 border-indigo-300"
                      >
                        Mark as Processing
                      </Button>
                    )}

                    {/* CONFIRM DISBURSED / REFUNDED */}
                    {['APPROVED', 'PROCESSING'].includes(activeRefund.status) && (
                      <Button
                        size="sm"
                        onClick={() => openStatusTransition(activeRefund, 'REFUNDED')}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                      >
                        Confirm Payout &amp; Disburse
                      </Button>
                    )}

                    {/* FAIL */}
                    {activeRefund.status === 'PROCESSING' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openStatusTransition(activeRefund, 'FAILED')}
                        className="text-xs font-semibold text-rose-700 border-rose-300"
                      >
                        Mark as Failed
                      </Button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground italic">
                    Rule: Approving a refund records the authorized amount. Money returned is ONLY updated upon providing a bank/gateway UTR confirmation.
                  </p>
                </div>
              )}

              {/* Internal Comments & Audit Trail */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Audit Trail &amp; Internal Comments
                  </p>
                </div>

                {/* Comment Input */}
                <div className="flex gap-2">
                  <Input
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="Add an internal note or audit observation..."
                    className="h-9 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleAddComment()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddComment}
                    disabled={commentSubmitting || !newCommentText.trim()}
                    className="h-9 gap-1 text-xs font-semibold"
                  >
                    {commentSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                    Post
                  </Button>
                </div>

                {/* Comment Timeline */}
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {activeRefund.comments && activeRefund.comments.length > 0 ? (
                    activeRefund.comments.map((c) => (
                      <div key={c.id} className="rounded-lg bg-stone-50 border p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="font-semibold text-foreground">
                            {c.userName} ({c.userRole})
                          </span>
                          <span className="text-[10px]">{fmtDate(c.createdAt)}</span>
                        </div>
                        <p className="text-stone-700">{c.comment}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      No comments recorded yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin mx-auto mb-2" />
              Loading refund details…
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* STATUS TRANSITION CONFIRMATION MODAL */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!statusConfirmModal} onOpenChange={(open) => !open && setStatusConfirmModal(null)}>
        <DialogContent className="max-w-md">
          {statusConfirmModal && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-base font-bold">
                  Confirm Status Change: {refundStatusLabels[statusConfirmModal.targetStatus]}
                </DialogTitle>
                <DialogDescription>
                  Refund {statusConfirmModal.refund.refundNumber} for {statusConfirmModal.refund.customer.name}
                </DialogDescription>
              </DialogHeader>

              {/* If target is APPROVED: prompt for approved amount */}
              {statusConfirmModal.targetStatus === 'APPROVED' && (
                <div className="space-y-2">
                  <Label htmlFor="appAmt" className="text-xs font-bold">
                    Approved Amount (₹) *
                  </Label>
                  <Input
                    id="appAmt"
                    type="number"
                    value={actionApprovedAmount}
                    onChange={(e) => setActionApprovedAmount(e.target.value)}
                    max={statusConfirmModal.refund.requestedAmount}
                    placeholder="Enter approved amount"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Requested amount: {formatINR(statusConfirmModal.refund.requestedAmount)}. Can be partial or full.
                  </p>
                </div>
              )}

              {/* If target is REFUNDED / PARTIALLY_REFUNDED: prompt for disbursed amount and UTR */}
              {['REFUNDED', 'PARTIALLY_REFUNDED'].includes(statusConfirmModal.targetStatus) && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="compAmt" className="text-xs font-bold">
                      Completed Disbursed Amount (₹) *
                    </Label>
                    <Input
                      id="compAmt"
                      type="number"
                      value={actionCompletedAmount}
                      onChange={(e) => setActionCompletedAmount(e.target.value)}
                      placeholder="Actual amount returned to customer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="utrRef" className="text-xs font-bold">
                      Bank UTR / Gateway Reference *
                    </Label>
                    <Input
                      id="utrRef"
                      value={actionProcessingRef}
                      onChange={(e) => setActionProcessingRef(e.target.value)}
                      placeholder="e.g. UTR123456789 or PAY_RF_98765"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Mandatory audit reference to prove disbursal to customer account.
                    </p>
                  </div>
                </div>
              )}

              {/* If target is PROCESSING: prompt for optional ref */}
              {statusConfirmModal.targetStatus === 'PROCESSING' && (
                <div className="space-y-1.5">
                  <Label htmlFor="procRef" className="text-xs font-bold">
                    Bank Reference / Payout ID (Optional)
                  </Label>
                  <Input
                    id="procRef"
                    value={actionProcessingRef}
                    onChange={(e) => setActionProcessingRef(e.target.value)}
                    placeholder="e.g. UTR or batch ID"
                  />
                </div>
              )}

              {/* Optional Comment for Audit */}
              <div className="space-y-1.5">
                <Label htmlFor="transComment" className="text-xs font-bold">
                  Audit Comment (Optional)
                </Label>
                <Textarea
                  id="transComment"
                  rows={2}
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  placeholder="Reason or notes regarding this status change..."
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStatusConfirmModal(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleStatusTransitionSubmit}
                  disabled={actionLoading}
                  className="gap-1.5 font-semibold"
                >
                  {actionLoading && <Loader2 className="size-3.5 animate-spin" />}
                  Confirm Update
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* REQUEST REFUND DIALOG */}
      {/* ------------------------------------------------------------------- */}
      <RequestRefundDialog
        open={requestDialogOpen}
        onOpenChange={setRequestDialogOpen}
        onSuccess={() => {
          refreshList()
          setRequestDialogOpen(false)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Request Refund Dialog Component
// ---------------------------------------------------------------------------

function RequestRefundDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [customerId, setCustomerId] = useState<string>('')
  const [quotationId, setQuotationId] = useState<string>('')
  const [paymentId, setPaymentId] = useState<string>('')
  const [requestedAmount, setRequestedAmount] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('BANK_TRANSFER')
  const [internalNotes, setInternalNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Fetch Customers & Quotations
  const { data: customerData } = useApi<{ customers: Array<{ id: string; name: string; phone: string }> }>(
    open ? '/api/customers' : null
  )
  const { data: quoteData } = useApi<{ quotations: Array<{ id: string; quotationNumber: string; customer: { id: string } }> }>(
    open ? '/api/quotations' : null
  )

  const customerList = customerData?.customers || []
  const availableQuotes = (quoteData?.quotations || []).filter(
    (q) => !customerId || q.customer?.id === customerId
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerId) {
      toast.error('Please select a customer')
      return
    }
    const amt = Number(requestedAmount)
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid requested refund amount')
      return
    }
    if (!reason.trim()) {
      toast.error('Refund reason is required')
      return
    }

    try {
      setSubmitting(true)
      await apiPost('/api/refunds', {
        customerId,
        quotationId: quotationId || undefined,
        paymentId: paymentId || undefined,
        requestedAmount: amt,
        reason: reason.trim(),
        paymentMethod,
        internalNotes: internalNotes.trim() || undefined,
      })
      toast.success('Refund request initiated successfully')
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit refund request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Request a Customer Refund</DialogTitle>
          <DialogDescription>
            Initiates an official refund review workflow. Final disbursement requires Super Admin approval.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customerList.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name} ({c.phone})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quotation Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Related Quotation / Order (Optional)</Label>
            <Select value={quotationId} onValueChange={setQuotationId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select quotation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  None (Direct Account Refund)
                </SelectItem>
                {availableQuotes.map((q) => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    {q.quotationNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Requested Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="reqAmt" className="text-xs font-bold">
              Requested Refund Amount (₹) *
            </Label>
            <Input
              id="reqAmt"
              type="number"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              placeholder="e.g. 25000"
              className="h-9"
              required
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Disbursement Mode</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER" className="text-xs">Bank Transfer (NEFT/RTGS/IMPS)</SelectItem>
                <SelectItem value="UPI" className="text-xs">UPI</SelectItem>
                <SelectItem value="ORIGINAL_PAYMENT_METHOD" className="text-xs">Original Payment Source (Gateway)</SelectItem>
                <SelectItem value="CHEQUE" className="text-xs">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="refReason" className="text-xs font-bold">
              Refund Reason *
            </Label>
            <Textarea
              id="refReason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain the reason for this refund request..."
              className="text-xs"
              required
            />
          </div>

          {/* Internal Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="intNotes" className="text-xs font-bold">
              Internal Comments / Audit Notes (Optional)
            </Label>
            <Textarea
              id="intNotes"
              rows={2}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Any operational or account details..."
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="gap-1.5 font-semibold"
            >
              {submitting && <Loader2 className="size-3.5 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

