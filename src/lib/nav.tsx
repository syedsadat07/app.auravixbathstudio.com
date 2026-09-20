'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

// ---------------------------------------------------------------------------
// Hash-based SPA navigation (single page route constraint).
// Routes look like: #/dashboard, #/leads?tab=scheduled, #/quotations/abc, ...
// ---------------------------------------------------------------------------

export type AppView =
  | 'dashboard'
  | 'leads'
  | 'lead-detail'
  | 'customers'
  | 'customer-detail'
  | 'quotations'
  | 'quotation-wizard'
  | 'quotation-detail'
  | 'orders'
  | 'appointments'
  | 'materials'
  | 'packages'
  | 'reports'
  | 'admins'
  | 'settings'
  | 'audit-logs'

export interface ViewParams {
  [key: string]: string | undefined
}

export interface NavState {
  view: AppView
  params: ViewParams
  navigate: (view: AppView, params?: ViewParams) => void
  back: () => void
}

const NavContext = createContext<NavState | null>(null)

export function parseHash(hash: string): { view: AppView; params: ViewParams } {
  const clean = hash.replace(/^#\/?/, '')
  const [path, query] = clean.split('?')
  const view = (path || 'dashboard') as AppView
  const params: ViewParams = {}
  if (query) {
    for (const pair of query.split('&')) {
      const [k, v] = pair.split('=')
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    }
  }
  return { view, params }
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [hash, setHash] = useState('')

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    onChange()
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const { view, params } = useMemo(() => parseHash(hash || '#/dashboard'), [hash])

  const navigate = useCallback((v: AppView, p?: ViewParams) => {
    const qs = p && Object.keys(p).length
      ? '?' + Object.entries(p)
          .filter(([, val]) => val !== undefined && val !== '')
          .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`)
          .join('&')
      : ''
    window.location.hash = `#/${v}${qs}`
    // scroll top on view change
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
  }, [])

  const back = useCallback(() => {
    window.history.back()
  }, [])

  const value = useMemo(() => ({ view, params, navigate, back }), [view, params, navigate, back])
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav(): NavState {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used inside NavProvider')
  return ctx
}

/** Provided for convenience; SPA doesn't rely on pathname but some hooks want it. */
export function usePathnameSafe(): string {
  try {
    return usePathname() || '/'
  } catch {
    return '/'
  }
}
