// Main-thread side of the engine sound: owns the AudioWorkletNode (or an oscillator fallback),
// the camera-dependent tone stage, gear-shift dips and lift-off backfire detection.
import { setParam, holdParam } from '../core/env.js'

export const ENGINE_PROCESSOR = 'outrun-engine'

const workletLoads = new WeakMap()

/** Load the engine worklet module into `ctx` once. Resolves true on success, false otherwise. */
export function loadEngineWorklet(ctx) {
  if (!ctx) return Promise.resolve(false)
  let p = workletLoads.get(ctx)
  if (p) return p
  if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') {
    p = Promise.resolve(false)
  } else {
    let href
    try {
      // Literal `new URL(..., import.meta.url)` so Vite emits the worklet as an asset.
      href = new URL('./engineWorklet.js', import.meta.url).href
    } catch {
      href = null
    }
    p = href
      ? ctx.audioWorklet.addModule(href).then(
          () => true,
          (err) => {
            if (typeof console !== 'undefined') console.warn('[audio] engine worklet failed, using fallback', err)
            return false
          },
        )
      : Promise.resolve(false)
  }
  workletLoads.set(ctx, p)
  return p
}

const CAMERA = {
  chase: { lp: 16000, eqF: 150, eqDb: 3.5, level: 1.0 },
  far: { lp: 6500, eqF: 150, eqDb: 0, level: 0.62 },
  bumper: { lp: 1500, eqF: 115, eqDb: 5, level: 0.8 },
}

function normCar(def = {}) {
  const cylinders = [6, 8, 12].includes(def.cylinders) ? def.cylinders : 8
  return {
    cylinders,
    idle: def.idle > 0 ? def.idle : 900,
    redline: def.redline > 1500 ? def.redline : 8000,
    engineTone: Math.max(0.7, Math.min(1.3, def.engineTone || 1)),
  }
}

function tanhCurve(n = 2048, k = 2.2) {
  const c = new Float32Array(n)
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(k * x) / norm
  }
  return c
}

export class EngineSound {
  /**
   * @param ctx      BaseAudioContext
   * @param dest     destination node (engine bus)
   * @param carDef   { cylinders, idle, redline, engineTone }
   * @param opts     { useWorklet: boolean, onBackfire(time, intensity), seed }
   */
  constructor(ctx, dest, carDef, opts = {}) {
    this.ctx = ctx
    this.car = normCar(carDef)
    this.onBackfire = opts.onBackfire || null
    this.camera = null
    this.stopped = false
    this._prevThr = 0
    this._lastLift = -10
    this._lastShiftPop = -10
    this._last = { rpm: -1, load: -1, thr: -1, lim: -1, gain: -1 }
    this.rpmNorm = 0

    // Output stage: source → shift dip → camera EQ → camera LP → level → dest
    this.shiftGain = ctx.createGain()
    this.eq = ctx.createBiquadFilter()
    this.eq.type = 'peaking'
    this.eq.Q.value = 0.9
    this.lp = ctx.createBiquadFilter()
    this.lp.type = 'lowpass'
    this.lp.Q.value = 0.5
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.shiftGain.connect(this.eq)
    this.eq.connect(this.lp)
    this.lp.connect(this.out)
    this.out.connect(dest)
    this.setCamera('chase', ctx.currentTime, true)

    if (opts.useWorklet) this._buildWorklet(opts.seed)
    else this._buildFallback()
    this.kind = this.node ? 'worklet' : 'fallback'

    // Fade in.
    const t = ctx.currentTime
    this.out.gain.setValueAtTime(0, t)
    setParam(this.out.gain, CAMERA[this.camera].level, t, 0.08)
  }

  _buildWorklet(seed = 1234) {
    const ctx = this.ctx
    try {
      this.node = new AudioWorkletNode(ctx, ENGINE_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: { ...this.car, seed },
      })
    } catch (e) {
      this.node = null
      this._buildFallback()
      return
    }
    const P = this.node.parameters
    this.params = {
      rpm: P.get('rpm'),
      load: P.get('load'),
      throttle: P.get('throttle'),
      gain: P.get('gain'),
      limiter: P.get('limiter'),
      crackle: P.get('crackle'),
    }
    this.params.rpm.value = this.car.idle
    this.node.connect(this.shiftGain)
  }

  _buildFallback() {
    const ctx = this.ctx
    const c = this.car
    const f0 = ((c.idle / 60) * c.cylinders) / 2
    const fb = (this.fb = {})
    fb.freq = ctx.createConstantSource()
    fb.freq.offset.value = f0
    fb.oscs = []
    const mix = ctx.createGain()
    mix.gain.value = 0.28
    const layer = (type, detune, gain) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = 0
      o.detune.value = detune
      fb.freq.connect(o.frequency)
      const g = ctx.createGain()
      g.gain.value = gain
      o.connect(g)
      g.connect(mix)
      fb.oscs.push(o)
      return g
    }
    layer('sawtooth', 0, 0.7)
    layer('sawtooth', 11, 0.45)
    layer('square', -1200, c.cylinders === 12 ? 0.12 : 0.3)
    fb.sub = layer('sine', -2400, c.cylinders === 8 ? 0.55 : 0.2)
    fb.drive = ctx.createGain()
    fb.drive.gain.value = 1.5
    const shaper = ctx.createWaveShaper()
    shaper.curve = tanhCurve()
    shaper.oversample = '2x'
    fb.lp = ctx.createBiquadFilter()
    fb.lp.type = 'lowpass'
    fb.lp.Q.value = 2.5
    fb.lp.frequency.value = 900
    fb.formant = ctx.createBiquadFilter()
    fb.formant.type = 'peaking'
    fb.formant.frequency.value = 330 * c.engineTone
    fb.formant.Q.value = 1.4
    fb.formant.gain.value = 6
    // Burble: amplitude modulation at the 4-stroke cycle rate.
    fb.am = ctx.createGain()
    fb.am.gain.value = 0.8
    fb.lfo = ctx.createOscillator()
    fb.lfo.frequency.value = c.idle / 120
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = c.cylinders === 8 ? 0.22 : 0.1
    fb.lfo.connect(lfoDepth)
    lfoDepth.connect(fb.am.gain)
    fb.level = ctx.createGain()
    fb.level.gain.value = 0.15
    mix.connect(fb.drive)
    fb.drive.connect(shaper)
    shaper.connect(fb.lp)
    fb.lp.connect(fb.formant)
    fb.formant.connect(fb.am)
    fb.am.connect(fb.level)
    fb.level.connect(this.shiftGain)
    const t = ctx.currentTime
    fb.freq.start(t)
    fb.lfo.start(t)
    for (const o of fb.oscs) o.start(t)
  }

  setCamera(cam, time = this.ctx.currentTime, instant = false) {
    const key = CAMERA[cam] ? cam : 'chase'
    if (key === this.camera) return
    this.camera = key
    const s = CAMERA[key]
    const tau = instant ? 0.001 : 0.12
    setParam(this.lp.frequency, s.lp, time, tau)
    setParam(this.eq.frequency, s.eqF, time, tau)
    setParam(this.eq.gain, s.eqDb, time, tau)
    if (!instant && !this.stopped) setParam(this.out.gain, s.level, time, tau)
  }

  /** Per-frame update. Cheap: only touches params whose value moved. */
  update(p, time = this.ctx.currentTime) {
    if (this.stopped) return
    const c = this.car
    const rpm = Number.isFinite(p.rpm) ? Math.max(0, p.rpm) : c.idle
    const rn = Number.isFinite(p.rpmNorm) ? p.rpmNorm : (rpm - c.idle) / (c.redline - c.idle)
    this.rpmNorm = Math.max(0, Math.min(1, rn))
    const thr = Math.max(0, Math.min(1, p.throttle || 0))
    const load = Math.max(0, Math.min(1, p.load ?? thr))
    const lim = p.limiter ? 1 : 0
    if (p.camera) this.setCamera(p.camera, time)
    const L = this._last

    if (this.node) {
      const P = this.params
      if (Math.abs(rpm - L.rpm) > 2) {
        setParam(P.rpm, rpm, time, 0.018)
        L.rpm = rpm
      }
      if (Math.abs(load - L.load) > 0.01) {
        setParam(P.load, load, time, 0.05)
        L.load = load
      }
      if (Math.abs(thr - L.thr) > 0.01) {
        setParam(P.throttle, thr, time, 0.035)
        L.thr = thr
      }
      if (lim !== L.lim) {
        setParam(P.limiter, lim, time, 0.001)
        L.lim = lim
      }
    } else if (this.fb) {
      const fb = this.fb
      if (Math.abs(rpm - L.rpm) > 2) {
        const ff = ((rpm / 60) * c.cylinders) / 2
        setParam(fb.freq.offset, ff, time, 0.018)
        setParam(fb.lfo.frequency, rpm / 120, time, 0.03)
        L.rpm = rpm
      }
      const key = Math.round(thr * 50) + Math.round(this.rpmNorm * 50) * 64 + lim * 8192
      if (key !== L.thr) {
        L.thr = key
        const power = 0.35 * thr + 0.65 * load
        setParam(fb.lp.frequency, (500 + 3800 * this.rpmNorm * (0.45 + 0.55 * thr)) * c.engineTone, time, 0.04)
        setParam(fb.drive.gain, 1.1 + 2.4 * power, time, 0.05)
        setParam(fb.level.gain, (0.1 + 0.12 * power) * (lim ? 0.7 : 1), time, 0.04)
        setParam(fb.sub.gain, (c.cylinders === 8 ? 0.55 : 0.2) * (1 - 0.8 * this.rpmNorm), time, 0.1)
      }
    }

    // Lift-off from high rpm → overrun crackle + backfire pops.
    if (this._prevThr > 0.55 && thr < 0.2 && this.rpmNorm > 0.62 && time - this._lastLift > 0.9) {
      this._lastLift = time
      this.crackle(1, time)
      if (this.onBackfire) {
        const n = 1 + Math.floor(Math.random() * 2.4)
        let tt = time + 0.05 + Math.random() * 0.06
        for (let k = 0; k < n; k++) {
          this.onBackfire(tt, Math.max(0.25, 0.55 + 0.45 * this.rpmNorm - k * 0.18))
          tt += 0.08 + Math.random() * 0.18
        }
      }
    }
    this._prevThr = thr
  }

  crackle(amount = 1, time = this.ctx.currentTime) {
    if (!this.node) return
    const c = this.params.crackle
    holdParam(c, time)
    c.setValueAtTime(Math.min(1, amount), time)
    c.setTargetAtTime(0, time + 0.12, 0.32)
  }

  /** Gear change: brief ignition cut, maybe a pop on upshift. */
  shift(dir = 1, time = this.ctx.currentTime) {
    if (this.stopped) return
    const g = this.shiftGain.gain
    holdParam(g, time)
    setParam(g, dir > 0 ? 0.28 : 0.55, time, 0.008)
    setParam(g, 1, time + (dir > 0 ? 0.075 : 0.05), 0.03)
    if (dir > 0 && this.rpmNorm > 0.5 && time - this._lastShiftPop > 0.35 && Math.random() < 0.7) {
      this._lastShiftPop = time
      this.crackle(0.7, time + 0.02)
      if (this.onBackfire) this.onBackfire(time + 0.035, 0.45 + 0.4 * this.rpmNorm)
    }
  }

  stop(time = this.ctx.currentTime, fade = 0.25) {
    if (this.stopped) return
    this.stopped = true
    const g = this.out.gain
    holdParam(g, time)
    setParam(g, 0, time, fade / 4)
    const end = time + fade + 0.05
    if (this.fb) {
      this.fb.freq.stop(end)
      this.fb.lfo.stop(end)
      for (const o of this.fb.oscs) o.stop(end)
    }
    const ms = Math.max(0, (end - this.ctx.currentTime) * 1000) + 50
    const cleanup = () => {
      try {
        if (this.node) {
          this.node.port.postMessage({ type: 'stop' })
          this.node.disconnect()
        }
        this.out.disconnect()
      } catch {
        /* ignore */
      }
    }
    if (typeof setTimeout !== 'undefined' && this.ctx.state !== undefined && !this.ctx.startRendering) setTimeout(cleanup, ms)
  }
}
