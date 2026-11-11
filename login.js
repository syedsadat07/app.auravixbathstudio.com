const container = document.querySelector("#shader-container")

// A browser can preserve the previous scroll position after a refresh.
window.scrollTo(0, 0)

function initializeShader() {
  if (!container) return

  const canvas = document.createElement("canvas")
  canvas.className = "shader-canvas"
  container.appendChild(canvas)

  const gl = canvas.getContext("webgl", { alpha: true, antialias: true })
  if (!gl) {
    container.classList.add("is-fallback")
    return
  }

  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `
  const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;

    void main(void) {
      vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);

      float angle = 0.62;
      float c = cos(angle);
      float s = sin(angle);
      vec2 rot = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

      float t = time * 0.16;

      float wave1 = sin(rot.x * 1.6 + sin(rot.y * 1.1 + t * 0.5) * 1.1 + t * 0.35);
      float wave2 = cos(rot.x * 2.1 - cos(rot.y * 1.3 - t * 0.4) * 0.9 - t * 0.3);
      float wave3 = sin(rot.x * 3.0 + rot.y * 0.5 + t * 0.2) * 0.35;

      float pattern = (wave1 + wave2 + wave3) / 2.45;
      pattern = smoothstep(-0.85, 0.85, pattern);

      float sheen = pow(smoothstep(-0.35, 0.95, sin(rot.x * 1.8 + rot.y * 1.2 + t * 0.45)), 2.6) * 0.3;

      vec3 base = vec3(0.965, 0.958, 0.947);
      vec3 shade = vec3(0.915, 0.898, 0.872);
      vec3 highlight = vec3(0.996, 0.994, 0.988);

      vec3 col = mix(shade, base, pattern);
      col = mix(col, highlight, sheen);

      float centerDist = length(p * 0.55);
      float centerGlow = exp(-centerDist * 1.05) * 0.20;
      col = mix(col, vec3(1.0, 0.995, 0.988), centerGlow);

      gl_FragColor = vec4(col, 1.0);
    }
  `

  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader) || "Unable to compile shader."
      gl.deleteShader(shader)
      throw new Error(error)
    }
    return shader
  }

  let program
  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource)
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
    program = gl.createProgram()
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Unable to link shader program.")
    }
  } catch (error) {
    console.warn("Shader background could not be initialized.", error)
    container.classList.add("is-fallback")
    return
  }

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

  const position = gl.getAttribLocation(program, "position")
  const resolution = gl.getUniformLocation(program, "resolution")
  const time = gl.getUniformLocation(program, "time")
  let animationId = 0
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.floor(container.clientWidth * ratio))
    const height = Math.max(1, Math.floor(container.clientHeight * ratio))
    if (canvas.width === width && canvas.height === height) return
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
  }

  const render = (timestamp) => {
    resize()
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.uniform2f(resolution, canvas.width, canvas.height)
    // Match the supplied Three.js animation speed: time advances by ~0.05/frame.
    gl.uniform1f(time, reducedMotion ? 0 : timestamp * .001)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    animationId = requestAnimationFrame(render)
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  render(0)

  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(animationId)
    observer.disconnect()
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }, { once: true })
}

initializeShader()

const form = document.querySelector("#login-form")
const email = document.querySelector("#email")
const password = document.querySelector("#password")
const passwordToggle = document.querySelector("#password-toggle")
const forgotLink = document.querySelector("#forgot-link")
const submit = form?.querySelector(".login-submit")
const message = document.querySelector("#login-message")

const eyeOpenSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.2-5 9.5-5 9.5 5 9.5 5-3.2 5-9.5 5-9.5-5-9.5-5Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>`
const eyeClosedSvg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path><line x1="2" x2="22" y1="2" y2="22"></line></svg>`

passwordToggle?.addEventListener("click", () => {
  const isPassword = password.type === "password"
  password.type = isPassword ? "text" : "password"
  passwordToggle.innerHTML = isPassword ? eyeClosedSvg : eyeOpenSvg
  passwordToggle.setAttribute("aria-label", isPassword ? "Hide password" : "Show password")
  passwordToggle.setAttribute("aria-pressed", String(isPassword))
})

forgotLink?.addEventListener("click", (event) => {
  event.preventDefault()
  message.textContent = "Password recovery instructions have been sent to your administrator."
  message.className = "login-message is-info"
})

const clearError = () => {
  if (message.classList.contains("is-error")) {
    message.textContent = ""
    message.className = "login-message"
  }
}
email?.addEventListener("input", clearError)
password?.addEventListener("input", clearError)

form?.addEventListener("submit", (event) => {
  event.preventDefault()
  const emailVal = email?.value.trim()
  const passVal = password?.value.trim()
  if (!emailVal || !passVal) {
    message.textContent = "Please fill in both your email/username and password."
    message.className = "login-message is-error"
    if (!emailVal) email?.focus()
    else password?.focus()
    form.reportValidity()
    return
  }
  submit.disabled = true
  submit.classList.add("is-loading")
  message.textContent = "Opening your workspace..."
  message.className = "login-message is-info"
  window.setTimeout(() => { window.location.href = "index.html" }, 650)
})
