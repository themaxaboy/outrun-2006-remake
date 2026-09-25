// Continuous surface / aero loops driven every frame from updateEngine():
// tyre squeal, wind, rumble strip and gravel. Buffers are rendered procedurally once per
// context (seamless loops) and played by 4 persistent looping sources — no per-frame nodes.
import { TAU, rng, Biquad, pinkNoise, brownNoise, makeLoop, normalize, toAudioBuffer, ctxCache, onePole, clamp } from '../core/dsp.js'
import { setParam } from '../core/env.js'

const SR_CAP = 48000

/** Tonal, slightly rough tyre screech (~2 s loop). */
export function renderSqueal(sr) {
  const n = Math.round(2.3 * sr)
  const out = new Float32Array(n)
  const r = rng(71)
  const bp = new Biquad('bandpass', 1500, 2.5, sr)
  const hp = new Biquad('highpass', 500, 0.7, sr)
  // Smooth random walk for pitch wander + roughness AM.
  let wander = 0
  let wv = 0
  let am = 0
  const aWander = onePole(3, sr)
  const aAm = onePole(45, sr)
  let p1 = 0
  let p2 = 0
  let p3 = 0
  for (let i = 0; i < n; i++) {
    wv += aWander * ((r() * 2 - 1) * 0.06 - wv)
    wander += (wv - wander) * 0.002
    am += aAm * (r() - am)
    const f = 980 * (1 + wander * 2.2 + 0.012 * Math.sin((TAU * 7.3 * i) / sr))
    p1 += f / sr
    p2 += (f * 2.01) / sr
    p3 += (f * 1.37) / sr
    if (p1 > 1) p1 -= 1
    if (p2 > 1) p2 -= 1
    if (p3 > 1) p3 -= 1
    const tone = Math.sin(TAU * p1) * 0.55 + Math.sin(TAU * p2) * 0.22 + Math.sin(TAU * p3) * 0.12
    const noise = bp.process(r() * 2 - 1) * 0.9
    out[i] = hp.process((tone * (0.6 + 0.8 * am) + noise) * (0.75 + 0.25 * am))
  }
  return normalize(makeLoop(out, sr, 0.3), 0.8)
}

/** Airy wind loop with slow built-in gusting (~3 s, integer LFO cycles so it loops). */
export function renderWind(sr) {
  const n = Math.round(3 * sr)
  const pink = pinkNoise(n + Math.round(0.25 * sr), 91)
  const brown = brownNoise(n + Math.round(0.25 * sr), 93)
  const out = new Float32Array(pink.length)
  const lp = new Biquad('lowpass', 2200, 0.5, sr)
  for (let i = 0; i < out.length; i++) {
    const t = i / sr
    const gust = 0.75 + 0.15 * Math.sin((TAU * t) / 3) + 0.1 * Math.sin((TAU * 2 * t) / 3 + 1)
    out[i] = lp.process(pink[i] * 0.8 + brown[i] * 0.6) * gust
  }
  return normalize(makeLoop(out, sr, 0.25), 0.8)
}

/** Rumble strip: 4 low thumps per 0.2 s loop at the reference rate (20 Hz). */
export function renderRumble(sr) {
  const n = Math.round(0.2 * sr)
  const out = new Float32Array(n)
  const r = rng(51)
  const per = Math.round(n / 4)
  for (let k = 0; k < 4; k++) {
    const amp = 0.85 + 0.3 * r()
    const f = 68 + 10 * r()
    const lp = new Biquad('lowpass', 500, 0.7, sr)
    for (let i = 0; i < per; i++) {
      const t = i / sr
      const thump = Math.sin(TAU * f * t * (1 + 0.6 * Math.exp(-t / 0.006))) * Math.exp(-t / 0.02)
      const click = lp.process((r() * 2 - 1) * Math.exp(-t / 0.004)) * 0.6
      const tailFade = Math.min(1, (per - i) / (0.004 * sr)) // no step at thump boundaries / loop seam
      out[k * per + i] = (thump + click) * amp * tailFade
    }
  }
  return normalize(out, 0.85)
}

/** Gravel / off-road crunch: dense tiny grains over a low rumble (~2 s loop). */
export function renderGravel(sr) {
  const n = Math.round(2.2 * sr)
  const out = new Float32Array(n)
  const r = rng(33)
  const brown = brownNoise(n, 34)
  const low = new Biquad('lowpass', 220, 0.7, sr)
  for (let i = 0; i < n; i++) out[i] = low.process(brown[i]) * 1.6
  // Grains.
  const grains = Math.round(2.2 * 520)
  for (let g = 0; g < grains; g++) {
    const start = Math.floor(r() * (n - sr * 0.01))
    const len = Math.round((0.002 + r() * 0.006) * sr)
    const bp = new Biquad('bandpass', 500 + r() * 2600, 1.2 + r() * 2, sr)
    const amp = 0.15 + r() * r() * 0.9
    const tau = len * 0.3
    for (let i = 0; i < len; i++) out[start + i] += bp.process(r() * 2 - 1) * amp * Math.exp(-i / tau) * 3
  }
  return normalize(makeLoop(out, sr, 0.2), 0.8)
}

function buffers(ctx) {
  return ctxCache(ctx, 'loops', () => {
    const sr = Math.min(ctx.sampleRate, SR_CAP)
    return {
      squeal: toAudioBuffer(ctx, renderSqueal(sr), sr),
      wind: toAudioBuffer(ctx, renderWind(sr), sr),
      rumble: toAudioBuffer(ctx, renderRumble(sr), sr),
      gravel: toAudioBuffer(ctx, renderGravel(sr), sr),
    }
  })
}

/** Pre-render the loop buffers for a context (call during idle time). */
export function prewarmLoops(ctx) {
  buffers(ctx)
}

export class DrivingLoops {
  constructor(ctx, dest) {
    this.ctx = ctx
    const b = buffers(ctx)
    const t = ctx.currentTime
    this.stopped = false
    this.last = {}
    const chain = (buf, filterType, f, q) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filt = ctx.createBiquadFilter()
      filt.type = filterType
      filt.frequency.value = f
      filt.Q.value = q
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(filt)
      filt.connect(g)
      g.connect(dest)
      // Random start offset so the loops never line up identically.
      src.start(t, Math.random() * buf.duration * 0.9)
      return { src, filt, g }
    }
    this.squeal = chain(b.squeal, 'bandpass', 1300, 0.6)
    this.wind = chain(b.wind, 'bandpass', 500, 0.45)
    this.rumble = chain(b.rumble, 'lowpass', 420, 0.7)
    this.gravel = chain(b.gravel, 'bandpass', 900, 0.5)
    this.all = [this.squeal, this.wind, this.rumble, this.gravel]
  }

  _set(key, param, v, time, tau, eps) {
    const last = this.last[key]
    if (last !== undefined && Math.abs(last - v) < eps) return
    this.last[key] = v
    setParam(param, v, time, tau)
  }

  update(p, time = this.ctx.currentTime) {
    if (this.stopped) return
    const speed = Math.max(0, p.speed || 0)
    const air = !!p.airborne
    const kmh = speed * 3.6
    const sp = clamp(speed / 85, 0, 1.25)

    // Tyre squeal: gain and pitch from drift + speed; silent in the air.
    const drift = air ? 0 : clamp(p.drift || 0, 0, 1)
    const sq = Math.pow(drift, 1.25) * clamp(speed / 14, 0, 1)
    this._set('sqG', this.squeal.g.gain, sq * 0.55, time, 0.05, 0.004)
    this._set('sqR', this.squeal.src.playbackRate, 0.82 + 0.22 * drift + 0.16 * clamp(speed / 80, 0, 1), time, 0.08, 0.004)
    this._set('sqF', this.squeal.filt.frequency, 1100 + 700 * drift, time, 0.1, 10)

    // Wind: gain ∝ speed², brighter with speed; boosted in the air.
    const w = Math.max(clamp(p.wind ?? 0, 0, 1) * 0.8, sp * sp) * (air ? 1.3 : 1)
    this._set('wG', this.wind.g.gain, w * 0.42, time, 0.12, 0.003)
    this._set('wF', this.wind.filt.frequency, 280 + 1500 * sp, time, 0.2, 8)

    // Rumble strip: thump rate ∝ speed (curb stripes ~1.5 m apart).
    const rum = air ? 0 : clamp(p.rumble || 0, 0, 1) * clamp(speed / 6, 0, 1)
    this._set('rG', this.rumble.g.gain, rum * 0.75, time, 0.025, 0.004)
    this._set('rR', this.rumble.src.playbackRate, clamp(speed / 30, 0.25, 2.6), time, 0.05, 0.01)

    // Gravel / off-road.
    const off = air ? 0 : clamp(p.offroad || 0, 0, 1) * clamp(speed / 5, 0, 1)
    this._set('gG', this.gravel.g.gain, off * 0.7, time, 0.04, 0.004)
    this._set('gR', this.gravel.src.playbackRate, 0.7 + 0.55 * clamp(kmh / 200, 0, 1), time, 0.1, 0.01)
    this._set('gF', this.gravel.filt.frequency, 600 + 900 * clamp(kmh / 200, 0, 1), time, 0.1, 10)
  }

  stop(time = this.ctx.currentTime, fade = 0.2) {
    if (this.stopped) return
    this.stopped = true
    for (const c of this.all) {
      setParam(c.g.gain, 0, time, fade / 4)
      try {
        c.src.stop(time + fade + 0.05)
      } catch {
        /* ignore */
      }
      c.src.onended = () => {
        try {
          c.g.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
  }
}
