// Small math helpers for the procedural car builder: smooth profile curves and easing.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const lerp = (a, b, t) => a + (b - a) * t
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Monotone cubic Hermite (Fritsch–Carlson / PCHIP) through [[x, y], ...] keys, sorted by x.
 * Behaves like a Catmull-Rom spline but never overshoots between keys, which keeps body
 * profiles (heights, widths) from growing unexpected bumps. Clamped outside the key range.
 * A plain number gives a constant function.
 */
export function curve(keys) {
  if (typeof keys === 'number') return () => keys
  if (typeof keys === 'function') return keys
  const n = keys.length
  const xs = keys.map((k) => k[0])
  const ys = keys.map((k) => k[1])
  if (n === 1) return () => ys[0]
  const d = new Float64Array(n - 1)
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i])
  const m = new Float64Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0
    else {
      const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i]
      const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    }
  }
  // soften the end tangents so the first/last spans are not straight lines
  if (n > 2) {
    m[0] = d[0] * 1.5 - m[1] * 0.5
    if (m[0] * d[0] < 0) m[0] = 0
    m[n - 1] = d[n - 2] * 1.5 - m[n - 2] * 0.5
    if (m[n - 1] * d[n - 2] < 0) m[n - 1] = 0
  }
  return (x) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let lo = 0, hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (xs[mid] > x) hi = mid
      else lo = mid
    }
    const h = xs[hi] - xs[lo]
    const t = (x - xs[lo]) / h
    const t2 = t * t, t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi]
  }
}

/** Soft box mask: 1 inside [a, b], smooth falloff of width e outside. */
export function band(v, a, b, e) {
  return smoothstep(a - e, a, v) * (1 - smoothstep(b, b + e, v))
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
