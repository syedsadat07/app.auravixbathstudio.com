/** Formatting helpers — Indian numbering for currency, en-IN dates. */

export function formatINR(value: number | null | undefined, withSymbol = true): string {
  const n = Math.round(Number(value) || 0)
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(n)
  return withSymbol ? `₹${formatted}` : formatted
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(d)
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
    .format(d)
    .replace(',', ',')
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = typeof value === 'string' ? new Date(value) : value
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  }).format(d)
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return fmtDate(d)
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

export function areaLabel(area: number | null | undefined): string {
  const n = Number(area) || 0
  return `${Number.isInteger(n) ? n : n.toFixed(2)} sq.ft`
}
