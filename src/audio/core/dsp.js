// Small pure-JS DSP toolkit used to pre-render drums, one-shot sfx, sampled instruments,
// noise loops and the reverb impulse response straight into Float32Arrays.
// Everything here is synchronous, allocation-light and safe to import in Node.

export const TAU = Math.PI * 2

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x)
export const lerp = (a, b, t) => a + (b - a) * t
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
export const dbToGain = (db) => Math.pow(10, db / 20)

/** Deterministic PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function rng(seed = 1) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Padé tanh approximation — smooth soft clip, exact enough for audio. */
export function softclip(x) {
  if (x > 3) return 1
  if (x < -3) return -1
  const x2 = x * x
  return (x * (27 + x2)) / (27 + 9 * x2)
}

/** RBJ-cookbook biquad (transposed direct form II). */
export class Biquad {
  constructor(type = 'lowpass', freq = 1000, q = 0.707, sr = 48000, gainDb = 0) {
    this.z1 = 0
    this.z2 = 0
    this.set(type, freq, q, sr, gainDb)
  }

  set(type, freq, q, sr, gainDb = 0) {
    const w = (TAU * clamp(freq, 5, sr * 0.49)) / sr
    const cs = Math.cos(w)
    const sn = Math.sin(w)
    const alpha = sn / (2 * Math.max(0.05, q))
    let b0, b1, b2, a0, a1, a2
    switch (type) {
      case 'highpass':
        b0 = (1 + cs) / 2
        b1 = -(1 + cs)
        b2 = b0
        a0 = 1 + alpha
        a1 = -2 * cs
        a2 = 1 - alpha
        break
      case 'bandpass': // constant 0 dB peak gain
        b0 = alpha
        b1 = 0
        b2 = -alpha
        a0 = 1 + alpha
        a1 = -2 * cs
        a2 = 1 - alpha
        break
      case 'peaking': {
        const A = Math.pow(10, gainDb / 40)
        b0 = 1 + alpha * A
        b1 = -2 * cs
        b2 = 1 - alpha * A
        a0 = 1 + alpha / A
        a1 = -2 * cs
        a2 = 1 - alpha / A
        break
      }
      default: // lowpass
        b0 = (1 - cs) / 2
        b1 = 1 - cs
        b2 = b0
        a0 = 1 + alpha
        a1 = -2 * cs
        a2 = 1 - alpha
    }
    this.b0 = b0 / a0
    this.b1 = b1 / a0
    this.b2 = b2 / a0
    this.a1 = a1 / a0
    this.a2 = a2 / a0
    return this
  }

  process(x) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }

  run(buf) {
    for (let i = 0; i < buf.length; i++) buf[i] = this.process(buf[i])
    return buf
  }
}

/** One-pole smoothing coefficient for a cutoff in Hz. */
export const onePole = (fc, sr) => 1 - Math.exp((-TAU * fc) / sr)

/** White noise buffer. */
export function whiteNoise(n, seed = 1) {
  const r = rng(seed)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1
  return out
}

/** Pink-ish noise (Paul Kellet's economy filter). */
export function pinkNoise(n, seed = 2) {
  const r = rng(seed)
  const out = new Float32Array(n)
  let b0 = 0,
    b1 = 0,
    b2 = 0
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
  }
  return out
}

/** Brown noise (integrated white, leaky). */
export function brownNoise(n, seed = 3) {
  const r = rng(seed)
  const out = new Float32Array(n)
  let s = 0
  for (let i = 0; i < n; i++) {
    s = s * 0.996 + (r() * 2 - 1) * 0.06
    out[i] = s
  }
  return out
}

export function peakOf(buf) {
  let p = 0
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i])
    if (a > p) p = a
  }
  return p
}

/** Scale in place so the absolute peak equals `peak`. */
export function normalize(buf, peak = 0.9) {
  const p = peakOf(buf)
  if (p > 1e-9) {
    const k = peak / p
    for (let i = 0; i < buf.length; i++) buf[i] *= k
  }
  return buf
}

/** Linear fade in / out in milliseconds (in place). */
export function fadeEdges(buf, sr, inMs = 2, outMs = 5) {
  const ni = Math.min(buf.length, Math.round((inMs / 1000) * sr))
  const no = Math.min(buf.length, Math.round((outMs / 1000) * sr))
  for (let i = 0; i < ni; i++) buf[i] *= i / ni
  for (let i = 0; i < no; i++) buf[buf.length - 1 - i] *= i / no
  return buf
}

/**
 * Make a seamless loop: the last `xfadeSec` of `buf` is equal-power blended into its start
 * and the result is `buf.length - xfade` samples long.
 */
export function makeLoop(buf, sr, xfadeSec = 0.1) {
  const x = Math.min(Math.floor(buf.length / 3), Math.round(xfadeSec * sr))
  const n = buf.length - x
  const out = buf.slice(0, n)
  for (let i = 0; i < x; i++) {
    const t = i / x
    const a = Math.sin(t * Math.PI * 0.5) // fade-in weight for the original start
    const b = Math.cos(t * Math.PI * 0.5) // fade-out weight for the tail
    out[i] = buf[i] * a + buf[n + i] * b
  }
  return out
}

/** Equal-power pan a mono buffer into [L, R]. pan -1..1 */
export function panMono(mono, pan = 0) {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4
  const gl = Math.cos(a)
  const gr = Math.sin(a)
  const L = new Float32Array(mono.length)
  const R = new Float32Array(mono.length)
  for (let i = 0; i < mono.length; i++) {
    L[i] = mono[i] * gl
    R[i] = mono[i] * gr
  }
  return [L, R]
}

/** Mix `src` into `dst` starting at sample `offset` with gain `g`. */
export function mixInto(dst, src, offset = 0, g = 1) {
  const o = Math.max(0, offset | 0)
  const n = Math.min(src.length, dst.length - o)
  for (let i = 0; i < n; i++) dst[o + i] += src[i] * g
  return dst
}

/** Create an AudioBuffer from one or more channel arrays. */
export function toAudioBuffer(ctx, chans, sampleRate) {
  const arr = Array.isArray(chans) ? chans : [chans]
  const sr = sampleRate || ctx.sampleRate
  const len = Math.max(1, arr[0].length)
  const buf = ctx.createBuffer(arr.length, len, sr)
  for (let c = 0; c < arr.length; c++) {
    if (buf.copyToChannel) buf.copyToChannel(arr[c], c)
    else buf.getChannelData(c).set(arr[c])
  }
  return buf
}

/**
 * Tiny band-limited-ish oscillators for offline rendering. Phase in cycles [0,1).
 * polyBLEP keeps saw/square usable up to a few kHz without harsh aliasing.
 */
function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt
    return t + t - t * t - 1
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt
    return t * t + t + t + 1
  }
  return 0
}

export function oscSample(type, phase, dt) {
  switch (type) {
    case 'saw':
      return 2 * phase - 1 - polyBlep(phase, dt)
    case 'square': {
      let v = phase < 0.5 ? 1 : -1
      v += polyBlep(phase, dt)
      v -= polyBlep((phase + 0.5) % 1, dt)
      return v
    }
    case 'triangle':
      return 1 - 4 * Math.abs(phase - 0.5)
    default:
      return Math.sin(TAU * phase)
  }
}

/** Per-context cache helper: WeakMap<ctx, Map<key, value>>. */
const ctxCaches = new WeakMap()
export function ctxCache(ctx, key, make) {
  let m = ctxCaches.get(ctx)
  if (!m) {
    m = new Map()
    ctxCaches.set(ctx, m)
  }
  let v = m.get(key)
  if (v === undefined) {
    v = make()
    m.set(key, v)
  }
  return v
}
