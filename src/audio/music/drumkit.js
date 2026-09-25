// Drum and Latin percussion one-shots, synthesised once per context into stereo AudioBuffers
// (panning baked in → one BufferSource + one velocity Gain per hit at play time).
import { TAU, rng, Biquad, softclip, normalize, fadeEdges, panMono, toAudioBuffer, ctxCache } from '../core/dsp.js'

const SR_CAP = 48000

// 808-style metallic oscillator bank frequencies.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]

function metal(n, sr, scale = 1) {
  const out = new Float32Array(n)
  const ph = new Float64Array(METAL.length)
  for (let i = 0; i < n; i++) {
    let s = 0
    for (let k = 0; k < METAL.length; k++) {
      ph[k] += (METAL[k] * scale) / sr
      if (ph[k] >= 1) ph[k] -= 1
      s += ph[k] < 0.5 ? 1 : -1
    }
    out[i] = s / METAL.length
  }
  return out
}

const R = {
  kick(sr) {
    const n = Math.round(0.5 * sr)
    const out = new Float32Array(n)
    const r = rng(1)
    const hp = new Biquad('highpass', 3000, 0.7, sr)
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const f = 46 + 105 * Math.exp(-t / 0.032) + 60 * Math.exp(-t / 0.004)
      ph += f / sr
      const amp = t < 0.012 ? 1 : Math.exp(-(t - 0.012) / 0.26)
      const body = Math.sin(TAU * ph) * amp
      const click = hp.process(r() * 2 - 1) * Math.exp(-t / 0.0018) * 0.35
      out[i] = softclip(1.7 * body) + click
    }
    return normalize(fadeEdges(out, sr, 0.1, 30), 0.95)
  },
  snare(sr) {
    const n = Math.round(0.36 * sr)
    const out = new Float32Array(n)
    const r = rng(2)
    const hp = new Biquad('highpass', 1300, 0.7, sr)
    const lp = new Biquad('lowpass', 9500, 0.7, sr)
    let p1 = 0
    let p2 = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      p1 += (185 * (1 + 0.25 * Math.exp(-t / 0.01))) / sr
      p2 += (330 * (1 + 0.2 * Math.exp(-t / 0.01))) / sr
      const tone = Math.sin(TAU * p1) * Math.exp(-t / 0.055) * 0.75 + Math.sin(TAU * p2) * Math.exp(-t / 0.032) * 0.4
      const noise = lp.process(hp.process(r() * 2 - 1)) * (Math.exp(-t / 0.13) * 0.85 + Math.exp(-t / 0.012) * 0.4)
      out[i] = softclip(1.4 * (tone + noise))
    }
    return normalize(fadeEdges(out, sr, 0.1, 30), 0.9)
  },
  clap(sr) {
    const n = Math.round(0.42 * sr)
    const out = new Float32Array(n)
    const r = rng(3)
    const bp = new Biquad('bandpass', 1150, 1.1, sr)
    const hp = new Biquad('highpass', 600, 0.7, sr)
    const bursts = [0, 0.0105, 0.0215, 0.0335]
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let env = 0
      for (const b of bursts) if (t >= b) env += Math.exp(-(t - b) / 0.0055) * (b === 0.0335 ? 1 : 0.8)
      if (t > 0.0335) env += Math.exp(-(t - 0.0335) / 0.11) * 0.55
      out[i] = hp.process(bp.process(r() * 2 - 1)) * env * 2.2
    }
    return normalize(fadeEdges(out, sr, 0.1, 30), 0.85)
  },
  rim(sr) {
    const n = Math.round(0.07 * sr)
    const out = new Float32Array(n)
    const r = rng(4)
    const hp = new Biquad('highpass', 2000, 0.7, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = Math.sin(TAU * 1720 * t) * Math.exp(-t / 0.011) * 0.8 + Math.sin(TAU * 520 * t) * Math.exp(-t / 0.008) * 0.4 + hp.process(r() * 2 - 1) * Math.exp(-t / 0.003) * 0.5
    }
    return normalize(fadeEdges(out, sr, 0.05, 8), 0.8)
  },
  hat(sr) {
    const n = Math.round(0.09 * sr)
    const m = metal(n, sr, 1.7)
    const r = rng(5)
    const hp1 = new Biquad('highpass', 7000, 0.7, sr)
    const hp2 = new Biquad('highpass', 7000, 0.7, sr)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = hp2.process(hp1.process(m[i] * 0.8 + (r() * 2 - 1) * 0.45)) * Math.exp(-t / 0.017)
    }
    return normalize(fadeEdges(out, sr, 0.05, 10), 0.7)
  },
  ohat(sr) {
    const n = Math.round(0.5 * sr)
    const m = metal(n, sr, 1.7)
    const r = rng(6)
    const hp1 = new Biquad('highpass', 6500, 0.7, sr)
    const hp2 = new Biquad('highpass', 6500, 0.7, sr)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = hp2.process(hp1.process(m[i] * 0.8 + (r() * 2 - 1) * 0.45)) * (Math.exp(-t / 0.13) * 0.9 + Math.exp(-t / 0.01) * 0.3)
    }
    return normalize(fadeEdges(out, sr, 0.05, 40), 0.65)
  },
  shaker(sr) {
    const n = Math.round(0.13 * sr)
    const out = new Float32Array(n)
    const r = rng(7)
    const hp = new Biquad('highpass', 4800, 0.8, sr)
    const lp = new Biquad('lowpass', 12000, 0.7, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const env = t < 0.014 ? Math.pow(t / 0.014, 1.5) : Math.exp(-(t - 0.014) / 0.034)
      out[i] = lp.process(hp.process(r() * 2 - 1)) * env
    }
    return normalize(fadeEdges(out, sr, 0.05, 10), 0.6)
  },
  tomHi: (sr) => tom(sr, 205, 8),
  tomMid: (sr) => tom(sr, 150, 9),
  tomLo: (sr) => tom(sr, 108, 10),
  timbHi: (sr) => timbale(sr, 540, 11),
  timbLo: (sr) => timbale(sr, 385, 12),
  paila(sr) {
    const n = Math.round(0.07 * sr)
    const out = new Float32Array(n)
    const r = rng(13)
    const bp = new Biquad('bandpass', 2600, 2.2, sr)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = bp.process(r() * 2 - 1) * Math.exp(-t / 0.011) * 2.2 + Math.sin(TAU * 1850 * t) * Math.exp(-t / 0.009) * 0.5 + Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.006) * 0.25
    }
    return normalize(fadeEdges(out, sr, 0.05, 8), 0.75)
  },
  congaHi: (sr) => conga(sr, 335, 0.2, 14, 0.25),
  congaLo: (sr) => conga(sr, 238, 0.24, 15, 0.22),
  congaMute: (sr) => conga(sr, 300, 0.045, 16, 0.35),
  congaSlap(sr) {
    const n = Math.round(0.16 * sr)
    const out = new Float32Array(n)
    const r = rng(17)
    const bp = new Biquad('bandpass', 1900, 1.2, sr)
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      ph += (360 * (1 + 0.08 * Math.exp(-t / 0.01))) / sr
      out[i] = bp.process(r() * 2 - 1) * Math.exp(-t / 0.025) * 1.6 + Math.sin(TAU * ph) * Math.exp(-t / 0.045) * 0.5
    }
    return normalize(fadeEdges(out, sr, 0.05, 10), 0.8)
  },
  cowbell(sr) {
    const n = Math.round(0.4 * sr)
    const out = new Float32Array(n)
    const bp = new Biquad('bandpass', 2400, 1.1, sr)
    let p1 = 0
    let p2 = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      p1 += 562 / sr
      p2 += 845 / sr
      if (p1 >= 1) p1 -= 1
      if (p2 >= 1) p2 -= 1
      const s = (p1 < 0.5 ? 1 : -1) + (p2 < 0.5 ? 1 : -1)
      out[i] = bp.process(s * 0.5) * (Math.exp(-t / 0.045) * 0.7 + Math.exp(-t / 0.2) * 0.3)
    }
    return normalize(fadeEdges(out, sr, 0.05, 20), 0.7)
  },
  clave(sr) {
    const n = Math.round(0.1 * sr)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = Math.sin(TAU * 2480 * t) * Math.exp(-t / 0.022) + Math.sin(TAU * 4960 * t) * Math.exp(-t / 0.008) * 0.2
    }
    return normalize(fadeEdges(out, sr, 0.05, 10), 0.7)
  },
  crash(sr) {
    const n = Math.round(2.0 * sr)
    const m = metal(n, sr, 2.35)
    const r = rng(19)
    const hp1 = new Biquad('highpass', 4200, 0.7, sr)
    const hp2 = new Biquad('highpass', 3000, 0.6, sr)
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const env = Math.exp(-t / 0.7) * 0.8 + Math.exp(-t / 0.05) * 0.4
      out[i] = hp2.process(hp1.process(m[i] * 0.55 + (r() * 2 - 1) * 0.8)) * env
    }
    return normalize(fadeEdges(out, sr, 0.1, 80), 0.6)
  },
}

function tom(sr, f0, seed) {
  const n = Math.round(0.5 * sr)
  const out = new Float32Array(n)
  const r = rng(seed)
  const lp = new Biquad('lowpass', 1500, 0.7, sr)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    ph += (f0 * (1 + 0.45 * Math.exp(-t / 0.035))) / sr
    out[i] = Math.sin(TAU * ph) * Math.exp(-t / 0.2) + lp.process(r() * 2 - 1) * Math.exp(-t / 0.01) * 0.35
  }
  return normalize(fadeEdges(out, sr, 0.1, 30), 0.85)
}

function timbale(sr, f0, seed) {
  const n = Math.round(0.45 * sr)
  const out = new Float32Array(n)
  const r = rng(seed)
  const bp = new Biquad('bandpass', 3200, 1.5, sr)
  const parts = [
    [1, 1, 0.24],
    [1.52, 0.55, 0.12],
    [2.27, 0.38, 0.08],
    [2.93, 0.22, 0.05],
  ]
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const bend = 1 + 0.03 * Math.exp(-t / 0.015)
    let s = 0
    for (const [ratio, amp, tau] of parts) s += Math.sin(TAU * f0 * ratio * bend * t) * amp * Math.exp(-t / tau)
    out[i] = s + bp.process(r() * 2 - 1) * Math.exp(-t / 0.008) * 0.9
  }
  return normalize(fadeEdges(out, sr, 0.05, 30), 0.8)
}

function conga(sr, f0, decay, seed, noiseAmt) {
  const n = Math.round((decay * 2.5 + 0.03) * sr)
  const out = new Float32Array(n)
  const r = rng(seed)
  const bp = new Biquad('bandpass', 1400, 1, sr)
  let p1 = 0
  let p2 = 0
  let p3 = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const bend = 1 + 0.06 * Math.exp(-t / 0.018)
    p1 += (f0 * bend) / sr
    p2 += (f0 * 1.59 * bend) / sr
    p3 += (f0 * 2.14 * bend) / sr
    out[i] =
      Math.sin(TAU * p1) * Math.exp(-t / decay) +
      Math.sin(TAU * p2) * 0.3 * Math.exp(-t / (decay * 0.5)) +
      Math.sin(TAU * p3) * 0.15 * Math.exp(-t / (decay * 0.35)) +
      bp.process(r() * 2 - 1) * Math.exp(-t / 0.006) * noiseAmt * 2
  }
  return normalize(fadeEdges(out, sr, 0.05, 15), 0.85)
}

// Baked stereo placement (audience view).
export const DRUM_PAN = {
  kick: 0,
  snare: 0.06,
  clap: -0.04,
  rim: 0.1,
  hat: 0.28,
  ohat: 0.28,
  shaker: -0.32,
  tomHi: 0.32,
  tomMid: 0.05,
  tomLo: -0.28,
  timbHi: 0.36,
  timbLo: 0.22,
  paila: 0.3,
  congaHi: -0.38,
  congaLo: -0.22,
  congaSlap: -0.38,
  congaMute: -0.38,
  cowbell: 0.18,
  clave: -0.12,
  crash: -0.25,
}

// Mix trim per voice so patterns can use plain x/X/o velocities.
export const DRUM_LEVEL = {
  kick: 1.0,
  snare: 0.62,
  clap: 0.55,
  rim: 0.45,
  hat: 0.34,
  ohat: 0.3,
  shaker: 0.3,
  tomHi: 0.55,
  tomMid: 0.55,
  tomLo: 0.6,
  timbHi: 0.42,
  timbLo: 0.45,
  paila: 0.3,
  congaHi: 0.45,
  congaLo: 0.48,
  congaSlap: 0.42,
  congaMute: 0.32,
  cowbell: 0.3,
  clave: 0.3,
  crash: 0.42,
}

/** Mono Float32Array for a drum voice at `sr` (exported for tests / jingles). */
export function renderDrum(name, sr) {
  const f = R[name]
  if (!f) throw new Error(`unknown drum ${name}`)
  return f(sr)
}

export const DRUM_NAMES = Object.keys(R)

export const drumSampleRate = (ctx) => Math.min(ctx.sampleRate, SR_CAP)
export const drumCacheKey = (name) => 'drum:' + name

/** Stereo [L, R] arrays with the voice's pan baked in. */
export function renderDrumStereo(name, sr) {
  return panMono(renderDrum(name, sr), DRUM_PAN[name] || 0)
}

/** Stereo AudioBuffer for one voice, cached per context (rendered on first use if needed). */
export function getDrumBuffer(ctx, name) {
  if (!R[name]) return null
  return ctxCache(ctx, drumCacheKey(name), () => {
    const sr = drumSampleRate(ctx)
    return toAudioBuffer(ctx, renderDrumStereo(name, sr), sr)
  })
}

