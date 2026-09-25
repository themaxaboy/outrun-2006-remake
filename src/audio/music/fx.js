// Shared music effects: convolver reverb with a synthetic IR, tempo-synced ping-pong delay,
// and a light stereo chorus.
import { rng, ctxCache } from '../core/dsp.js'

/** Synthetic stereo room/plate IR: early reflections + exponentially decaying, darkening tail. */
export function renderReverbIR(sr, { seconds = 2.2, preDelay = 0.018, damping = 0.6, seed = 4242 } = {}) {
  const n = Math.round(seconds * sr)
  const chans = []
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 101)
    const out = new Float32Array(n)
    const pd = Math.round(preDelay * sr)
    let lp = 0
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / (n - pd)
      // -60 dB at the end, slightly faster initial drop
      const env = Math.pow(10, (-3 * t)) * (1 - 0.3 * Math.exp(-t * 30))
      // one-pole lowpass whose cutoff falls over time (air/absorption)
      const a = 0.92 - 0.8 * damping * t
      lp += a * ((r() * 2 - 1) - lp)
      out[i] = lp * env
    }
    // early reflections
    const taps = 10
    for (let k = 0; k < taps; k++) {
      const at = pd + Math.round((0.004 + r() * 0.07) * sr)
      if (at < n) out[at] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.035)
    }
    // gentle fade-in to avoid a click at pre-delay
    for (let i = pd; i < pd + 64 && i < n; i++) out[i] *= (i - pd) / 64
    chans.push(out)
  }
  return chans
}

/** Shared reverb (one convolver per context). Returns { input, output }. */
export function getReverb(ctx) {
  return ctxCache(ctx, 'reverb', () => {
    const sr = ctx.sampleRate
    const [L, R] = renderReverbIR(sr)
    const buf = ctx.createBuffer(2, L.length, sr)
    buf.getChannelData(0).set(L)
    buf.getChannelData(1).set(R)
    const input = ctx.createGain()
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 220
    const conv = ctx.createConvolver()
    conv.normalize = true
    conv.buffer = buf
    const output = ctx.createGain()
    output.gain.value = 0.55
    input.connect(hp)
    hp.connect(conv)
    conv.connect(output)
    return { input, output, attached: false }
  })
}

/**
 * Ping-pong delay (dotted-eighth by default). Returns { input, output, dispose }.
 * Feedback path is band-limited so repeats get darker and never build up mud.
 */
export function createPingPong(ctx, bpm, { beats = 0.75, feedback = 0.38, wet = 0.5 } = {}) {
  const time = Math.min(1.5, (60 / bpm) * beats)
  const input = ctx.createGain()
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 350
  const dl = ctx.createDelay(2)
  const dr = ctx.createDelay(2)
  dl.delayTime.value = time
  dr.delayTime.value = time
  const fbl = ctx.createGain()
  const fbr = ctx.createGain()
  fbl.gain.value = feedback
  fbr.gain.value = feedback
  const lpl = ctx.createBiquadFilter()
  lpl.type = 'lowpass'
  lpl.frequency.value = 3800
  const lpr = ctx.createBiquadFilter()
  lpr.type = 'lowpass'
  lpr.frequency.value = 3200
  const merger = ctx.createChannelMerger(2)
  const output = ctx.createGain()
  output.gain.value = wet
  input.connect(hp)
  hp.connect(dl)
  dl.connect(lpl)
  lpl.connect(fbl)
  fbl.connect(dr)
  dr.connect(lpr)
  lpr.connect(fbr)
  fbr.connect(dl)
  dl.connect(merger, 0, 0)
  dr.connect(merger, 0, 1)
  merger.connect(output)
  const nodes = [input, hp, dl, dr, fbl, fbr, lpl, lpr, merger, output]
  return {
    input,
    output,
    dispose() {
      for (const n of nodes) {
        try {
          n.disconnect()
        } catch {
          /* ignore */
        }
      }
    },
  }
}

/** Stereo chorus: dry + two LFO-modulated short delays panned hard L/R. */
export function createChorus(ctx, { rate = 0.35, depth = 0.0025, base = 0.014, wet = 0.6 } = {}) {
  const input = ctx.createGain()
  const output = ctx.createGain()
  input.connect(output) // dry (mono → both channels)
  const merger = ctx.createChannelMerger(2)
  const wetG = ctx.createGain()
  wetG.gain.value = wet
  const oscs = []
  const nodes = [input, output, merger, wetG]
  for (let c = 0; c < 2; c++) {
    const d = ctx.createDelay(0.1)
    d.delayTime.value = base + c * 0.004
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rate * (c ? 1.27 : 1)
    const lg = ctx.createGain()
    lg.gain.value = depth
    lfo.connect(lg)
    lg.connect(d.delayTime)
    input.connect(d)
    d.connect(merger, 0, c)
    oscs.push(lfo)
    nodes.push(d, lg)
  }
  merger.connect(wetG)
  wetG.connect(output)
  return {
    input,
    output,
    start(t) {
      for (const o of oscs) o.start(t)
    },
    stop(t) {
      for (const o of oscs) o.stop(t)
    },
    dispose() {
      for (const n of nodes.concat(oscs)) {
        try {
          n.disconnect()
        } catch {
          /* ignore */
        }
      }
    },
  }
}
