// Percussive pitched instruments rendered per note in JS (then played as buffers):
//   steel  — FM steel drum (1:1 FM carrier + detuned octave/twelfth partials)
//   marimba — tuned-bar partials (1 : 3.93 : 9.2) with mallet noise
//   piano  — additive piano (inharmonic partials, 2-string beating, hammer noise) for montunos
//   pluck  — Karplus–Strong nylon guitar
// Notes are rendered lazily on first use (or prewarmed in idle time) at 32 kHz and cached.
import { TAU, mtof, rng, Biquad, toAudioBuffer, ctxCache } from '../core/dsp.js'

export const SAMPLER_SR = 32000

const cache = new Map()

function steel(midi, sr) {
  const f = mtof(midi)
  const len = Math.round(1.3 * sr)
  const out = new Float32Array(len)
  const r = rng(midi * 13 + 1)
  const tau1 = 0.62 * Math.pow(660 / f, 0.3)
  const tau2 = tau1 * 0.7
  const tau3 = tau1 * 0.3
  const lp = new Biquad('lowpass', 1800, 0.7, sr)
  let pc = 0
  let p2 = 0
  let p3 = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const bend = 1 - 0.006 * Math.exp(-t / 0.03)
    const fi = f * bend
    pc += fi / sr
    p2 += (fi * 2.004) / sr
    p3 += (fi * 3.012) / sr
    const idx = 0.2 + 1.1 * Math.exp(-t / 0.09)
    const att = Math.min(1, t / 0.0015)
    const carrier = Math.sin(TAU * pc + idx * Math.sin(TAU * pc)) * Math.exp(-t / tau1)
    const oct = Math.sin(TAU * p2) * 0.62 * Math.exp(-t / tau2)
    const twelfth = Math.sin(TAU * p3) * 0.2 * Math.exp(-t / tau3)
    const thump = lp.process(r() * 2 - 1) * Math.exp(-t / 0.004) * 0.25
    out[i] = (carrier + oct + twelfth) * att * 0.55 + thump
  }
  return out
}

function marimba(midi, sr) {
  const f = mtof(midi)
  const len = Math.round(1.0 * sr)
  const out = new Float32Array(len)
  const r = rng(midi * 7 + 3)
  const tau = 0.45 * Math.pow(440 / f, 0.45)
  const bp = new Biquad('bandpass', 2500, 1.2, sr)
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const att = Math.min(1, t / 0.001)
    out[i] =
      (Math.sin(TAU * f * t) * Math.exp(-t / tau) +
        Math.sin(TAU * f * 3.93 * t) * 0.3 * Math.exp(-t / (tau * 0.18)) +
        Math.sin(TAU * f * 9.2 * t) * 0.08 * Math.exp(-t / 0.02)) *
        att *
        0.6 +
      bp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * 0.3
  }
  return out
}

function piano(midi, sr) {
  const f = mtof(midi)
  const len = Math.round(1.5 * sr)
  const out = new Float32Array(len)
  const r = rng(midi * 31 + 5)
  const B = 0.00025 * Math.pow(f / 262, 0.6)
  const T0 = 1.3 * Math.pow(262 / f, 0.45)
  const nPart = Math.max(3, Math.min(14, Math.floor(10500 / f)))
  // Recursive sinusoids: y[n] = 2cos(w)·y[n-1] − y[n-2], amplitude via per-sample decay.
  for (let k = 1; k <= nPart; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k)
    if (fk > sr * 0.45) break
    const amp = (1 / Math.pow(k, 1.15)) * (k === 1 ? 1 : 0.9) * (1 - 0.03 * k)
    const tau = T0 / (1 + 0.38 * (k - 1))
    const strings = k <= 4 ? [0, 0.9 + 0.25 * k] : [0] // cents detune → beating
    for (const cents of strings) {
      const w = (TAU * fk * Math.pow(2, cents / 1200)) / sr
      const c2 = 2 * Math.cos(w)
      let y1 = Math.sin(-w + k)
      let y2 = Math.sin(-2 * w + k)
      const d1 = Math.exp(-1 / (tau * sr))
      const d2 = Math.exp(-1 / (tau * 4 * sr))
      let e1 = 0.72 * amp * (strings.length > 1 ? 0.6 : 1)
      let e2 = 0.28 * amp * (strings.length > 1 ? 0.6 : 1)
      for (let i = 0; i < len; i++) {
        const y = c2 * y1 - y2
        y2 = y1
        y1 = y
        out[i] += y * (e1 + e2)
        e1 *= d1
        e2 *= d2
      }
    }
  }
  const lp = new Biquad('lowpass', 3500, 0.7, sr)
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const att = Math.min(1, t / 0.0012)
    out[i] = out[i] * att * 0.32 + lp.process(r() * 2 - 1) * Math.exp(-t / 0.004) * 0.18
  }
  return out
}

function pluck(midi, sr) {
  const f = mtof(midi)
  const len = Math.round(1.6 * sr)
  const out = new Float32Array(len)
  const r = rng(midi * 17 + 9)
  const P = sr / f
  const N = Math.max(2, Math.floor(P - 0.5))
  const frac = P - 0.5 - N
  const C = (1 - frac) / (1 + frac)
  const d = new Float32Array(N)
  // nylon: warm excitation (low-passed noise), plucked a little off-centre
  let lpState = 0
  for (let i = 0; i < N; i++) {
    lpState += 0.45 * (r() * 2 - 1 - lpState)
    d[i] = lpState
  }
  let idx = 0
  let prev = 0
  let apX = 0
  let apY = 0
  const damp = 0.9965 - Math.min(0.004, f / 400000)
  const body = new Biquad('peaking', 220, 1.2, sr, 4)
  for (let i = 0; i < len; i++) {
    const s = d[idx]
    const avg = 0.5 * (s + prev) * damp
    prev = s
    const ap = C * avg + apX - C * apY
    apX = avg
    apY = ap
    d[idx] = ap
    idx = idx + 1 >= N ? 0 : idx + 1
    out[i] = body.process(ap) * 0.8
  }
  return out
}

const RENDER = { steel, marimba, piano, pluck }

export function renderSamplerNote(preset, midi, sr = SAMPLER_SR) {
  const key = `${preset}:${midi}:${sr}`
  let a = cache.get(key)
  if (!a) {
    const fn = RENDER[preset] || steel
    a = fn(midi, sr)
    // short fade-out at the tail
    const fo = Math.min(a.length, Math.round(0.03 * sr))
    for (let i = 0; i < fo; i++) a[a.length - 1 - i] *= i / fo
    cache.set(key, a)
  }
  return a
}

export const samplerCacheKey = (preset, midi) => `smp:${preset}:${midi}`

/** Store a note rendered elsewhere (worker) so later lookups are free. */
export function installSamplerNote(preset, midi, data, sr = SAMPLER_SR) {
  const key = `${preset}:${midi}:${sr}`
  if (!cache.has(key)) cache.set(key, data)
  return cache.get(key)
}

export function getSamplerBuffer(ctx, preset, midi) {
  return ctxCache(ctx, `smp:${preset}:${midi}`, () => toAudioBuffer(ctx, renderSamplerNote(preset, midi), SAMPLER_SR))
}

export const SAMPLER_PRESETS = Object.keys(RENDER)
