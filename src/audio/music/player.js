// Track playback: a lookahead step sequencer over a compiled track.
//
// The owner calls tick() from a 25 ms setInterval; each tick schedules every step whose time
// falls before ctx.currentTime + LOOKAHEAD. For offline rendering call scheduleUntil(seconds)
// once before startRendering().
import { rng } from '../core/dsp.js'
import { setParam, holdParam } from '../core/env.js'
import { compileTrack, stepSeconds, STEPS_PER_BAR } from './patterns.js'
import { getReverb, createPingPong } from './fx.js'
import { VoicePool, ChannelStrip, DrumKit, EPiano, Sampler, MonoSynth, ParaSynth } from './instruments.js'
import { getSamplerBuffer } from './samplers.js'

export const LOOKAHEAD = 0.12
export const TICK_MS = 25
export const VOICE_CAP = 24

const compiled = new Map()
export function getCompiled(track) {
  let c = compiled.get(track)
  if (!c) {
    c = compileTrack(track)
    compiled.set(track, c)
  }
  return c
}

/** Every (preset, midi) the track's sampled instruments will need — for prewarming. */
export function samplerNotes(track) {
  const c = getCompiled(track)
  const out = new Set()
  for (const list of c.events) {
    if (!list) continue
    for (const ev of list) {
      const def = track.instruments[ev.i]
      if (def && (def.type === 'mallet' || def.type === 'piano' || def.type === 'pluck') && ev.n) {
        for (const m of ev.n) out.add(`${def.preset || (def.type === 'mallet' ? 'steel' : def.type)}:${m}`)
      }
    }
  }
  return [...out].map((k) => {
    const [preset, m] = k.split(':')
    return { preset, midi: Number(m) }
  })
}

export class TrackPlayer {
  /**
   * @param ctx    BaseAudioContext
   * @param track  track definition (src/audio/music/tracks/*.js)
   * @param dest   node to connect the track output to (music bus)
   */
  constructor(ctx, track, dest, { seed = 1 } = {}) {
    this.ctx = ctx
    this.track = track
    this.c = getCompiled(track)
    this.stepDur = stepSeconds(track.bpm)
    this.swing = (track.swing || 0) * this.stepDur
    this.rand = rng(seed)
    this.stopped = false
    this.started = false
    this.stopAt = Infinity

    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
    this.reverb = getReverb(ctx)
    if (!this.reverb.attached) {
      this.reverb.output.connect(dest)
      this.reverb.attached = dest
    }
    // Reverb sends pass through a per-player gain so they crossfade with the track.
    this.revIn = ctx.createGain()
    this.revIn.gain.value = 0
    this.revIn.connect(this.reverb.input)
    this.delay = createPingPong(ctx, track.bpm, track.delay || {})
    this.delay.output.connect(this.out)

    this.pool = new VoicePool(VOICE_CAP)
    this.strips = []
    this.insts = {}
    this.persistent = []
    for (const [key, def] of Object.entries(track.instruments)) {
      const strip = new ChannelStrip(ctx, def, { out: this.out, reverb: this.revIn, delay: this.delay.input })
      this.strips.push(strip)
      let inst
      switch (def.type) {
        case 'drums':
          inst = new DrumKit(ctx, strip.input, def)
          break
        case 'ep':
          inst = new EPiano(ctx, strip.input, def, this.pool)
          this.persistent.push(inst)
          break
        case 'mallet':
          inst = new Sampler(ctx, strip.input, { ...def, preset: def.preset || 'steel' }, this.pool)
          break
        case 'piano':
          inst = new Sampler(ctx, strip.input, { ...def, preset: 'piano' }, this.pool)
          break
        case 'pluck':
          inst = new Sampler(ctx, strip.input, { ...def, preset: 'pluck' }, this.pool)
          break
        case 'bass':
        case 'lead':
          inst = new MonoSynth(ctx, strip.input, def)
          this.persistent.push(inst)
          break
        case 'pad':
          inst = new ParaSynth(ctx, strip.input, { ...def, preset: def.preset || 'pad' })
          this.persistent.push(inst)
          break
        case 'stab':
          inst = new ParaSynth(ctx, strip.input, { ...def, preset: def.preset || 'brass' })
          this.persistent.push(inst)
          break
        default:
          inst = null
      }
      if (inst) {
        inst.humanize = def.humanize ?? (def.type === 'drums' ? 0.004 : def.type === 'lead' || def.type === 'bass' ? 0 : 0.006)
        this.insts[key] = inst
      }
    }
  }

  get duration() {
    return this.c.totalSteps * this.stepDur
  }
  get loopStart() {
    return this.c.loopStep * this.stepDur
  }

  /** Section name → first step (for starting mid-song, e.g. self-test renders the hook). */
  sectionStep(name) {
    const s = this.c.slots.find((x) => x.name === name)
    return s ? s.start : 0
  }

  /** Render sampled notes the track will need (synchronously). */
  prewarm() {
    for (const { preset, midi } of samplerNotes(this.track)) getSamplerBuffer(this.ctx, preset, midi)
  }

  start(when = this.ctx.currentTime + 0.05, { fade = 1, fromStep = 0 } = {}) {
    if (this.started) return
    this.started = true
    this.t0 = when - fromStep * this.stepDur
    this.nextStep = fromStep
    this.nextTime = when
    this.loops = 0
    for (const p of this.persistent) p.start(when)
    for (const g of [this.out.gain, this.revIn.gain]) {
      g.setValueAtTime(0, when)
      if (fade > 0.01) g.linearRampToValueAtTime(1, when + fade)
      else g.setValueAtTime(1, when)
    }
  }

  _advance() {
    this.nextStep++
    if (this.nextStep >= this.c.totalSteps) {
      this.nextStep = this.c.loopStep
      this.loops++
    }
    this.nextTime += this.stepDur
  }

  _scheduleStep(step, t) {
    const list = this.c.events[step]
    if (!list) return
    const tt0 = step & 1 ? t + this.swing : t
    const sd = this.stepDur
    for (let k = 0; k < list.length; k++) {
      const ev = list[k]
      const inst = this.insts[ev.i]
      if (!inst) continue
      let tt = tt0
      if (inst.humanize) tt += (this.rand() - 0.5) * inst.humanize
      if (tt >= this.stopAt) continue
      inst.play(Math.max(0, tt), ev, ev.d * sd)
    }
  }

  /** Schedule all steps that start before `until` (seconds, context time). */
  scheduleUntil(until) {
    if (!this.started || this.stopped) return
    const now = this.ctx.currentTime
    // Fell far behind (tab stalled)? Skip silently but stay on the grid.
    if (this.nextTime < now - 0.25) {
      while (this.nextTime < now) this._advance()
    }
    const end = Math.min(until, this.stopAt)
    while (this.nextTime < end) {
      this._scheduleStep(this.nextStep, this.nextTime)
      this._advance()
    }
  }

  tick() {
    this.scheduleUntil(this.ctx.currentTime + LOOKAHEAD)
  }

  /** Seconds into the song (wraps to the loop section after the first pass). */
  get position() {
    if (!this.started) return 0
    const el = Math.max(0, this.ctx.currentTime - this.t0)
    const total = this.duration
    if (el < total) return el
    const ls = this.loopStart
    return ls + ((el - total) % (total - ls))
  }

  get bar() {
    return Math.floor(this.position / (this.stepDur * STEPS_PER_BAR))
  }

  /** Fade out and release everything. */
  stop(when = this.ctx.currentTime, fade = 1) {
    if (this.stopped) return
    this.stopAt = when + fade
    for (const g of [this.out.gain, this.revIn.gain]) {
      holdParam(g, when)
      if (fade > 0.01) g.linearRampToValueAtTime(0, when + fade)
      else setParam(g, 0, when, 0.005)
    }
    const end = when + fade + 0.05
    if (this.started) for (const p of this.persistent) p.stop(end)
    this.stopped = true
    const ctx = this.ctx
    const dispose = () => {
      for (const p of this.persistent) p.dispose && p.dispose()
      for (const s of this.strips) s.dispose()
      this.delay.dispose()
      try {
        this.revIn.disconnect()
        this.out.disconnect()
      } catch {
        /* ignore */
      }
    }
    if (typeof setTimeout !== 'undefined' && !ctx.startRendering) setTimeout(dispose, Math.max(0, (end - ctx.currentTime) * 1000) + 3000)
  }
}

/** Plays a decoded user AudioBuffer in a seamless loop with crossfades. */
export class BufferPlayer {
  constructor(ctx, buffer, dest) {
    this.ctx = ctx
    this.buffer = buffer
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(dest)
    this.src = null
    this.stopped = false
    this.stopAt = Infinity
  }
  get duration() {
    return this.buffer.duration
  }
  start(when = this.ctx.currentTime + 0.05, { fade = 1 } = {}) {
    const src = (this.src = this.ctx.createBufferSource())
    src.buffer = this.buffer
    src.loop = true
    src.connect(this.out)
    src.start(when)
    this.t0 = when
    const g = this.out.gain
    g.setValueAtTime(0, when)
    g.linearRampToValueAtTime(1, when + Math.max(0.02, fade))
  }
  tick() {}
  get position() {
    if (this.t0 === undefined) return 0
    return Math.max(0, this.ctx.currentTime - this.t0) % this.buffer.duration
  }
  stop(when = this.ctx.currentTime, fade = 1) {
    if (this.stopped) return
    this.stopped = true
    this.stopAt = when + fade
    const g = this.out.gain
    holdParam(g, when)
    g.linearRampToValueAtTime(0, when + Math.max(0.02, fade))
    if (this.src) {
      this.src.stop(when + fade + 0.05)
      this.src.onended = () => {
        try {
          this.out.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
  }
}
