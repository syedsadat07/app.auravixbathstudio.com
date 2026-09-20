'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '@/lib/client'

export interface SessionUser {
  id: string
  name: string
  username: string
  email: string
  role: 'SUPER_ADMIN' | 'ADMIN' | string
  status: string
  mustChangePassword: boolean
}

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  refreshUser: () => Promise<SessionUser | null>
  login: (email: string, password: string) => Promise<SessionUser>
  logout: () => Promise<void>
  isSuperAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const data = await apiGet<{ user: SessionUser }>('/api/auth/me')
      setUser(data.user)
      return data.user
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiPost<{ user: SessionUser }>('/api/auth/login', { email, password })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      refreshUser,
      login,
      logout,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
    }),
    [user, loading, refreshUser, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
