'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginView() {
  const { login } = useAuth()
  const { navigate } = useNav()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    if (!email.trim() || !password) {
      setError('Please enter your email/username and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const user = await login(email.trim(), password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`)
      navigate('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4 pb-safe">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        {/* Brand */}
        <div className="text-center">
          <img
            src="/brand/logo.png"
            alt="AURAVIX BATH STUDIO logo"
            className="mx-auto h-20 w-20 rounded-2xl object-cover"
          />
          <h1 className="mt-4 text-2xl font-extrabold tracking-widest text-foreground">AURAVIX</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            Bath Studio
          </p>
        </div>

        {/* Heading */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-foreground">Welcome Back</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to the Quotation &amp; Lead Management System
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email or username</Label>
            <Input
              id="login-email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@auravixbathstudio.com"
              className="h-11"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-11 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="h-11 w-full bg-primary text-base font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              'Login'
            )}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => toast.info('Contact a Super Admin to reset your password.')}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  )
}
