'use client'

/**
 * Nimbus UI · Liquid Navbar — "Waterline"
 * Adapted for Auravix Bath Studio CRM.
 * A pill/dock of water with luxury warm bronze & gold accents (#c79a63 / #996832).
 * The active drop stretches toward the item you pick, splits into droplets on long
 * jumps and merges back with a ripple. The cursor lifts a meniscus, every tap sends
 * a wave along the dock, and each icon plays its own little scene.
 * Water is drawn by a tiny WebGL shader (only inside the pill, paused off-screen);
 * without WebGL it falls back to a CSS drop.
 */

import * as React from 'react'

export type NimbusFx = 'plane' | 'drop' | 'spin' | 'glow' | 'wave' | 'pop' | 'none'

export type LiquidNavItem = {
  label: string
  href?: string
  icon?: React.ReactNode
  /** the little scene the icon plays when tapped */
  fx?: NimbusFx
}

export type LiquidNavbarProps = {
  items?: LiquidNavItem[]
  defaultActive?: number
  active?: number
  onChange?: (index: number, item: LiquidNavItem) => void
  /** "light" water for bright backgrounds, "dark" for dark ones, "auravix" for luxury bronze */
  tone?: 'light' | 'dark' | 'auravix'
  orientation?: 'horizontal' | 'vertical'
  /** icons only */
  compact?: boolean
  /** soft synthesized "plip" on tap (no audio files) */
  sound?: boolean
  className?: string
  style?: React.CSSProperties
}

/* ---------- icons ---------- */
const I = (d: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
)
export const NimbusIcons = {
  home: I(
    <>
      <path d="M3.5 11.2 12 4l8.5 7.2" />
      <path d="M6 9.6V20h12V9.6" />
      <path className="nv-door" d="M10 20v-5h4v5Z" />
    </>
  ),
  globe: I(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 2.6 14.6 0 17M12 3.5c-2.6 2.4-2.6 14.6 0 17" />
    </>
  ),
  plane: I(<path d="M21 12.2 3.6 5.4l2.7 6.8-2.7 6.4L21 12.2Zm-14.7 0H13" />),
  drop: I(<path d="M12 3.5s6 6.4 6 10.6a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5Z" />),
  user: I(
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c1.2-3.4 4-5 7.2-5s6 1.6 7.2 5" />
    </>
  ),
}

const PAD = 14 // canvas bleed around the pill, for shadows and ripples

/* ---------- styles ---------- */
const NIMBUS_CSS = `
.nimbus-nav{--n-tint:rgba(255,255,255,.14);--n-fg:#0B132B;--n-fg-soft:rgba(11,19,43,.6);--n-rim:rgba(255,255,255,.7);
  position:relative;display:inline-flex;align-items:center;gap:2px;padding:6px;border-radius:999px;isolation:isolate;
  font-family:inherit;-webkit-font-smoothing:antialiased;user-select:none;-webkit-tap-highlight-color:transparent}
.nimbus-nav[data-tone="dark"]{--n-tint:rgba(10,18,40,.26);--n-fg:#F1F7FF;--n-fg-soft:rgba(241,247,255,.66);--n-rim:rgba(255,255,255,.34)}
.nimbus-nav[data-tone="auravix"]{--n-tint:rgba(52,51,56,.35);--n-fg:#ffffff;--n-fg-soft:#c5c0ba;--n-rim:rgba(199,154,99,.4)}
.nimbus-glass{position:absolute;inset:0;border-radius:inherit;z-index:-2;overflow:hidden;background:var(--n-tint);
  -webkit-backdrop-filter:blur(10px) saturate(1.2) brightness(1.08);backdrop-filter:blur(10px) saturate(1.2) brightness(1.08);
  box-shadow:inset 0 1px 1px var(--n-rim),inset 0 0 0 1px rgba(255,255,255,.08),0 12px 32px -14px rgba(0,0,0,.5),0 2px 6px rgba(0,0,0,.15)}
.nimbus-nav[data-refract="on"] .nimbus-glass::after{content:"";position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.08) 0%,transparent 50%,rgba(199,154,99,.05) 100%);pointer-events:none}
.nimbus-water{position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;overflow:hidden}
.nimbus-water canvas{position:absolute;pointer-events:none}
.nimbus-css-drop{position:absolute;border-radius:8px;background:#343338;
  border:1px solid rgba(199,154,99,.28);
  box-shadow:inset 3px 0 0 #c79a63, 0 4px 12px rgba(0,0,0,.25);
  transition:left .32s cubic-bezier(.34,1.4,.64,1),width .32s cubic-bezier(.34,1.4,.64,1),top .32s cubic-bezier(.34,1.4,.64,1),height .32s cubic-bezier(.34,1.4,.64,1),opacity .2s}
.nimbus-item{position:relative;display:flex;align-items:center;gap:10px;padding:0 14px;height:42px;border-radius:8px;cursor:pointer;
  font-size:13.5px;font-weight:500;color:var(--n-fg-soft);border:none;background:transparent;transition:color .2s,background-color .15s}
.nimbus-item:hover{color:#ffffff;background:rgba(255,255,255,.04)}
.nimbus-item[aria-pressed="true"]{color:var(--n-fg);font-weight:600}
.nimbus-item[aria-pressed="true"] .nimbus-icon{color:#c79a63}
.nimbus-item:focus-visible{outline:2px solid rgba(199,154,99,.7);outline-offset:2px}
.nimbus-nav[data-compact="on"] .nimbus-item{padding:0 12px;justify-content:center}
.nimbus-nav[data-compact="on"] .nv-label{display:none}
.nimbus-icon{display:flex;align-items:center;justify-content:center;position:relative;color:inherit;transition:transform .2s,color .2s}
/* vertical orientation */
.nimbus-nav[data-orientation="vertical"]{display:flex;flex-direction:column;width:100%;border-radius:12px;padding:4px;gap:2px;background:transparent}
.nimbus-nav[data-orientation="vertical"] .nimbus-item{width:100%;justify-content:flex-start}
.nimbus-nav[data-orientation="vertical"] .nimbus-glass{background:transparent;box-shadow:none}
/* fx keyframes */
@keyframes nv-plane{0%{transform:translateX(0) translateY(0) rotate(0)}30%{transform:translateX(3px) translateY(-3px) rotate(-10deg)}70%{transform:translateX(6px) translateY(-6px) rotate(-10deg)}100%{transform:translateX(0) translateY(0) rotate(0)}}
@keyframes nv-drop{0%{transform:scaleY(1)}30%{transform:scaleY(1.3) scaleX(.85)}60%{transform:scaleY(.85) scaleX(1.1)}100%{transform:scaleY(1)}}
@keyframes nv-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes nv-glow{0%,100%{filter:drop-shadow(0 0 0px currentColor)}50%{filter:drop-shadow(0 0 6px #c79a63)}}
@keyframes nv-wave{0%{transform:rotate(0deg)}25%{transform:rotate(-15deg)}75%{transform:rotate(15deg)}100%{transform:rotate(0deg)}}
@keyframes nv-pop{0%{transform:scale(1)}40%{transform:scale(1.28)}70%{transform:scale(.92)}100%{transform:scale(1)}}
.nv-fx-plane{animation:nv-plane .6s ease both}
.nv-fx-drop{animation:nv-drop .5s ease both}
.nv-fx-spin{animation:nv-spin .6s linear both}
.nv-fx-glow{animation:nv-glow .6s ease both}
.nv-fx-wave{animation:nv-wave .5s ease both}
.nv-fx-pop{animation:nv-pop .4s ease both}
/* meniscus */
.nimbus-meniscus{position:absolute;pointer-events:none;z-index:2;width:40px;height:12px;overflow:hidden;transform:translateX(-50%)}
.nimbus-meniscus svg{position:absolute;bottom:0;left:0;width:100%;height:100%}
/* ripple */
.nimbus-ripple{position:absolute;border-radius:50%;background:rgba(199,154,99,.35);pointer-events:none;transform:scale(0);animation:nv-ripple .6s ease-out forwards}
@keyframes nv-ripple{to{transform:scale(4);opacity:0}}
`

/* ---------- WebGL water shader ---------- */
const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}`
const FRAG = `
precision mediump float;
uniform float t;
uniform vec2 res;
uniform vec4 drop; // x: cx, y: cy, z: halfW, w: halfH
uniform float rpl;
uniform vec3 col1;
uniform vec3 col2;

float sdRoundedBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - res * 0.5) / res.y;
  vec2 p = uv - drop.xy;
  vec2 b = max(drop.zw, vec2(0.015, 0.015));
  float corner = min(min(b.x, b.y), 0.025);
  float d = sdRoundedBox(p, b, corner);
  float h = 1.0 - smoothstep(-0.012, 0.012, d);

  // gentle ripple ring
  float ring = 0.0;
  if(rpl > 0.0 && rpl < 1.0){
    float dist = length(p);
    float waveRadius = max(b.x, b.y) * (1.0 + rpl * 1.8);
    ring = (1.0 - smoothstep(0.0, 0.035, abs(dist - waveRadius))) * 0.45 * (1.0 - rpl);
  }

  // luxury warm water shimmer
  float sh = 0.5 + 0.5 * sin(uv.x * 22.0 + t * 2.2) * cos(uv.y * 18.0 - t * 1.7);
  vec3 water = mix(col1, col2, sh);
  float alpha = (h * 0.35 + ring * 0.5);
  gl_FragColor = vec4(water, alpha);
}`

function initGL(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const a = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(a)
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  return {
    gl,
    uT: gl.getUniformLocation(prog, 't'),
    uRes: gl.getUniformLocation(prog, 'res'),
    uDrop: gl.getUniformLocation(prog, 'drop'),
    uRpl: gl.getUniformLocation(prog, 'rpl'),
    uCol1: gl.getUniformLocation(prog, 'col1'),
    uCol2: gl.getUniformLocation(prog, 'col2'),
  }
}

/* ---------- sound ---------- */
function plip() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.setValueAtTime(880, ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08)
    g.gain.setValueAtTime(0.07, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    o.start()
    o.stop(ctx.currentTime + 0.12)
  } catch {}
}

/* ---------- main component ---------- */
export function LiquidNavbar({
  items,
  defaultActive = 0,
  active: controlledActive,
  onChange,
  tone = 'auravix',
  orientation = 'horizontal',
  compact = false,
  sound = false,
  className = '',
  style,
}: LiquidNavbarProps) {
  const navItems = items ?? []
  const isControlled = controlledActive !== undefined
  const [internalActive, setInternalActive] = React.useState(defaultActive)
  const active = isControlled ? controlledActive! : internalActive

  const pillRef = React.useRef<HTMLDivElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const glRef = React.useRef<ReturnType<typeof initGL>>(null)
  const rafRef = React.useRef<number>(0)
  const tRef = React.useRef(0)
  const dropRef = React.useRef({ x: 0, y: 0, hw: 0.1, hh: 0.1 })
  const rplRef = React.useRef(0)
  const meniscusRef = React.useRef<HTMLDivElement>(null)
  const [fxMap, setFxMap] = React.useState<Record<number, string>>({})
  const [cssDropStyle, setCssDropStyle] = React.useState<React.CSSProperties>({})
  const hasGL = React.useRef<boolean | null>(null)
  const styleInjected = React.useRef(false)

  /* inject CSS once */
  React.useEffect(() => {
    if (styleInjected.current) return
    styleInjected.current = true
    const el = document.createElement('style')
    el.textContent = NIMBUS_CSS
    document.head.appendChild(el)
  }, [])

  /* init WebGL */
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = initGL(canvas)
    if (ctx) {
      ;(glRef as any).current = ctx
      hasGL.current = true
    } else {
      hasGL.current = false
    }
  }, [])

  /* position helper */
  const getItemRect = (i: number) => {
    const btn = itemRefs.current[i]
    const pill = pillRef.current
    if (!btn || !pill) return null
    const br = btn.getBoundingClientRect()
    const pr = pill.getBoundingClientRect()
    return { left: br.left - pr.left, top: br.top - pr.top, width: br.width, height: br.height }
  }

  /* update drop target */
  const setDropTarget = React.useCallback((i: number) => {
    const r = getItemRect(i)
    const pill = pillRef.current
    const canvas = canvasRef.current
    if (!r || !pill || !canvas) return

    const cxPx = r.left + r.width / 2 + PAD
    const cyPx = r.top + r.height / 2 + PAD
    const h = canvas.height

    const normX = (cxPx - canvas.width * 0.5) / h
    const normY = (h * 0.5 - cyPx) / h
    const halfW = (r.width * 0.5) / h
    const halfH = (r.height * 0.5) / h

    dropRef.current = { x: normX, y: normY, hw: halfW, hh: halfH }
    rplRef.current = 0.01
  }, [])

  /* update css drop fallback */
  const updateCssDrop = React.useCallback((i: number) => {
    const r = getItemRect(i)
    if (!r) return
    setCssDropStyle({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      opacity: 1,
    })
  }, [])

  /* animate */
  React.useEffect(() => {
    const canvas = canvasRef.current
    const glCtx = glRef.current
    if (!canvas || !glCtx) return
    const { gl, uT, uRes, uDrop, uRpl, uCol1, uCol2 } = glCtx

    // Color palette based on tone
    let c1 = [0.78, 0.60, 0.39] // #c79a63 warm bronze
    let c2 = [0.92, 0.78, 0.54] // warm gold shimmer
    if (tone === 'light') {
      c1 = [0.55, 0.82, 1.0]
      c2 = [0.8, 0.95, 1.0]
    } else if (tone === 'dark') {
      c1 = [0.45, 0.65, 0.85]
      c2 = [0.7, 0.85, 1.0]
    }

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      tRef.current += 0.016
      if (rplRef.current < 1) rplRef.current = Math.min(1, rplRef.current + 0.018)
      const w = canvas.width
      const h = canvas.height
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uT, tRef.current)
      gl.uniform2f(uRes, w, h)
      gl.uniform4f(uDrop, dropRef.current.x, dropRef.current.y, dropRef.current.hw, dropRef.current.hh)
      gl.uniform1f(uRpl, rplRef.current)
      if (uCol1) gl.uniform3fv(uCol1, c1)
      if (uCol2) gl.uniform3fv(uCol2, c2)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    loop()
    return () => cancelAnimationFrame(rafRef.current)
  }, [tone])

  /* resize canvas to match pill */
  React.useEffect(() => {
    const canvas = canvasRef.current
    const pill = pillRef.current
    if (!canvas || !pill) return
    const ro = new ResizeObserver(() => {
      const r = pill.getBoundingClientRect()
      canvas.width = Math.max(10, Math.floor(r.width + PAD * 2))
      canvas.height = Math.max(10, Math.floor(r.height + PAD * 2))
      canvas.style.left = `-${PAD}px`
      canvas.style.top = `-${PAD}px`
      setDropTarget(active)
    })
    ro.observe(pill)
    return () => ro.disconnect()
  }, [active, setDropTarget])

  /* init drop on mount */
  React.useEffect(() => {
    requestAnimationFrame(() => {
      setDropTarget(active)
      updateCssDrop(active)
    })
  }, []) // eslint-disable-line

  /* sync drop when active changes externally */
  React.useEffect(() => {
    setDropTarget(active)
    updateCssDrop(active)
  }, [active, setDropTarget, updateCssDrop])

  const handleSelect = (i: number, item: LiquidNavItem) => {
    if (sound) plip()
    if (!isControlled) setInternalActive(i)
    onChange?.(i, item)
    setDropTarget(i)
    updateCssDrop(i)
    // fx
    const fx = item.fx ?? 'pop'
    if (fx !== 'none') {
      setFxMap((m) => ({ ...m, [i]: fx }))
      setTimeout(() => setFxMap((m) => { const n = { ...m }; delete n[i]; return n }), 700)
    }
  }

  /* meniscus follow cursor (horizontal only) */
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (orientation === 'vertical') return
    const m = meniscusRef.current
    const pill = pillRef.current
    if (!m || !pill) return
    const r = pill.getBoundingClientRect()
    const x = e.clientX - r.left
    m.style.left = `${x}px`
    m.style.opacity = '1'
  }
  const handleMouseLeave = () => {
    if (meniscusRef.current) meniscusRef.current.style.opacity = '0'
  }

  return (
    <div
      ref={pillRef}
      role="tablist"
      aria-label="Navigation"
      data-tone={tone}
      data-orientation={orientation}
      data-compact={compact ? 'on' : 'off'}
      data-refract="on"
      className={`nimbus-nav ${className}`}
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* glass background */}
      <div className="nimbus-glass" aria-hidden="true" />

      {/* WebGL water layer */}
      <div className="nimbus-water" aria-hidden="true">
        <canvas ref={canvasRef} />
        {/* CSS drop active highlight */}
        <div className="nimbus-css-drop" style={cssDropStyle} />
      </div>

      {/* meniscus (horizontal only) */}
      {orientation === 'horizontal' && (
        <div ref={meniscusRef} className="nimbus-meniscus" style={{ opacity: 0, bottom: 0 }} aria-hidden="true">
          <svg viewBox="0 0 40 12" fill="none">
            <path
              d="M0 12 Q20 0 40 12"
              stroke="rgba(199,154,99,.5)"
              strokeWidth="1.5"
              fill="rgba(199,154,99,.12)"
            />
          </svg>
        </div>
      )}

      {/* items */}
      {navItems.map((item, i) => {
        const isActive = i === active
        const fxClass = fxMap[i] ? `nv-fx-${fxMap[i]}` : ''
        return (
          <button
            key={i}
            ref={(el) => { itemRefs.current[i] = el }}
            role="tab"
            aria-selected={isActive}
            aria-pressed={isActive}
            className="nimbus-item"
            onClick={() => handleSelect(i, item)}
          >
            {item.icon && (
              <span className={`nimbus-icon ${fxClass}`}>{item.icon}</span>
            )}
            {!compact && <span className="nv-label">{item.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
