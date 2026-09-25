// One-shot sound effects. Buffers are rendered procedurally once per context and cached;
// each play is source → gain → StereoPanner → bus (3 short-lived nodes, auto-disconnected).
// 'pass' and the whoosh part of 'nearMiss' are live (swept band-pass on a shared noise loop).
import { TAU, rng, Biquad, softclip, whiteNoise, pinkNoise, normalize, fadeEdges, toAudioBuffer, ctxCache, clamp } from '../core/dsp.js'
import { createPanner } from '../core/env.js'
import { JINGLES } from './jingles.js'

const SR_CAP = 48000

// ── procedural renderers (mono unless they return [L, R]) ─────────────────────────────────

function shift(sr) {
  const n = Math.round(0.2 * sr)
  const out = new Float32Array(n)
  const r = rng(11)
  const hp = new Biquad('highpass', 1800, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const thud = Math.sin(TAU * 95 * t * (1 + 0.5 * Math.exp(-t / 0.01))) * Math.exp(-t / 0.03) * 0.7
    const click = hp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * 0.7
    const t2 = t - 0.045
    const clack = t2 > 0 ? Math.sin(TAU * 1850 * t2) * Math.exp(-t2 / 0.01) * 0.28 + (r() * 2 - 1) * Math.exp(-t2 / 0.004) * 0.3 : 0
    out[i] = thud + click + clack
  }
  return normalize(fadeEdges(out, sr, 0.5, 10), 0.8)
}

function backfire(sr, v = 0) {
  const n = Math.round(0.35 * sr)
  const out = new Float32Array(n)
  const r = rng(100 + v * 17)
  const lp = new Biquad('lowpass', 1600 + 1600 * r(), 0.8, sr)
  const f = 50 + 30 * r()
  const tau = 0.022 + 0.022 * r()
  const t2 = 0.008 + r() * 0.025
  for (let i = 0; i < n; i++) {
    const t = i / sr
    let env = Math.min(1, t / 0.0006) * Math.exp(-t / tau)
    if (t > t2) env += 0.5 * Math.exp(-(t - t2) / (tau * 0.7))
    const noise = lp.process(r() * 2 - 1) * env
    const thump = Math.sin(TAU * f * t * (1 + 1.5 * Math.exp(-t / 0.008))) * Math.exp(-t / 0.05)
    out[i] = softclip(3.2 * (noise * 1.3 + thump * 0.8))
  }
  return normalize(fadeEdges(out, sr, 0.2, 20), 0.9)
}

function impact(sr, { len = 0.7, thudF = 70, crunch = 0.8, ring = 0.5, seed = 5, ringF = [450, 1130, 1790] } = {}) {
  const n = Math.round(len * sr)
  const out = new Float32Array(n)
  const r = rng(seed)
  const bp = new Biquad('bandpass', 850, 0.9, sr)
  const hp = new Biquad('highpass', 2500, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const thud = Math.sin(TAU * thudF * t * (1 + 0.8 * Math.exp(-t / 0.012))) * Math.exp(-t / 0.09)
    const cr = bp.process(r() * 2 - 1) * (Math.exp(-t / 0.06) + 0.3 * Math.exp(-t / 0.22)) * crunch * 2
    const snap = hp.process(r() * 2 - 1) * Math.exp(-t / 0.01) * 0.8
    let rg = 0
    for (let k = 0; k < ringF.length; k++) rg += Math.sin(TAU * ringF[k] * t + k) * Math.exp(-t / (0.25 / (k + 1)))
    out[i] = softclip(1.8 * (thud * 1.1 + cr + snap + rg * ring * 0.35))
  }
  return normalize(fadeEdges(out, sr, 0.3, 30), 0.85)
}

function scrape(sr) {
  const n = Math.round(0.5 * sr)
  const out = new Float32Array(n)
  const r = rng(77)
  const bps = [new Biquad('bandpass', 1200, 6, sr), new Biquad('bandpass', 2300, 8, sr), new Biquad('bandpass', 3600, 9, sr)]
  let am = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    if ((i & 63) === 0) {
      bps[0].set('bandpass', 1100 + 300 * r(), 6, sr)
      bps[1].set('bandpass', 2100 + 500 * r(), 8, sr)
      bps[2].set('bandpass', 3300 + 700 * r(), 9, sr)
    }
    am += 0.01 * (r() - am)
    const w = r() * 2 - 1
    const s = bps[0].process(w) + bps[1].process(w) * 0.8 + bps[2].process(w) * 0.6
    const env = Math.min(1, t / 0.02) * Math.min(1, (0.5 - t) / 0.12)
    out[i] = s * (0.5 + 1.2 * am) * env * 3
  }
  return normalize(out, 0.7)
}

function crash(sr) {
  const n = Math.round(1.8 * sr)
  const r = rng(909)
  const base = impact(sr, { len: 1.8, thudF: 52, crunch: 1.2, ring: 0.9, seed: 12, ringF: [310, 870, 1460, 2210] })
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  // debris rattle + glass tinkles, slightly different per side
  const hp = new Biquad('highpass', 3000, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const rattle = hp.process(r() * 2 - 1) * Math.exp(-t / 0.35) * (0.4 + 0.6 * (r() < 0.02 ? 1 : 0.2))
    L[i] = base[i] + rattle * 0.3
    R[i] = base[i] * 0.94 + rattle * 0.26
  }
  for (let g = 0; g < 26; g++) {
    const at = Math.round((0.05 + Math.pow(r(), 1.5) * 1.1) * sr)
    const f = 2800 + r() * 4500
    const amp = 0.08 + 0.18 * r()
    const side = r() < 0.5 ? L : R
    const len = Math.round(0.08 * sr)
    for (let i = 0; i < len && at + i < n; i++) side[at + i] += Math.sin((TAU * f * i) / sr) * Math.exp(-i / (0.012 * sr)) * amp
  }
  const p = Math.max(...[L, R].map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)))
  for (let i = 0; i < n; i++) {
    L[i] *= 0.9 / p
    R[i] *= 0.9 / p
  }
  return [L, R]
}

function bump(sr) {
  const n = Math.round(0.25 * sr)
  const out = new Float32Array(n)
  const r = rng(21)
  const lp = new Biquad('lowpass', 600, 0.7, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    out[i] = Math.sin(TAU * 62 * t * (1 + 0.5 * Math.exp(-t / 0.01))) * Math.exp(-t / 0.06) + lp.process(r() * 2 - 1) * Math.exp(-t / 0.02) * 0.6
  }
  return normalize(fadeEdges(out, sr, 0.3, 10), 0.8)
}

function hit(sr) {
  return impact(sr, { len: 0.45, thudF: 85, crunch: 0.9, ring: 0.35, seed: 31, ringF: [620, 1510, 2480] })
}

function land(sr) {
  const n = Math.round(0.45 * sr)
  const out = new Float32Array(n)
  const r = rng(41)
  const lp = new Biquad('lowpass', 900, 0.7, sr)
  const bp = new Biquad('bandpass', 1500, 4, sr)
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const thud = Math.sin(TAU * 52 * t * (1 + 0.7 * Math.exp(-t / 0.012))) * Math.exp(-t / 0.1)
    const clunk = lp.process(r() * 2 - 1) * Math.exp(-t / 0.03) * 0.7
    const t2 = t - 0.02
    const chirp = t2 > 0 ? bp.process(Math.sin(TAU * 1250 * t2) * 0.6 + (r() * 2 - 1) * 0.4) * Math.exp(-t2 / 0.06) * 1.6 : 0
    out[i] = thud + clunk + chirp
  }
  return normalize(fadeEdges(out, sr, 0.3, 20), 0.85)
}

function driftStart(sr) {
  const n = Math.round(0.32 * sr)
  const out = new Float32Array(n)
  const r = rng(61)
  const bp = new Biquad('bandpass', 1400, 3, sr)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    ph += (1180 * (1 - 0.12 * (t / 0.32))) / sr
    const env = Math.min(1, t / 0.015) * Math.exp(-t / 0.12)
    out[i] = (Math.sin(TAU * ph) * 0.55 + Math.sin(TAU * ph * 2.01) * 0.2 + bp.process(r() * 2 - 1) * 0.9) * env
  }
  return normalize(fadeEdges(out, sr, 0.5, 20), 0.7)
}

function horn(sr) {
  const n = Math.round(0.55 * sr)
  const out = new Float32Array(n)
  const bp = new Biquad('bandpass', 950, 0.9, sr)
  const lp = new Biquad('lowpass', 3200, 0.7, sr)
  const f1 = 392
  const f2 = 494 // major third apart — classic dual-tone horn
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const s = ((((f1 * t) % 1) * 2 - 1) + (((f2 * t) % 1) * 2 - 1) * 0.9) * 0.5
    const env = Math.min(1, t / 0.015) * Math.min(1, (0.55 - t) / 0.05)
    out[i] = lp.process(bp.process(softclip(s * 2))) * env
  }
  return normalize(out, 0.75)
}

function whooshNoise(sr) {
  const pink = pinkNoise(Math.round(1.5 * sr), 555)
  const white = whiteNoise(pink.length, 556)
  for (let i = 0; i < pink.length; i++) pink[i] = pink[i] * 0.8 + white[i] * 0.2
  return normalize(pink, 0.9)
}

const RENDER = {
  whooshNoise,
  shift,
  backfire0: (sr) => backfire(sr, 0),
  backfire1: (sr) => backfire(sr, 1),
  backfire2: (sr) => backfire(sr, 2),
  wall: (sr) => impact(sr, { len: 0.7, seed: 5 }),
  scrape,
  crash,
  bump,
  hit,
  land,
  driftStart,
  horn,
  ...JINGLES,
}

export const SFX_NAMES = [
  'shift',
  'backfire',
  'wall',
  'scrape',
  'crash',
  'bump',
  'hit',
  'pass',
  'nearMiss',
  'land',
  'checkpoint',
  'extend',
  'countdown',
  'go',
  'goal',
  'timeup',
  'gameover',
  'driftStart',
  'uiMove',
  'uiSelect',
  'uiBack',
  'horn',
]

// bus, base gain, min re-trigger interval (s), music duck [amount, seconds]
const SPEC = {
  shift: { bus: 'sfx', gain: 0.8, cool: 0.05 },
  backfire: { bus: 'engine', gain: 0.55, cool: 0.04 },
  wall: { bus: 'sfx', gain: 0.8, cool: 0.12 },
  scrape: { bus: 'sfx', gain: 0.45, cool: 0.22 },
  crash: { bus: 'sfx', gain: 0.95, cool: 0.5, duck: [0.45, 1.4] },
  bump: { bus: 'sfx', gain: 0.55, cool: 0.1 },
  hit: { bus: 'sfx', gain: 0.75, cool: 0.08 },
  pass: { bus: 'sfx', gain: 0.7, cool: 0.04 },
  nearMiss: { bus: 'sfx', gain: 0.55, cool: 0.2 },
  land: { bus: 'sfx', gain: 0.7, cool: 0.2 },
  checkpoint: { bus: 'ui', gain: 0.8, cool: 0.4, duck: [0.45, 1.3] },
  extend: { bus: 'ui', gain: 0.8, cool: 0.5, duck: [0.5, 2.0] },
  countdown: { bus: 'ui', gain: 0.7, cool: 0.15 },
  go: { bus: 'ui', gain: 0.8, cool: 0.3, duck: [0.3, 0.8] },
  goal: { bus: 'ui', gain: 0.85, cool: 1.0, duck: [0.6, 3.2] },
  timeup: { bus: 'ui', gain: 0.8, cool: 0.8, duck: [0.55, 1.6] },
  gameover: { bus: 'ui', gain: 0.8, cool: 1.0, duck: [0.7, 2.8] },
  driftStart: { bus: 'sfx', gain: 0.4, cool: 0.25 },
  uiMove: { bus: 'ui', gain: 0.5, cool: 0.025 },
  uiSelect: { bus: 'ui', gain: 0.6, cool: 0.05 },
  uiBack: { bus: 'ui', gain: 0.55, cool: 0.05 },
  horn: { bus: 'sfx', gain: 0.45, cool: 0.25 },
}

export const sfxSampleRate = (ctx) => Math.min(ctx.sampleRate, SR_CAP)
export const sfxCacheKey = (key) => 'sfx:' + key

/** Pure render of one sfx buffer → array of channel Float32Arrays (null if unknown). */
export function renderSfxChannels(key, sr) {
  const r = RENDER[key]
  if (!r) return null
  const data = r(sr)
  return Array.isArray(data) ? data : [data]
}

export function getSfxBuffer(ctx, key) {
  if (!RENDER[key]) return null
  return ctxCache(ctx, sfxCacheKey(key), () => {
    const sr = sfxSampleRate(ctx)
    return toAudioBuffer(ctx, renderSfxChannels(key, sr), sr)
  })
}

const noiseLoop = (ctx) => getSfxBuffer(ctx, 'whooshNoise')

/** All renderer keys (used for idle-time prewarming). */
export const SFX_BUFFER_KEYS = Object.keys(RENDER)

export class SfxBank {
  /** @param buses { sfx, ui, engine } destination nodes */
  constructor(ctx, buses, { onDuck } = {}) {
    this.ctx = ctx
    this.buses = buses
    this.onDuck = onDuck || null
    this.lastPlay = Object.create(null)
    this.active = 0
    this.maxActive = 24
  }

  /** Render every buffer now (synchronous). Prefer prewarmStep() in idle time. */
  prewarm() {
    for (const k of SFX_BUFFER_KEYS) getSfxBuffer(this.ctx, k)
  }

  _out(bus, gain, pan) {
    const ctx = this.ctx
    const g = ctx.createGain()
    g.gain.value = gain
    const p = createPanner(ctx, pan)
    g.connect(p)
    p.connect(this.buses[bus] || this.buses.sfx)
    return { g, p }
  }

  _playBuffer(key, { bus = 'sfx', gain = 1, pan = 0, rate = 1, when } = {}) {
    const ctx = this.ctx
    const buf = getSfxBuffer(ctx, key)
    if (!buf) return null
    if (this.active >= this.maxActive) return null
    const t = Math.max(ctx.currentTime, when ?? ctx.currentTime)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const { g, p } = this._out(bus, gain, pan)
    src.connect(g)
    this.active++
    const nodes = [src, g, p]
    src.onended = () => {
      this.active--
      for (const n of nodes) {
        try {
          n.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
    src.start(t)
    return src
  }

  /** Doppler-ish swept band-pass whoosh (+ optional tonal engine hum of the other car). */
  _whoosh({ pan = 0, speed = 30, gain = 0.5, tonal = true, dur, when } = {}) {
    const ctx = this.ctx
    if (this.active >= this.maxActive) return
    const t = Math.max(ctx.currentTime, when ?? ctx.currentTime)
    const d = dur ?? clamp(1.05 - speed / 110, 0.45, 0.95)
    const src = ctx.createBufferSource()
    src.buffer = noiseLoop(ctx)
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    const k = clamp(speed / 60, 0.5, 1.6)
    bp.frequency.setValueAtTime(1500 * k, t)
    bp.frequency.exponentialRampToValueAtTime(2600 * k, t + d * 0.42)
    bp.frequency.exponentialRampToValueAtTime(420 * k, t + d)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + d * 0.45)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d)
    const p = createPanner(ctx, pan * 0.3)
    const sidePan = clamp(pan, -1, 1)
    if (p.pan && p.pan.setValueAtTime) {
      p.pan.setValueAtTime(sidePan * 0.3, t)
      p.pan.linearRampToValueAtTime(sidePan, t + d * 0.45)
      p.pan.linearRampToValueAtTime(sidePan * 0.55, t + d)
    }
    src.connect(bp)
    bp.connect(g)
    g.connect(p)
    p.connect(this.buses.sfx)
    const nodes = [src, bp, g, p]
    let osc = null
    if (tonal) {
      // Other car's engine hum with a doppler drop.
      osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      const f = 95 + Math.random() * 50
      const dop = clamp(speed / 343, 0.02, 0.2)
      osc.frequency.setValueAtTime(f * (1 + dop), t)
      osc.frequency.setValueAtTime(f * (1 + dop), t + d * 0.35)
      osc.frequency.exponentialRampToValueAtTime(f * (1 - dop), t + d * 0.6)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 700
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.0001, t)
      og.gain.exponentialRampToValueAtTime(gain * 0.35, t + d * 0.45)
      og.gain.exponentialRampToValueAtTime(0.0001, t + d)
      osc.connect(lp)
      lp.connect(og)
      og.connect(p)
      nodes.push(osc, lp, og)
      osc.start(t)
      osc.stop(t + d + 0.02)
    }
    this.active++
    src.onended = () => {
      this.active--
      for (const n of nodes) {
        try {
          n.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
    src.start(t, Math.random() * 0.8)
    src.stop(t + d + 0.02)
  }

  /**
   * Play a named effect. Returns true if something was scheduled.
   * opts: { pan, speed, intensity, dir, when }
   */
  play(name, opts = {}) {
    const spec = SPEC[name]
    if (!spec) return false
    const ctx = this.ctx
    const now = ctx.currentTime
    const when = opts.when ?? now
    const last = this.lastPlay[name]
    if (last !== undefined && when - last < spec.cool && when >= last) return false
    this.lastPlay[name] = when
    const pan = clamp(Number(opts.pan) || 0, -1, 1)
    const intensity = clamp(opts.intensity ?? 1, 0, 1)
    const g = spec.gain
    if (spec.duck && this.onDuck) this.onDuck(spec.duck[0], spec.duck[1])

    switch (name) {
      case 'backfire': {
        const v = Math.floor(Math.random() * 3)
        const k = clamp(opts.intensity ?? 0.8, 0.1, 1)
        this._playBuffer('backfire' + v, { bus: 'engine', gain: g * (0.5 + 0.5 * k), pan: (Math.random() - 0.5) * 0.2, rate: 0.85 + Math.random() * 0.3, when })
        return true
      }
      case 'wall':
      case 'hit':
        this._playBuffer(name, { bus: spec.bus, gain: g * (0.35 + 0.65 * intensity), pan, rate: 1.08 - 0.16 * intensity + (Math.random() - 0.5) * 0.06, when })
        return true
      case 'land':
        this._playBuffer('land', { bus: 'sfx', gain: g * (0.4 + 0.6 * intensity), pan, rate: 1.05 - 0.1 * intensity, when })
        return true
      case 'pass':
        this._whoosh({ pan, speed: Number(opts.speed) || 30, gain: g, tonal: true, when })
        return true
      case 'nearMiss':
        this._whoosh({ pan, speed: 55, gain: g * 0.9, tonal: false, dur: 0.38, when })
        this._playBuffer('nearMissChime', { bus: 'ui', gain: 0.5, pan: pan * 0.4, when: when + 0.05 })
        return true
      case 'shift':
        this._playBuffer('shift', { bus: 'sfx', gain: g * ((opts.dir ?? 1) < 0 ? 0.8 : 1), pan: 0, rate: (opts.dir ?? 1) < 0 ? 0.9 : 1, when })
        return true
      case 'crash':
      case 'scrape':
      case 'bump':
      case 'driftStart':
        this._playBuffer(name, { bus: spec.bus, gain: g * (name === 'scrape' || name === 'bump' ? 0.5 + 0.5 * intensity : 1), pan, rate: 0.96 + Math.random() * 0.08, when })
        return true
      case 'horn':
        this._playBuffer('horn', { bus: 'sfx', gain: g, pan, rate: 0.94 + Math.random() * 0.12, when })
        return true
      default:
        this._playBuffer(name, { bus: spec.bus, gain: g, pan, when })
        return true
    }
  }
}

