// AudioWorkletProcessor: physically-flavoured combustion engine synth ('outrun-engine').
//
// Self-contained on purpose (no imports) so it can be served / emitted as a raw asset.
//
// Signal flow per sample:
//   4-stroke cycle phasor ─► per-cylinder firing events (bank layout, static + per-cycle jitter)
//     ─► fractional impulses ─► 2-pole "pressure pulse" shaper
//     ─► exhaust formants (4 resonant band-passes) + direct pulse
//     ─► exhaust pipe comb (delay + damped feedback)  ◄── overrun crackle bursts
//     ─► load-dependent tanh drive ─► throttle-dependent tone lowpass
//   + intake roar (band-passed noise gated by the firing envelope)
//   + sub-harmonic burble (phase-locked to the cycle, strongest at low rpm)
//   ─► DC blocker ─► gain
//
// k-rate AudioParams: rpm, load, throttle, gain, limiter (0/1), crackle (0..1).
// processorOptions: { cylinders, engineTone, idle, redline, seed }

const TAU = Math.PI * 2

function makeRng(seed) {
  let s = seed >>> 0 || 0x9e3779b9
  return function next() {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

function softclip(x) {
  if (x > 3) return 1
  if (x < -3) return -1
  const x2 = x * x
  return (x * (27 + x2)) / (27 + 9 * x2)
}

class Biquad {
  constructor() {
    this.b0 = 0
    this.b1 = 0
    this.b2 = 0
    this.a1 = 0
    this.a2 = 0
    this.z1 = 0
    this.z2 = 0
  }
  bandpass(f, q, sr) {
    const w = (TAU * Math.min(f, sr * 0.45)) / sr
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = alpha / a0
    this.b1 = 0
    this.b2 = -alpha / a0
    this.a1 = (-2 * Math.cos(w)) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  lowpass(f, q, sr) {
    const w = (TAU * Math.min(f, sr * 0.45)) / sr
    const cs = Math.cos(w)
    const alpha = Math.sin(w) / (2 * q)
    const a0 = 1 + alpha
    this.b0 = (1 - cs) / 2 / a0
    this.b1 = (1 - cs) / a0
    this.b2 = this.b0
    this.a1 = (-2 * cs) / a0
    this.a2 = (1 - alpha) / a0
    return this
  }
  run(x) {
    const y = this.b0 * x + this.z1
    this.z1 = this.b1 * x - this.a1 * y + this.z2
    this.z2 = this.b2 * x - this.a2 * y
    return y
  }
}

// Character per cylinder count. bank = exhaust bank of each firing slot in firing order.
// A cross-plane V8 feeds each bank unevenly (L R R L R L R L) → the classic burble.
const PROFILES = {
  6: {
    bank: [0, 1, 0, 1, 0, 1],
    bankGain: 0.86,
    bankDelay: 0.035,
    staticAmp: 0.08,
    jitter: 0.1,
    sub: 0.1,
    f: [125, 390, 1400, 2700],
    q: [1.6, 2.2, 2.6, 3.2],
    g: [0.9, 1.0, 0.7, 0.3],
    pipe: 0.0034,
    comb: 0.42,
    direct: 0.35,
    level: 1.0,
  },
  8: {
    bank: [0, 1, 1, 0, 1, 0, 1, 0],
    bankGain: 0.74,
    bankDelay: 0.075,
    staticAmp: 0.1,
    jitter: 0.13,
    sub: 0.24,
    f: [92, 310, 1150, 2400],
    q: [1.5, 2.0, 2.3, 3.0],
    g: [1.25, 1.0, 0.5, 0.2],
    pipe: 0.0044,
    comb: 0.46,
    direct: 0.3,
    level: 1.0,
  },
  12: {
    bank: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    bankGain: 0.94,
    bankDelay: 0.012,
    staticAmp: 0.04,
    jitter: 0.05,
    sub: 0.05,
    f: [135, 460, 1650, 3300],
    q: [1.4, 2.0, 2.6, 3.2],
    g: [0.75, 0.95, 0.75, 0.4],
    pipe: 0.0031,
    comb: 0.38,
    direct: 0.4,
    level: 0.95,
  },
}

class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 0, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
      { name: 'limiter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'crackle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor(options) {
    super()
    const o = (options && options.processorOptions) || {}
    this.alive = true
    this.configure(o)
    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (d.type === 'stop') this.alive = false
      else if (d.type === 'config') this.configure(d)
    }
  }

  configure(o) {
    const cyl = [6, 8, 12].includes(o.cylinders) ? o.cylinders : o.cylinders > 9 ? 12 : o.cylinders < 7 ? 6 : 8
    const P = PROFILES[cyl]
    const tone = Math.max(0.7, Math.min(1.3, o.engineTone || 1))
    const sr = sampleRate
    this.cyl = cyl
    this.P = P
    this.tone = tone
    this.idle = o.idle || 900
    this.redline = Math.max(this.idle + 1000, o.redline || 8000)
    this.rand = makeRng((o.seed || 1234) + cyl * 7919)

    // Static per-slot character: bank gain/delay + small fixed imbalance.
    this.baseAmp = new Float32Array(cyl)
    this.basePos = new Float32Array(cyl)
    this.pos = new Float32Array(cyl)
    this.jAmp = new Float32Array(cyl)
    for (let k = 0; k < cyl; k++) {
      const b = P.bank[k]
      this.baseAmp[k] = (b ? P.bankGain : 1) * (1 + P.staticAmp * (this.rand() * 2 - 1))
      this.basePos[k] = (k + 0.5 + (b ? P.bankDelay : 0)) / cyl
      this.pos[k] = this.basePos[k]
      this.jAmp[k] = 1
    }

    // Exhaust formants scale with the tone multiplier.
    this.res = P.f.map((f, i) => new Biquad().bandpass(f * tone, P.q[i], sr))
    this.resGain = P.g.slice()
    this.track = new Biquad().bandpass(200, 1.3, sr) // follows the firing frequency
    this.intake = new Biquad().bandpass(900, 1.1, sr)
    this.toneLp = new Biquad().lowpass(6000, 0.6, sr)

    // Pipe comb.
    this.combLen = Math.max(8, Math.round((P.pipe / tone) * sr))
    this.comb = new Float32Array(this.combLen + 2)
    this.combIdx = 0
    this.combLp = 0

    // State.
    this.phase = 0
    this.next = 0
    this.carry = 0
    this.p1 = 0
    this.p2 = 0
    this.env = 0
    this.dcX = 0
    this.dcY = 0
    this.crackEnv = 0
    this.crackTau = 0.99
    this.limPhase = 0
    this.limCut = false
    this.rpm = this.idle
    this.gain = 0
    this.power = 0
    this.thr = 0
    this.wob = 0
    this.pulseA = 0.1
    this.misfire = 0
    this.fuel = 1
  }

  newCycle(rn, power) {
    const P = this.P
    // Combustion variability: bigger at idle / light load (lumpy), tighter when revving hard.
    const ja = P.jitter * (1.25 - 0.8 * rn) * (1.2 - 0.5 * power)
    const jt = 0.018 * (1.3 - rn)
    for (let k = 0; k < this.cyl; k++) {
      this.jAmp[k] = 1 + ja * (this.rand() * 2 - 1)
      this.pos[k] = this.basePos[k] + (jt * (this.rand() - 0.5)) / this.cyl
    }
  }

  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length === 0) return this.alive
    const ch = out[0]
    const N = ch.length
    const sr = sampleRate
    const P = this.P

    const rpmT = Math.max(0, params.rpm[0])
    const loadT = params.load[0]
    const thrT = params.throttle[0]
    const gainT = params.gain[0]
    const lim = params.limiter[0] >= 0.5
    const crackle = params.crackle[0]

    // Block-rate smoothing of the slower controls.
    const r0 = this.rpm
    const r1 = rpmT
    const g0 = this.gain
    const g1 = gainT
    this.thr += (thrT - this.thr) * 0.25
    const powerT = 0.35 * thrT + 0.65 * loadT
    this.power += (powerT - this.power) * 0.2
    const power = this.power
    const thr = this.thr

    const rMid = (r0 + r1) * 0.5
    const rn = Math.max(0, Math.min(1, (rMid - this.idle) / (this.redline - this.idle)))
    const overrun = thr < 0.12 && rn > 0.15 ? 1 : 0

    // Per-block coefficient updates.
    const tone = this.tone
    this.intake.bandpass((520 + 2400 * rn) * tone, 1.2, sr)
    this.toneLp.lowpass(Math.min(sr * 0.42, 1700 + 9000 * (0.25 + 0.75 * power) * (0.55 + 0.45 * rn)), 0.55, sr)
    const pulseFc = (650 + 1500 * rn + 700 * thr) * tone
    const pa = 1 - Math.exp((-TAU * pulseFc) / sr)
    const pulseNorm = Math.E / pa // makes a unit impulse peak at ≈1 after the 2-pole shaper
    const envA = 1 - Math.exp((-TAU * 180) / sr)

    const ff = (rMid / 60) * (this.cyl / 2)
    this.track.bandpass(Math.max(30, ff), 1.3, sr)
    const trackGain = 0.55 * (0.5 + 0.5 * thr) * (0.4 + 0.6 * rn)
    const rateNorm = Math.pow(110 / Math.max(20, ff), 0.42)
    const baseAmp = (0.42 + 0.58 * power)
    const drive = 1.1 + 2.6 * power + 0.9 * rn
    const driveNorm = 1 / (0.55 + 0.45 * drive)
    const g = this.resGain
    const rg0 = g[0] * (1.15 - 0.45 * rn)
    const rg1 = g[1]
    const rg2 = g[2] * (0.25 + 0.75 * thr) * (0.55 + 0.45 * rn) * (1 - 0.3 * rn * rn)
    const rg3 = g[3] * (0.2 + 0.8 * rn) * (0.3 + 0.7 * thr)
    const direct = P.direct * (0.6 + 0.4 * thr)
    const combFb = P.comb * (0.8 + 0.25 * thr)
    const intakeGain = 0.55 * (0.1 + 0.9 * thr * thr) * (0.25 + 0.75 * rn)
    const subGain = P.sub * Math.pow(1 - rn, 1.6) * (0.45 + 0.55 * power)
    const subMult = this.cyl / 2
    const crackProb = crackle * (overrun ? 0.32 : 0.08)
    const misfireProb = overrun ? 0.06 + 0.2 * crackle : 0
    const idleWobble = 0.012 * Math.max(0, 1 - rn * 4)
    const loud = 0.65 + 0.35 * Math.max(power, rn * 0.6)
    const outLevel = 1.75 * P.level * rateNorm * (0.8 + 0.3 * rn) * loud

    const res0 = this.res[0]
    const res1 = this.res[1]
    const res2 = this.res[2]
    const res3 = this.res[3]
    const trk = this.track
    const comb = this.comb
    const combLen = this.combLen
    const rand = this.rand
    const cyl = this.cyl

    for (let i = 0; i < N; i++) {
      const t = i / N
      let rpm = r0 + (r1 - r0) * t
      // Idle hunting — the engine is alive, not a synth tone.
      this.wob += 1.3 / sr
      if (this.wob > 1) this.wob -= 1
      rpm *= 1 + idleWobble * Math.sin(TAU * this.wob)

      // Rev limiter: fuel cut at ~17 Hz.
      let fuel = 1
      if (lim) {
        this.limPhase += 17 / sr
        if (this.limPhase >= 1) this.limPhase -= 1
        const cut = this.limPhase < 0.42
        if (cut && !this.limCut && rand() < 0.45) this.startCrackle(1.2 + rand() * 2)
        this.limCut = cut
        if (cut) {
          fuel = 0.07
          rpm *= 0.985
        }
      } else this.limCut = false

      const dphi = rpm / 120 / sr
      this.phase += dphi
      if (this.phase >= 1) {
        this.phase -= 1
        this.next = 0
        this.newCycle(rn, power)
      }

      // Firing events with sub-sample placement.
      let exc = this.carry
      this.carry = 0
      while (this.next < cyl && this.phase >= this.pos[this.next]) {
        const k = this.next++
        let d = dphi > 0 ? (this.phase - this.pos[k]) / dphi : 0
        if (d > 1) d = 1
        let a = baseAmp * this.baseAmp[k] * this.jAmp[k] * fuel
        if (misfireProb > 0 && rand() < misfireProb) a *= 0.15
        a *= pulseNorm
        exc += a * d
        this.carry += a * (1 - d)
        if (crackProb > 0 && rand() < crackProb) this.startCrackle(0.8 + rand() * 2.6)
      }

      // 2-pole pressure pulse.
      this.p1 += pa * (exc - this.p1)
      this.p2 += pa * (this.p1 - this.p2)
      const p = this.p2
      this.env += envA * (p - this.env)

      // Exhaust formants.
      let x = direct * p + rg0 * res0.run(p) + rg1 * res1.run(p) + rg2 * res2.run(p) + rg3 * res3.run(p) + trackGain * trk.run(p)

      // Overrun crackle: noise burst injected before the pipe so it rings like a pop.
      if (this.crackEnv > 0.001) {
        x += (rand() * 2 - 1) * this.crackEnv
        this.crackEnv *= this.crackTau
      }

      // Exhaust pipe comb with damped feedback.
      const idx = this.combIdx
      const delayed = comb[idx]
      this.combLp += 0.45 * (delayed - this.combLp)
      const y = x + combFb * this.combLp
      comb[idx] = y
      this.combIdx = idx + 1 >= combLen ? 0 : idx + 1

      // Load-dependent drive.
      let s = softclip(drive * y * 0.8) * driveNorm

      // Intake roar: noise gated by the firing envelope.
      const n = rand() * 2 - 1
      s += this.intake.run(n * (0.25 + 1.4 * Math.min(1.5, Math.abs(this.env)))) * intakeGain

      // Sub-harmonic burble, phase-locked to the cycle.
      s += subGain * Math.sin(TAU * this.phase * subMult)

      s = this.toneLp.run(s)

      // DC blocker.
      const dc = s - this.dcX + 0.996 * this.dcY
      this.dcX = s
      this.dcY = dc

      const gain = g0 + (g1 - g0) * t
      ch[i] = dc * gain * outLevel
    }

    this.rpm = r1
    this.gain = g1
    for (let c = 1; c < out.length; c++) out[c].set(ch)
    return this.alive
  }

  startCrackle(amp) {
    this.crackEnv = Math.max(this.crackEnv, amp)
    // 3–9 ms decay.
    const tau = (0.003 + this.rand() * 0.006) * sampleRate
    this.crackTau = Math.exp(-1 / tau)
  }
}

registerProcessor('outrun-engine', EngineProcessor)
