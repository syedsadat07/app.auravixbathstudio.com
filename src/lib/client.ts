'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export class ApiClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null) || `Request failed (${res.status})`
    throw new ApiClientError(res.status, message)
  }
  return data as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body ?? {})
}
export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body ?? {})
}
export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body ?? {})
}
export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path)
}

export interface UseApiState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

/** Simple data-fetching hook with manual refresh. */
export function useApi<T>(path: string | null, deps: unknown[] = []): UseApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const mounted = useRef(true)
  const pathRef = useRef(path)
  pathRef.current = path

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const p = pathRef.current
    if (!p) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await apiGet<T>(p)
      if (mounted.current) setData(result)
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setData(null)
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [path, ...deps])

  return { data, error, loading, refresh: load, setData }
}

/** Debounced value helper for search inputs. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
