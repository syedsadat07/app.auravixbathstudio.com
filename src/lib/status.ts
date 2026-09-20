/** Status metadata → Tailwind badge classes + display labels. */

export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'CONSULTATION_SCHEDULED',
  'MEETING_DONE',
  'QUOTE_PREPARING',
  'QUOTE_SHARED',
  'FOLLOW_UP',
  'CONVERTED',
  'CLOSED_LOST',
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const leadStatusLabels: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  CONSULTATION_SCHEDULED: 'Meeting Scheduled',
  MEETING_DONE: 'Meeting Done',
  QUOTE_PREPARING: 'Quote Preparing',
  QUOTE_SHARED: 'Quote Shared',
  FOLLOW_UP: 'Follow-up',
  CONVERTED: 'Converted',
  CLOSED_LOST: 'Closed Lost',
}

export const leadStatusMeta: Record<string, { label: string; sub?: string; badge: string }> = {
  NEW: { label: 'New', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
  CONTACTED: { label: 'Contacted', badge: 'bg-sky-50 text-sky-700 border-sky-200' },
  CONSULTATION_SCHEDULED: {
    label: 'Meeting Scheduled',
    sub: 'Appointment Fixed',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  MEETING_DONE: { label: 'Meeting Done', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  QUOTE_PREPARING: { label: 'Quote Preparing', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  QUOTE_SHARED: { label: 'Quote Shared', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  FOLLOW_UP: { label: 'Follow-up', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  CONVERTED: { label: 'Converted', badge: 'bg-green-50 text-green-700 border-green-200' },
  CLOSED_LOST: { label: 'Closed Lost', badge: 'bg-red-50 text-red-600 border-red-200' },
}

export const lostReasonLabels: Record<string, string> = {
  CANCELLED_PLANS: 'Cancelled Plans',
  BUDGET: 'Lost Due to Budget',
  COMPETITOR: 'Competitor',
  NOT_RESPONDING: 'Not Responding',
  LOCATION_ISSUE: 'Location Issue',
  TIMELINE_ISSUE: 'Timeline Issue',
  OTHER: 'Other',
}

export const QUOTE_STATUSES = [
  'DRAFT',
  'UNDER_REVIEW',
  'PUBLISHED',
  'QUOTE_SHARED',
  'TC_ACCEPTED',
  'PAYMENT_PENDING',
  'PAYMENT_RECEIVED',
  'ORDER_CONFIRMED',
  'ORDER_FREEZE',
  'EXPIRED',
  'CANCELLED',
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const quoteStatusMeta: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: 'Draft', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
  UNDER_REVIEW: { label: 'Under Review', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  PUBLISHED: { label: 'Published', badge: 'bg-green-50 text-green-700 border-green-200' },
  QUOTE_SHARED: { label: 'Quote Shared', badge: 'bg-violet-50 text-violet-700 border-violet-200' },
  TC_ACCEPTED: { label: 'T&C Accepted', badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  PAYMENT_PENDING: { label: 'Payment Pending', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  PAYMENT_RECEIVED: { label: 'Payment Received', badge: 'bg-green-50 text-green-700 border-green-200' },
  ORDER_CONFIRMED: { label: 'Order Confirmed', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ORDER_FREEZE: { label: 'Order Freeze', badge: 'bg-stone-800 text-stone-100 border-stone-700' },
  EXPIRED: { label: 'Expired', badge: 'bg-red-50 text-red-600 border-red-200' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-red-50 text-red-700 border-red-300' },
}

export const ORDER_FLAG_STATUSES = ['TC_ACCEPTED', 'PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_FREEZE']

export const appointmentStatusMeta: Record<string, { label: string; badge: string }> = {
  SCHEDULED: { label: 'Scheduled', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  DONE: { label: 'Done', badge: 'bg-green-50 text-green-700 border-green-200' },
  CANCELLED: { label: 'Cancelled', badge: 'bg-red-50 text-red-600 border-red-200' },
}

export const bathroomTypeLabels: Record<string, string> = {
  MASTER: 'Master Bathroom',
  COMMON: 'Common Bathroom',
  GUEST: 'Guest Bathroom',
  ATTACHED: 'Attached Bathroom',
  POWDER_ROOM: 'Powder Room',
  OTHER: 'Other',
}

export const versionTypeLabels: Record<string, string> = {
  INITIAL: 'Initial Quote',
  UPGRADED: 'Upgraded Quote',
  REVISED: 'Revised Quote',
}

export const quantityRuleLabels: Record<string, string> = {
  AREA: 'Area-based (tiles)',
  PIECE: 'Per piece / unit',
  FIXED: 'Fixed quantity (1)',
}

export const unitOptions = ['sq.ft', 'sq.m', 'piece', 'set', 'unit', 'meter', 'running ft', 'kg', 'litre']
