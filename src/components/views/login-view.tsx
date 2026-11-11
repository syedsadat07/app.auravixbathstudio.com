'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'

import { useAuth } from '@/lib/auth-context'
import { useNav } from '@/lib/nav'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShaderAnimation } from '@/components/ui/shader-animation'

export default function LoginView() {
  const { login } = useAuth()
  const { navigate } = useNav()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forgotMsg, setForgotMsg] = useState(false)
  const [shaderFailed, setShaderFailed] = useState(false)
  const [bgMode, setBgMode] = useState<'shader' | 'silk'>('shader')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Soft, smooth, luxurious silk light waves shader background
  useEffect(() => {
    if (bgMode !== 'silk') return
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const gl = canvas.getContext('webgl', { alpha: false, antialias: true })
    if (!gl) {
      setShaderFailed(true)
      return
    }

    const vertexSource = `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `

    // Smooth, flowing silk and marble refractions matching reference
    const fragmentSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;

      void main(void) {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);

        // Elegant diagonal angle (~35 deg)
        float angle = 0.62;
        float c = cos(angle);
        float s = sin(angle);
        vec2 rot = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

        float t = time * 0.16;

        // Smooth, broad, gentle silk waves without sharp spikes
        float wave1 = sin(rot.x * 1.6 + sin(rot.y * 1.1 + t * 0.5) * 1.1 + t * 0.35);
        float wave2 = cos(rot.x * 2.1 - cos(rot.y * 1.3 - t * 0.4) * 0.9 - t * 0.3);
        float wave3 = sin(rot.x * 3.0 + rot.y * 0.5 + t * 0.2) * 0.35;

        float pattern = (wave1 + wave2 + wave3) / 2.45;
        pattern = smoothstep(-0.85, 0.85, pattern);

        // Delicate pearl sheen
        float sheen = pow(smoothstep(-0.35, 0.95, sin(rot.x * 1.8 + rot.y * 1.2 + t * 0.45)), 2.6) * 0.3;

        // Luxury warm alabaster & champagne palette
        vec3 base = vec3(0.965, 0.958, 0.947);      // #f6f4f1 soft ivory alabaster
        vec3 shade = vec3(0.915, 0.898, 0.872);     // #e9e5de subtle champagne shade
        vec3 highlight = vec3(0.996, 0.994, 0.988); // #fdfcfb pearl light

        vec3 col = mix(shade, base, pattern);
        col = mix(col, highlight, sheen);

        // Gentle warm center vignette around login card
        float centerDist = length(p * 0.55);
        float centerGlow = exp(-centerDist * 1.05) * 0.20;
        col = mix(col, vec3(1.0, 0.995, 0.988), centerGlow);

        gl_FragColor = vec4(col, 1.0);
      }
    `

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let animationId = 0

    try {
      const vertex = compile(gl.VERTEX_SHADER, vertexSource)
      const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
      if (!vertex || !fragment) {
        setShaderFailed(true)
        return
      }

      program = gl.createProgram()
      if (!program) {
        setShaderFailed(true)
        return
      }

      gl.attachShader(program, vertex)
      gl.attachShader(program, fragment)
      gl.linkProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        setShaderFailed(true)
        return
      }

      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      )

      const position = gl.getAttribLocation(program, 'position')
      const resolution = gl.getUniformLocation(program, 'resolution')
      const timeLoc = gl.getUniformLocation(program, 'time')

      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const resize = () => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        const width = Math.max(1, Math.floor(container.clientWidth * ratio))
        const height = Math.max(1, Math.floor(container.clientHeight * ratio))
        if (canvas.width === width && canvas.height === height) return
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }

      const render = (timestamp: number) => {
        resize()
        if (program && buffer) {
          gl.useProgram(program)
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
          gl.enableVertexAttribArray(position)
          gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
          gl.uniform2f(resolution, canvas.width, canvas.height)
          gl.uniform1f(timeLoc, reducedMotion ? 0 : timestamp * 0.001)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        }
        animationId = requestAnimationFrame(render)
      }

      const observer = new ResizeObserver(resize)
      observer.observe(container)
      render(0)

      return () => {
        cancelAnimationFrame(animationId)
        observer.disconnect()
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
      }
    } catch (e) {
      console.warn('Shader background fallback enabled:', e)
      setShaderFailed(true)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting) return
    const trimmedEmail = email.trim()
    const trimmedPass = password.trim()
    if (!trimmedEmail || !trimmedPass) {
      setError('Please enter both your email/username and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const user = await login(trimmedEmail, trimmedPass)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`)
      navigate('dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden p-4 pb-safe select-none transition-colors duration-500 ${
        bgMode === 'shader' ? 'bg-[#000]' : 'bg-[#f6f4f1]'
      }`}
    >
      {/* 1. Background Animation: Three.js ShaderAnimation OR Smooth Silk Waves */}
      {bgMode === 'shader' ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <ShaderAnimation className="h-full w-full" />
        </div>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <canvas
              ref={canvasRef}
              className="block h-full w-full transition-opacity duration-700"
            />
            {shaderFailed && (
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(242,238,230,0.9),rgba(247,245,241,1)_60%)]" />
            )}
          </div>
          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.45)_0%,rgba(246,244,241,0.2)_50%,transparent_80%)]"
            aria-hidden="true"
          />
        </>
      )}

      {/* Background Style Switcher */}
      <div className="absolute top-4 right-4 z-30">
        <button
          type="button"
          onClick={() => setBgMode((m) => (m === 'shader' ? 'silk' : 'shader'))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-black/50 text-stone-200 border border-white/15 hover:bg-black/75 hover:text-white backdrop-blur-md transition-all shadow-md cursor-pointer"
          title="Switch background style"
        >
          <span>{bgMode === 'shader' ? '⚡ Shader Animation' : '✨ Silk Waves'}</span>
          <span className="text-[9px] text-[#c79a63] font-semibold">switch</span>
        </button>
      </div>

      {/* 2. Centered Luxury Card matching Reference Image */}
      <div className="relative z-10 w-full max-w-[370px] rounded-[24px] border border-[#e4ded6]/90 bg-white/98 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.1)] backdrop-blur-md transition-all sm:p-7 before:pointer-events-none before:absolute before:inset-[7px] before:rounded-[19px] before:border before:border-[#c79a63]/20">
        {/* Brand Logo & Name */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-[66px] w-[66px] items-center justify-center rounded-[18px] bg-[#22211f] border border-[#c79a63]/30 shadow-md">
            <img
              src="/brand/auravix-logo.jpeg"
              alt="Auravix Bath Studio logo"
              className="h-[48px] w-[48px] rounded-xl object-cover"
              onError={(e) => {
                const target = e.currentTarget
                if (!target.src.includes('logo.png')) {
                  target.src = '/brand/logo.png'
                }
              }}
            />
          </div>
          <h1 className="mt-3.5 font-sans text-[22px] font-extrabold tracking-[0.08em] text-[#070707]">
            AURAVIX
          </h1>
          <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-[0.35em] text-[#c79a63] pl-[0.35em]">
            Bath Studio
          </p>
        </div>

        {/* Heading */}
        <div className="mt-5 text-left">
          <h2 className="text-[21px] font-bold tracking-tight text-[#101010]">
            Welcome Back
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#8a8580]">
            Sign in to the Quotation &amp; Lead Management System
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
          <div className="space-y-1.5 text-left">
            <Label htmlFor="login-email" className="text-xs font-semibold text-[#1a1918]">
              Email or username
            </Label>
            <Input
              id="login-email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@auravixbathstudio.com"
              className="h-[46px] rounded-xl border-[#e2ddd5] bg-white text-sm text-[#2d2118] placeholder:text-[#9e9890] transition-all focus:border-[#c79a63] focus:ring-4 focus:ring-[#c79a63]/15"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              required
            />
          </div>

          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password" className="text-xs font-semibold text-[#1a1918]">
                Password
              </Label>
              <button
                type="button"
                onClick={() => setForgotMsg(true)}
                className="text-[11px] font-semibold text-[#c79a63] hover:text-[#b47d40] transition-colors"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-[46px] rounded-xl border-[#e2ddd5] bg-white pr-10 text-sm text-[#2d2118] placeholder:text-[#9e9890] transition-all focus:border-[#c79a63] focus:ring-4 focus:ring-[#c79a63]/15"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute right-1 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#8a8580] transition-colors hover:text-[#c79a63]"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="rounded-xl py-2 text-xs">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {forgotMsg && !error && (
            <p className="rounded-xl bg-[#faf5ee] p-2 text-center text-xs font-medium text-[#b47d40]">
              Password recovery instructions have been sent to your administrator.
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="relative flex h-[46px] w-full items-center justify-center rounded-xl bg-[#c79a63] text-sm font-semibold text-white shadow-[0_6px_16px_rgba(199,154,99,0.28)] transition-all hover:bg-[#b88a53] active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Signing in…
              </span>
            ) : (
              <span>Login</span>
            )}
          </button>
        </form>

        {/* Footer matching Reference Image */}
        <div className="mt-5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-[0.08em] text-[#a8a096]">
          <span>© 2026 Auravix Bath Studio</span>
          <span>Secure sign in</span>
        </div>
      </div>
    </div>
  )
}
