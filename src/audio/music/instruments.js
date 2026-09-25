// Music instruments. Designed for low node churn:
//   • MonoSynth (bass, lead) and ParaSynth (pad, brass stabs) are PERSISTENT voices — their
//     oscillators run for the life of the track and notes are pure AudioParam automation.
//   • EPiano creates 4 nodes per note (2-op FM), Sampler/DrumKit 2 nodes per hit; all are
//     stopped on time and disconnected on `ended`, and polyphony is capped by a VoicePool.
import { mtof } from '../core/dsp.js'
import { createPanner } from '../core/env.js'
import { getSamplerBuffer } from './samplers.js'
import { getDrumBuffers, DRUM_LEVEL } from './drumkit.js'
import { createChorus } from './fx.js'

// ── voice pool ────────────────────────────────────────────────────────────────────────────
export class VoicePool {
  constructor(cap = 24) {
    this.cap = cap
    this.voices = [] // { start, end, kill(t) }
    this.stolen = 0
    this.peak = 0
  }
  /** Register a voice sounding from `start` to `end`; steals the oldest if over the cap. */
  add(start, end, kill) {
    const v = this.voices
    // drop voices that have finished by `start`
    let w = 0
    for (let i = 0; i < v.length; i++) if (v[i].end > start) v[w++] = v[i]
    v.length = w
    while (v.length >= this.cap) {
      let oldest = 0
      for (let i = 1; i < v.length; i++) if (v[i].start < v[oldest].start) oldest = i
      const [victim] = v.splice(oldest, 1)
      victim.kill(start)
      this.stolen++
    }
    v.push({ start, end, kill })
    if (v.length > this.peak) this.peak = v.length
  }
  get active() {
    return this.voices.length
  }
}

const cleanup = (src, nodes) => {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
  }
}

// ── channel strip ─────────────────────────────────────────────────────────────────────────
export class ChannelStrip {
  constructor(ctx, def, { out, reverb, delay }) {
    this.input = ctx.createGain()
    this.input.gain.value = def.gain ?? 0.5
    this.pan = createPanner(ctx, def.pan ?? 0)
    this.input.connect(this.pan)
    this.pan.connect(out)
    this.nodes = [this.input, this.pan]
    if (def.rev && reverb) {
      const s = ctx.createGain()
      s.gain.value = def.rev
      this.input.connect(s)
      s.connect(reverb)
      this.nodes.push(s)
    }
    if (def.dly && delay) {
      const s = ctx.createGain()
      s.gain.value = def.dly
      this.input.connect(s)
      s.connect(delay)
      this.nodes.push(s)
    }
  }
  dispose() {
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
  }
}

// ── drums ─────────────────────────────────────────────────────────────────────────────────
export class DrumKit {
  constructor(ctx, dest, def = {}) {
    this.ctx = ctx
    this.dest = dest
    this.bufs = getDrumBuffers(ctx)
    this.level = { ...DRUM_LEVEL, ...(def.levels || {}) }
  }
  play(t, ev) {
    const buf = this.bufs[ev.drum]
    if (!buf) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = ev.v * (this.level[ev.drum] ?? 0.5)
    src.connect(g)
    g.connect(this.dest)
    cleanup(src, [src, g])
    src.start(t)
  }
}

// ── 2-op FM electric piano (poly, live) ──────────────────────────────────────────────────
const EP_PRESETS = {
  bright: { ratio: 1, i0: 3.0, i1: 0.5, iTau: 0.32, aTau: 1.5, rel: 0.12, level: 0.2, modDetune: 0.7 },
  mellow: { ratio: 1, i0: 1.7, i1: 0.32, iTau: 0.42, aTau: 1.8, rel: 0.14, level: 0.22, modDetune: 0.5 },
  clav: { ratio: 1, i0: 4.2, i1: 1.3, iTau: 0.09, aTau: 0.35, rel: 0.03, level: 0.24, modDetune: 0 },
}

export class EPiano {
  constructor(ctx, dest, def, pool) {
    this.ctx = ctx
    this.p = { ...EP_PRESETS[def.preset || 'bright'], ...(def.params || {}) }
    this.pool = pool
    // Suitcase-style auto-pan tremolo on the whole instrument.
    this.bus = ctx.createGain()
    this.panner = createPanner(ctx, 0)
    this.bus.connect(this.panner)
    this.panner.connect(dest)
    this.lfo = null
    if (def.tremolo && this.panner.pan && this.panner.pan.value !== undefined && ctx.createStereoPanner) {
      this.lfo = ctx.createOscillator()
      this.lfo.frequency.value = def.tremolo.rate ?? 4.2
      const d = ctx.createGain()
      d.gain.value = def.tremolo.depth ?? 0.35
      this.lfo.connect(d)
      d.connect(this.panner.pan)
      this.lfoDepth = d
    }
  }
  start(t) {
    if (this.lfo) this.lfo.start(t)
  }
  stop(t) {
    if (this.lfo) this.lfo.stop(t)
  }
  play(t, ev, dur) {
    for (const m of ev.n) this.note(t, m, dur, ev.v)
  }
  note(t, midi, dur, vel) {
    const ctx = this.ctx
    const p = this.p
    const f = mtof(midi)
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    const idx = ctx.createGain()
    const amp = ctx.createGain()
    car.frequency.value = f
    mod.frequency.value = f * p.ratio + p.modDetune
    const dev = f * p.ratio // peak deviation (Hz) per unit index
    const iv = 0.6 + 0.4 * vel
    idx.gain.setValueAtTime(dev * p.i0 * iv, t)
    idx.gain.setTargetAtTime(dev * p.i1 * iv, t, p.iTau)
    const peak = p.level * vel
    const aTau = p.aTau * Math.pow(440 / f, 0.25)
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(peak, t + 0.003)
    amp.gain.setTargetAtTime(0, t + 0.003, aTau)
    const end = t + Math.max(0.03, dur)
    amp.gain.setTargetAtTime(0, end, p.rel)
    const stopAt = end + p.rel * 5
    mod.connect(idx)
    idx.connect(car.frequency)
    car.connect(amp)
    amp.connect(this.bus)
    car.start(t)
    mod.start(t)
    car.stop(stopAt)
    mod.stop(stopAt)
    cleanup(car, [car, mod, idx, amp])
    this.pool.add(t, stopAt, (k) => {
      amp.gain.setTargetAtTime(0, k, 0.012)
    })
  }
}

// ── sampled percussive instruments (steel drum, marimba, piano, pluck) ────────────────────
export class Sampler {
  constructor(ctx, dest, def, pool) {
    this.ctx = ctx
    this.dest = dest
    this.preset = def.preset || 'steel'
    this.level = def.level ?? 0.8
    this.rel = def.release ?? 0.08
    this.pool = pool
  }
  play(t, ev, dur) {
    for (const m of ev.n) this.note(t, m, dur, ev.v)
  }
  note(t, midi, dur, vel) {
    const ctx = this.ctx
    const buf = getSamplerBuffer(ctx, this.preset, midi)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    g.gain.value = this.level * vel
    src.connect(g)
    g.connect(this.dest)
    const bufEnd = t + buf.duration
    let stopAt = bufEnd
    const end = t + Math.max(0.02, dur)
    if (end < bufEnd - 0.05) {
      g.gain.setTargetAtTime(0, end, this.rel)
      stopAt = Math.min(bufEnd, end + this.rel * 6)
    }
    src.start(t)
    src.stop(stopAt)
    cleanup(src, [src, g])
    this.pool.add(t, stopAt, (k) => g.gain.setTargetAtTime(0, k, 0.01))
  }
}

// ── persistent monophonic synth (bass, lead) ─────────────────────────────────────────────
const MONO_PRESETS = {
  // warm fingered synth bass
  round: {
    oscs: [
      ['triangle', 0, 0.8],
      ['sine', 0, 0.55],
      ['sawtooth', 0, 0.16],
    ],
    cutoff: 420,
    q: 1.2,
    key: 0.6,
    env: 3.5,
    fTau: 0.09,
    attack: 0.004,
    decay: 0.35,
    sustain: 0.72,
    release: 0.05,
    level: 0.5,
  },
  // slap: resonant "quack" filter envelope, harder on accents (pops)
  slap: {
    oscs: [
      ['sawtooth', 0, 0.55],
      ['square', 0, 0.22],
      ['sine', 0, 0.6],
    ],
    cutoff: 260,
    q: 5.5,
    key: 0.8,
    env: 16,
    fTau: 0.055,
    attack: 0.0015,
    decay: 0.16,
    sustain: 0.5,
    release: 0.035,
    level: 0.46,
    retrigger: true,
  },
  // Latin tumbao: round electric with a little bite
  tumbao: {
    oscs: [
      ['triangle', 0, 0.8],
      ['sawtooth', 0, 0.28],
      ['sine', 0, 0.4],
    ],
    cutoff: 620,
    q: 1.6,
    key: 0.6,
    env: 4,
    fTau: 0.08,
    attack: 0.003,
    decay: 0.45,
    sustain: 0.65,
    release: 0.06,
    level: 0.5,
  },
  // breathy sine lead
  flute: {
    oscs: [
      ['sine', 0, 0.75],
      ['triangle', 0, 0.35],
      ['sine', 1200, 0.06],
    ],
    cutoff: 3200,
    q: 0.7,
    key: 0.3,
    env: 0.6,
    fTau: 0.2,
    attack: 0.03,
    decay: 0.6,
    sustain: 0.85,
    release: 0.14,
    level: 0.55,
    vib: 14,
    vibRate: 5.2,
    vibDelay: 0.28,
    glide: 0.045,
  },
  // soaring saw/square lead
  soar: {
    oscs: [
      ['sawtooth', 0, 0.5],
      ['sawtooth', 9, 0.42],
      ['square', -1200, 0.22],
    ],
    cutoff: 1500,
    q: 2.2,
    key: 0.7,
    env: 1.8,
    fTau: 0.25,
    attack: 0.012,
    decay: 0.5,
    sustain: 0.82,
    release: 0.16,
    level: 0.55,
    vib: 22,
    vibRate: 5.6,
    vibDelay: 0.3,
    glide: 0.05,
  },
  // bright square lead for the funk track
  square: {
    oscs: [
      ['square', 0, 0.55],
      ['square', 7, 0.38],
      ['sawtooth', 1200, 0.08],
    ],
    cutoff: 1900,
    q: 1.4,
    key: 0.6,
    env: 2.2,
    fTau: 0.12,
    attack: 0.006,
    decay: 0.35,
    sustain: 0.78,
    release: 0.09,
    level: 0.45,
    vib: 16,
    vibRate: 5.8,
    vibDelay: 0.24,
    glide: 0.035,
  },
}

/**
 * Glide `param` to `f`, then pin it with setValueAtTime once converged so the browser can
 * drop back to its cheap constant-value path (no per-sample automation between notes).
 */
function glideTo(param, f, t, tau, until) {
  if (tau > 0) {
    param.setTargetAtTime(f, t, tau)
    const pin = t + tau * 6
    if (pin < until) param.setValueAtTime(f, pin)
  } else param.setValueAtTime(f, t)
}

export class MonoSynth {
  constructor(ctx, dest, def) {
    this.ctx = ctx
    const p = (this.p = { ...MONO_PRESETS[def.preset || 'round'], ...(def.params || {}) })
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = p.q
    this.filter.frequency.value = p.cutoff
    this.amp = ctx.createGain()
    this.amp.gain.value = 0
    this.filter.connect(this.amp)
    this.amp.connect(dest)
    this.oscs = []
    this.nodes = [this.filter, this.amp]
    if (p.vib) {
      this.lfo = ctx.createOscillator()
      this.lfo.frequency.value = p.vibRate || 5.5
      this.vib = ctx.createGain()
      this.vib.gain.value = 0
      this.lfo.connect(this.vib)
      this.nodes.push(this.lfo, this.vib)
    }
    for (const [type, detune, gain] of p.oscs) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = 110
      o.detune.value = detune
      if (this.vib) this.vib.connect(o.detune)
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g)
      g.connect(this.filter)
      this.oscs.push(o)
      this.nodes.push(o, g)
    }
  }
  start(t) {
    for (const o of this.oscs) o.start(t)
    if (this.lfo) this.lfo.start(t)
  }
  stop(t) {
    for (const o of this.oscs) o.stop(t)
    if (this.lfo) this.lfo.stop(t)
  }
  dispose() {
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
  }
  play(t, ev, dur) {
    const p = this.p
    const midi = ev.n[0]
    const f = mtof(midi)
    const vel = ev.v
    const peak = p.level * (0.55 + 0.45 * vel)
    const until = t + dur
    const glide = ev.g && p.glide ? p.glide : 0
    for (const o of this.oscs) glideTo(o.frequency, f, t, glide, until)
    const a = this.amp.gain
    if (p.retrigger) {
      // tiny dip so repeated/legato slaps re-articulate
      a.setTargetAtTime(peak * 0.15, Math.max(0, t - 0.004), 0.0012)
    }
    const relAt = t + Math.max(0.02, dur - 0.004)
    a.setTargetAtTime(peak, t, p.attack)
    a.setTargetAtTime(peak * p.sustain, Math.min(relAt, t + p.attack * 4), p.decay)
    const base = Math.min(16000, p.cutoff * Math.pow(f / 110, p.key))
    const fq = this.filter.frequency
    const accent = vel > 0.9 ? 1.6 : vel < 0.5 ? 0.45 : 1
    fq.setTargetAtTime(Math.min(18000, base * (1 + p.env * vel * accent)), t, 0.0015)
    fq.setTargetAtTime(base, t + 0.006, p.fTau)
    if (t + 0.006 + p.fTau * 6 < until) fq.setValueAtTime(base, t + 0.006 + p.fTau * 6)
    if (this.vib) {
      const vg = this.vib.gain
      vg.setTargetAtTime(0, t, 0.02)
      if (dur > p.vibDelay + 0.08) vg.setTargetAtTime(p.vib, t + p.vibDelay, 0.18)
    }
    a.setTargetAtTime(0, relAt, p.release)
  }
}

// ── persistent paraphonic synth (supersaw pad, brass stabs) ──────────────────────────────
const PARA_PRESETS = {
  pad: {
    voices: 4,
    detunes: [-13, 0, 12],
    type: 'sawtooth',
    cutoff: 1500,
    peakCut: 2100,
    q: 0.6,
    fAttack: 0.4,
    fDecay: 1.2,
    attack: 0.32,
    decay: 1.5,
    sustain: 1,
    release: 0.55,
    level: 0.1,
    glide: 0.05,
    chorus: true,
  },
  brass: {
    voices: 4,
    detunes: [-7, 7],
    type: 'sawtooth',
    cutoff: 1300,
    peakCut: 4200,
    q: 1.1,
    fAttack: 0.02,
    fDecay: 0.16,
    attack: 0.007,
    decay: 0.22,
    sustain: 0.72,
    release: 0.06,
    level: 0.26,
    glide: 0.002,
    chorus: false,
  },
}

export class ParaSynth {
  constructor(ctx, dest, def) {
    this.ctx = ctx
    const p = (this.p = { ...PARA_PRESETS[def.preset || 'pad'], ...(def.params || {}) })
    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = p.cutoff
    this.filter.Q.value = p.q
    this.amp = ctx.createGain()
    this.amp.gain.value = 0
    this.mix = ctx.createGain()
    this.mix.gain.value = 1 / Math.sqrt(p.detunes.length)
    this.mix.connect(this.filter)
    this.filter.connect(this.amp)
    this.nodes = [this.filter, this.amp, this.mix]
    if (p.chorus) {
      this.chorus = createChorus(ctx)
      this.amp.connect(this.chorus.input)
      this.chorus.output.connect(dest)
    } else this.amp.connect(dest)
    this.voices = [] // per voice: its detuned oscillators
    this.oscs = []
    for (let v = 0; v < p.voices; v++) {
      const group = []
      for (const dt of p.detunes) {
        const o = ctx.createOscillator()
        o.type = p.type
        o.frequency.value = 220
        o.detune.value = dt + (v - 1.5) * 1.3
        o.connect(this.mix)
        group.push(o)
        this.oscs.push(o)
        this.nodes.push(o)
      }
      this.voices.push(group)
    }
  }
  start(t) {
    for (const o of this.oscs) o.start(t)
    if (this.chorus) this.chorus.start(t)
  }
  stop(t) {
    for (const o of this.oscs) o.stop(t)
    if (this.chorus) this.chorus.stop(t)
  }
  dispose() {
    for (const n of this.nodes) {
      try {
        n.disconnect()
      } catch {
        /* ignore */
      }
    }
    if (this.chorus) this.chorus.dispose()
  }
  play(t, ev, dur) {
    const p = this.p
    const notes = ev.n.slice().sort((a, b) => a - b)
    const nv = this.voices.length
    const until = t + dur
    for (let v = 0; v < nv; v++) {
      // spread the chord over the voices; double from the top if there are fewer notes
      const m = notes.length >= nv ? notes[Math.round((v * (notes.length - 1)) / (nv - 1))] : notes[v % notes.length] + (v >= notes.length ? 12 : 0)
      const f = mtof(m)
      for (const o of this.voices[v]) glideTo(o.frequency, f, t, p.glide, until)
    }
    const peak = p.level * (0.6 + 0.4 * ev.v)
    const a = this.amp.gain
    const relAt = t + Math.max(0.02, dur - 0.005)
    a.setTargetAtTime(peak, t, p.attack)
    if (p.sustain < 1) a.setTargetAtTime(peak * p.sustain, Math.min(relAt, t + p.attack * 3), p.decay)
    const fq = this.filter.frequency
    const fAt = Math.min(relAt, t + p.fAttack * 3)
    fq.setTargetAtTime(p.peakCut * (0.7 + 0.3 * ev.v), t, p.fAttack)
    fq.setTargetAtTime(p.cutoff, fAt, p.fDecay)
    if (fAt + p.fDecay * 6 < until) fq.setValueAtTime(p.cutoff, fAt + p.fDecay * 6)
    a.setTargetAtTime(0, relAt, p.release)
  }
}

export const PRESET_NAMES = {
  ep: Object.keys(EP_PRESETS),
  mono: Object.keys(MONO_PRESETS),
  para: Object.keys(PARA_PRESETS),
}
