export const TAU = Math.PI * 2
export const DEG = Math.PI / 180
export const KMH = 3.6 // m/s → km/h

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a))
export const remap = (v, a, b, c, d) => c + (d - c) * clamp01(invLerp(a, b, v))
export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const smootherstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * t * (t * (t * 6 - 15) + 10)
}
/** Frame-rate independent exponential approach. lambda = 1/time-constant */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt))
export const approach = (cur, target, maxDelta) =>
  cur < target ? Math.min(cur + maxDelta, target) : Math.max(cur - maxDelta, target)
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}
export const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0)
export const fract = (v) => v - Math.floor(v)

/** Critically-damped / underdamped spring integrator for scalar values. */
export function springStep(state, target, omega, zeta, dt) {
  // state: { x, v }
  const f = omega * omega * (target - state.x) - 2 * zeta * omega * state.v
  state.v += f * dt
  state.x += state.v * dt
  return state.x
}

/** 1D value noise (smooth, deterministic) for scenery variation. */
export function vnoise1(x, seed = 0) {
  const i = Math.floor(x)
  const f = x - i
  const a = hashf(i + seed * 131)
  const b = hashf(i + 1 + seed * 131)
  const u = f * f * (3 - 2 * f)
  return a + (b - a) * u
}

function hashf(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}

/** 2D value noise in [0,1] */
export function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const a = hashf(ix + iy * 57)
  const b = hashf(ix + 1 + iy * 57)
  const c = hashf(ix + (iy + 1) * 57)
  const d = hashf(ix + 1 + (iy + 1) * 57)
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise2(x * f, y * f)
    n += a
    a *= 0.5
    f *= 2.03
  }
  return s / n
}

/** Ridged noise, good for mountains */
export function ridged2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(vnoise2(x * f, y * f) * 2 - 1)
    s += a * v * v
    n += a
    a *= 0.5
    f *= 2.1
  }
  return s / n
}
