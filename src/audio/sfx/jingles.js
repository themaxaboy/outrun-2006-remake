// Original arcade jingles (checkpoint, extended play, goal, countdown, go, time up, game over,
// UI blips). Rendered offline in JS into stereo buffers with a tiny note synth + echo.
import { TAU, mtof, rng, Biquad, softclip, oscSample, panMono, normalize, whiteNoise } from '../core/dsp.js'

const N = (name) => {
  // 'C#5' → MIDI
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]
  return 12 * (Number(m[3]) + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}

/** Render one voice into a mono Float32Array of length `len` (seconds*sr). */
function voice(kind, midi, dur, vel, sr) {
  const f = mtof(midi)
  const tail = kind === 'bell' ? 1.2 : kind === 'brass' ? 0.25 : 0.12
  const len = Math.round((dur + tail) * sr)
  const out = new Float32Array(len)
  const dt = f / sr
  if (kind === 'bell') {
    let pc = 0
    let pm = 0
    let pm2 = 0
    const decay = 0.45 * Math.pow(880 / f, 0.35)
    for (let i = 0; i < len; i++) {
      const t = i / sr
      const idx = 0.25 + 2.2 * Math.exp(-t / 0.07)
      pm += dt * 2
      pm2 += dt * 4.03
      pc += dt
      const env = Math.min(1, t / 0.002) * Math.exp(-t / decay) * (t > dur ? Math.exp(-(t - dur) / 0.25) : 1)
      out[i] = Math.sin(TAU * pc + idx * Math.sin(TAU * pm) + 0.3 * idx * Math.sin(TAU * pm2)) * env * vel
    }
  } else if (kind === 'pulse') {
    let ph = 0
    let lp = 0
    const a = 1 - Math.exp((-TAU * Math.min(7000, f * 6)) / sr)
    for (let i = 0; i < len; i++) {
      const t = i / sr
      const vib = t > 0.14 ? 1 + 0.009 * Math.sin(TAU * 5.6 * (t - 0.14)) : 1
      ph += dt * vib
      if (ph >= 1) ph -= 1
      const s = oscSample('square', ph, dt) * 0.6 + oscSample('saw', ph, dt) * 0.25
      lp += a * (s - lp)
      const att = Math.min(1, t / 0.004)
      const dec = 0.72 + 0.28 * Math.exp(-t / 0.08)
      const rel = t > dur ? Math.exp(-(t - dur) / 0.04) : 1
      out[i] = lp * att * dec * rel * vel
    }
  } else if (kind === 'brass') {
    let p1 = 0
    let p2 = 0
    const bq = new Biquad('lowpass', 800, 1.1, sr)
    for (let i = 0; i < len; i++) {
      const t = i / sr
      if ((i & 31) === 0) {
        const cut = 700 + 3600 * (1 - Math.exp(-t / 0.03)) * (0.55 + 0.45 * Math.exp(-t / 0.2))
        bq.set('lowpass', Math.min(cut, f * 14), 1.1, sr)
      }
      p1 += dt * 1.0035
      p2 += dt * 0.9965
      if (p1 >= 1) p1 -= 1
      if (p2 >= 1) p2 -= 1
      const s = oscSample('saw', p1, dt) + oscSample('saw', p2, dt)
      const att = 1 - Math.exp(-t / 0.012)
      const rel = t > dur ? Math.exp(-(t - dur) / 0.07) : 1
      out[i] = bq.process(s * 0.5) * att * (0.8 + 0.2 * Math.exp(-t / 0.15)) * rel * vel
    }
  } else {
    let ph = 0
    for (let i = 0; i < len; i++) {
      const t = i / sr
      ph += dt * (1 - 0.04 * Math.min(1, t / Math.max(0.01, dur)))
      const env = Math.min(1, t / 0.002) * (t > dur ? Math.exp(-(t - dur) / 0.02) : Math.exp(-t / (dur * 2 + 0.02)))
      out[i] = Math.sin(TAU * ph) * env * vel
    }
  }
  return out
}

const PAN = { bell: 0.22, pulse: 0, brass: -0.18, sine: 0 }

/**
 * notes: [time, inst, noteName|midi, dur, vel]
 * extra: optional function(L, R, sr) to add drums etc.
 */
function renderScore(notes, seconds, sr, { echo = 0.22, echoTime = 0.16, extra, peak = 0.8 } = {}) {
  const n = Math.round(seconds * sr)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  for (const [t, inst, note, dur, vel] of notes) {
    const midi = typeof note === 'number' ? note : N(note)
    const v = voice(inst, midi, dur, vel ?? 0.8, sr)
    const [l, r] = panMono(v, PAN[inst] || 0)
    const o = Math.round(t * sr)
    const m = Math.min(v.length, n - o)
    for (let i = 0; i < m; i++) {
      L[o + i] += l[i]
      R[o + i] += r[i]
    }
  }
  if (extra) extra(L, R, sr)
  // Ping-pong echo for arcade sparkle.
  if (echo > 0) {
    const d = Math.round(echoTime * sr)
    const lp = new Biquad('lowpass', 3500, 0.6, sr)
    const lp2 = new Biquad('lowpass', 3500, 0.6, sr)
    for (let i = d; i < n; i++) {
      L[i] += lp.process(R[i - d]) * echo
      R[i] += lp2.process(L[i - d]) * echo
    }
  }
  for (let i = 0; i < n; i++) {
    L[i] = softclip(L[i] * 0.9)
    R[i] = softclip(R[i] * 0.9)
  }
  // Common peak normalisation across channels.
  let p = 0
  for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]))
  if (p > 1e-6) {
    const k = peak / p
    for (let i = 0; i < n; i++) {
      L[i] *= k
      R[i] *= k
    }
  }
  const fadeN = Math.min(n, Math.round(0.05 * sr))
  for (let i = 0; i < fadeN; i++) {
    const g = i / fadeN
    L[n - 1 - i] *= g
    R[n - 1 - i] *= g
  }
  return [L, R]
}

/** Noise-based cymbal swell / crash used inside jingles. */
function addCrash(L, R, sr, at, gain = 0.25) {
  const len = Math.round(1.6 * sr)
  const noise = whiteNoise(len, 404)
  const hp = new Biquad('highpass', 5000, 0.7, sr)
  const o = Math.round(at * sr)
  for (let i = 0; i < len && o + i < L.length; i++) {
    const t = i / sr
    const v = hp.process(noise[i]) * Math.exp(-t / 0.5) * gain
    L[o + i] += v
    R[o + i] += v * 0.9
  }
}

function addKick(L, R, sr, at, gain = 0.5) {
  const len = Math.round(0.4 * sr)
  const o = Math.round(at * sr)
  let ph = 0
  for (let i = 0; i < len && o + i < L.length; i++) {
    const t = i / sr
    ph += (48 + 100 * Math.exp(-t / 0.03)) / sr
    const v = Math.sin(TAU * ph) * Math.exp(-t / 0.25) * gain
    L[o + i] += v
    R[o + i] += v
  }
}

export const JINGLES = {
  countdown: (sr) =>
    renderScore(
      [
        [0, 'pulse', 'A5', 0.16, 0.7],
        [0, 'sine', 'A5', 0.18, 0.5],
      ],
      0.45,
      sr,
      { echo: 0.12, peak: 0.6 },
    ),

  go: (sr) =>
    renderScore(
      [
        [0, 'pulse', 'A6', 0.5, 0.6],
        [0, 'sine', 'A5', 0.5, 0.5],
        [0, 'brass', 'A4', 0.55, 0.5],
        [0, 'brass', 'C#5', 0.55, 0.45],
        [0, 'brass', 'E5', 0.55, 0.45],
        [0.05, 'bell', 'E6', 0.3, 0.35],
        [0.1, 'bell', 'A6', 0.3, 0.3],
        [0.15, 'bell', 'C#7', 0.3, 0.25],
      ],
      1.3,
      sr,
      { peak: 0.75 },
    ),

  checkpoint: (sr) =>
    renderScore(
      [
        [0.0, 'bell', 'E5', 0.1, 0.7],
        [0.07, 'bell', 'G#5', 0.1, 0.7],
        [0.14, 'bell', 'B5', 0.1, 0.7],
        [0.21, 'bell', 'E6', 0.6, 0.8],
        [0.21, 'pulse', 'E6', 0.34, 0.45],
        [0.21, 'pulse', 'B5', 0.34, 0.3],
        [0.21, 'brass', 'E4', 0.4, 0.35],
        [0.21, 'brass', 'G#4', 0.4, 0.3],
        [0.21, 'brass', 'B4', 0.4, 0.3],
        [0.42, 'bell', 'G#6', 0.3, 0.35],
        [0.49, 'bell', 'B6', 0.3, 0.3],
        [0.56, 'bell', 'E7', 0.3, 0.25],
      ],
      1.6,
      sr,
    ),

  extend: (sr) =>
    renderScore(
      [
        // melody
        [0.0, 'pulse', 'A5', 0.12, 0.6],
        [0.15, 'pulse', 'A5', 0.1, 0.55],
        [0.3, 'pulse', 'B5', 0.12, 0.6],
        [0.45, 'pulse', 'C#6', 0.12, 0.6],
        [0.6, 'pulse', 'D6', 0.18, 0.65],
        [0.8, 'pulse', 'B5', 0.1, 0.55],
        [0.9, 'pulse', 'D6', 0.1, 0.6],
        [1.0, 'pulse', 'F#6', 0.6, 0.7],
        // brass chords: D → A/C# → G → Dmaj9
        [0.0, 'brass', 'D4', 0.26, 0.4],
        [0.0, 'brass', 'F#4', 0.26, 0.35],
        [0.0, 'brass', 'A4', 0.26, 0.35],
        [0.3, 'brass', 'C#4', 0.26, 0.4],
        [0.3, 'brass', 'E4', 0.26, 0.35],
        [0.3, 'brass', 'A4', 0.26, 0.35],
        [0.6, 'brass', 'B3', 0.36, 0.4],
        [0.6, 'brass', 'D4', 0.36, 0.35],
        [0.6, 'brass', 'G4', 0.36, 0.35],
        [1.0, 'brass', 'D4', 0.7, 0.4],
        [1.0, 'brass', 'F#4', 0.7, 0.35],
        [1.0, 'brass', 'A4', 0.7, 0.35],
        [1.0, 'brass', 'C#5', 0.7, 0.3],
        [1.0, 'brass', 'E5', 0.7, 0.3],
        [1.0, 'bell', 'F#6', 0.5, 0.4],
        [1.08, 'bell', 'A6', 0.4, 0.3],
        [1.16, 'bell', 'D7', 0.4, 0.25],
      ],
      2.3,
      sr,
    ),

  goal: (sr) =>
    renderScore(
      [
        // melody (pulse lead doubled by brass)
        [0.0, 'pulse', 'F5', 0.1, 0.6],
        [0.12, 'pulse', 'Bb5', 0.1, 0.6],
        [0.24, 'pulse', 'D6', 0.1, 0.62],
        [0.36, 'pulse', 'F6', 0.5, 0.7],
        [0.9, 'pulse', 'Eb6', 0.14, 0.6],
        [1.05, 'pulse', 'D6', 0.14, 0.6],
        [1.2, 'pulse', 'C6', 0.14, 0.6],
        [1.35, 'pulse', 'D6', 0.3, 0.62],
        [1.7, 'pulse', 'Bb5', 0.14, 0.58],
        [1.85, 'pulse', 'C6', 0.14, 0.6],
        [2.0, 'pulse', 'D6', 1.1, 0.7],
        // harmony: Bb → Eb/Bb → F/A → Gm7 → Bb(add9)
        [0.0, 'brass', 'Bb3', 0.85, 0.35],
        [0.0, 'brass', 'D4', 0.85, 0.3],
        [0.0, 'brass', 'F4', 0.85, 0.3],
        [0.9, 'brass', 'Bb3', 0.42, 0.35],
        [0.9, 'brass', 'Eb4', 0.42, 0.3],
        [0.9, 'brass', 'G4', 0.42, 0.3],
        [1.35, 'brass', 'A3', 0.33, 0.35],
        [1.35, 'brass', 'C4', 0.33, 0.3],
        [1.35, 'brass', 'F4', 0.33, 0.3],
        [1.7, 'brass', 'G3', 0.28, 0.35],
        [1.7, 'brass', 'Bb3', 0.28, 0.3],
        [1.7, 'brass', 'D4', 0.28, 0.3],
        [1.7, 'brass', 'F4', 0.28, 0.28],
        [2.0, 'brass', 'Bb3', 1.2, 0.38],
        [2.0, 'brass', 'D4', 1.2, 0.32],
        [2.0, 'brass', 'F4', 1.2, 0.32],
        [2.0, 'brass', 'C5', 1.2, 0.28],
        [2.0, 'bell', 'D6', 0.6, 0.4],
        [2.08, 'bell', 'F6', 0.5, 0.35],
        [2.16, 'bell', 'Bb6', 0.5, 0.3],
        [2.24, 'bell', 'D7', 0.5, 0.25],
      ],
      3.6,
      sr,
      {
        extra: (L, R, s) => {
          addKick(L, R, s, 0, 0.5)
          addCrash(L, R, s, 0, 0.2)
          addKick(L, R, s, 2.0, 0.5)
          addCrash(L, R, s, 2.0, 0.25)
        },
      },
    ),

  timeup: (sr) =>
    renderScore(
      [
        [0.0, 'pulse', 'G5', 0.12, 0.6],
        [0.14, 'pulse', 'E5', 0.12, 0.6],
        [0.28, 'pulse', 'C5', 0.12, 0.6],
        [0.42, 'pulse', 'A4', 0.7, 0.65],
        [0.42, 'brass', 'A3', 0.6, 0.4],
        [0.42, 'brass', 'C4', 0.6, 0.35],
        [0.42, 'brass', 'E4', 0.6, 0.35],
      ],
      1.6,
      sr,
      { echo: 0.15 },
    ),

  gameover: (sr) =>
    renderScore(
      [
        [0.0, 'pulse', 'E5', 0.34, 0.5],
        [0.4, 'pulse', 'D5', 0.34, 0.5],
        [0.8, 'pulse', 'C5', 0.34, 0.5],
        [1.2, 'pulse', 'B4', 0.34, 0.5],
        [1.6, 'pulse', 'A4', 1.0, 0.55],
        [0.0, 'bell', 'E5', 0.3, 0.3],
        [0.8, 'bell', 'C5', 0.3, 0.3],
        [1.6, 'bell', 'A4', 0.6, 0.3],
        // Am(add9) → Fmaj7 → Am
        [0.0, 'brass', 'A3', 0.78, 0.28],
        [0.0, 'brass', 'C4', 0.78, 0.24],
        [0.0, 'brass', 'E4', 0.78, 0.24],
        [0.8, 'brass', 'F3', 0.78, 0.28],
        [0.8, 'brass', 'A3', 0.78, 0.24],
        [0.8, 'brass', 'C4', 0.78, 0.24],
        [0.8, 'brass', 'E4', 0.78, 0.22],
        [1.6, 'brass', 'A3', 1.0, 0.28],
        [1.6, 'brass', 'C4', 1.0, 0.24],
        [1.6, 'brass', 'E4', 1.0, 0.24],
      ],
      3.0,
      sr,
      { echo: 0.2, echoTime: 0.2 },
    ),

  uiMove: (sr) => renderScore([[0, 'sine', 'E6', 0.035, 0.6]], 0.12, sr, { echo: 0, peak: 0.45 }),

  uiSelect: (sr) =>
    renderScore(
      [
        [0, 'bell', 'E6', 0.08, 0.6],
        [0.06, 'bell', 'B6', 0.18, 0.6],
      ],
      0.6,
      sr,
      { echo: 0.1, peak: 0.55 },
    ),

  uiBack: (sr) =>
    renderScore(
      [
        [0, 'bell', 'B5', 0.07, 0.5],
        [0.06, 'bell', 'E5', 0.14, 0.5],
      ],
      0.5,
      sr,
      { echo: 0.06, peak: 0.45 },
    ),

  nearMissChime: (sr) =>
    renderScore(
      [
        [0, 'bell', 'B6', 0.06, 0.5],
        [0.05, 'bell', 'E7', 0.12, 0.4],
      ],
      0.45,
      sr,
      { echo: 0.08, peak: 0.35 },
    ),
}

// Exposed for tests / tooling.
export const _internal = { N, rng }
