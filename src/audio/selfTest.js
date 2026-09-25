// Offline self-test: renders every music track, the engine at several rpms (worklet +
// fallback), the surface loops and every sfx through the real mixer with an
// OfflineAudioContext, and reports RMS / peak / NaN counts.
//
//   import { installSelfTest } from './audio/selfTest.js'; installSelfTest()
//   const report = await window.__audioSelfTest()
//   // → { ok, results: [{ kind, name, rms, peak, nan, seconds }], errors, ms }
import { getOfflineAudioContextClass } from './core/env.js'
import { createMixer } from './core/mixer.js'
import { EngineSound, loadEngineWorklet } from './engine/engineSound.js'
import { DrivingLoops } from './sfx/loops.js'
import { SfxBank, SFX_NAMES } from './sfx/sfxBank.js'
import { TrackPlayer } from './music/player.js'
import { TRACKS, getTrack } from './music/tracks/index.js'

export const LIMITS = { minRms: 0.001, maxPeak: 1.2 }

const SR = 44100

const SFX_SECONDS = { goal: 3.8, gameover: 3.2, extend: 2.5, crash: 2.0, checkpoint: 1.8, timeup: 1.8, go: 1.5, pass: 1.4 }

export function analyze(buffer) {
  let sum = 0
  let peak = 0
  let nan = 0
  let n = 0
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < d.length; i++) {
      const v = d[i]
      if (!Number.isFinite(v)) {
        nan++
        continue
      }
      sum += v * v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
      n++
    }
  }
  return { rms: Math.sqrt(sum / Math.max(1, n)), peak, nan }
}

async function render(seconds, build, sampleRate = SR) {
  const Off = getOfflineAudioContextClass()
  if (!Off) throw new Error('OfflineAudioContext unavailable')
  const ctx = new Off(2, Math.max(1, Math.round(seconds * sampleRate)), sampleRate)
  const mixer = createMixer(ctx)
  await build(ctx, mixer)
  return ctx.startRendering()
}

/** Render `seconds` of a built-in track starting at `section` (offline). Returns an AudioBuffer. */
export function renderTrack(id, { seconds = 4, section = 'hook', sampleRate = SR, fromStart = false } = {}) {
  const track = getTrack(id)
  if (!track) throw new Error(`unknown track ${id}`)
  return render(
    seconds,
    (ctx, mixer) => {
      const p = new TrackPlayer(ctx, track, mixer.buses.music)
      p.prewarm()
      p.start(0, { fade: 0, fromStep: fromStart ? 0 : p.sectionStep(section) })
      p.scheduleUntil(seconds)
    },
    sampleRate,
  )
}

/** Render the engine (worklet when possible) for `seconds` with a fixed or swept rpm. */
export function renderEngine(car, p, { seconds = 2, worklet = true, sampleRate = SR, sweep = null } = {}) {
  return render(
    seconds,
    async (ctx, mixer) => {
      const ok = worklet ? await loadEngineWorklet(ctx) : false
      const e = new EngineSound(ctx, mixer.buses.engine, car, { useWorklet: ok, seed: 7 })
      e.update({ camera: 'chase', ...p }, 0)
      if (sweep && e.params) {
        e.params.rpm.cancelScheduledValues(0)
        e.params.rpm.setValueAtTime(sweep[0], 0)
        e.params.rpm.linearRampToValueAtTime(sweep[1], seconds)
      }
      const loops = new DrivingLoops(ctx, mixer.buses.sfx)
      loops.update({ speed: 0 }, 0)
      renderEngine.last = e.kind
    },
    sampleRate,
  )
}

/** 16-bit PCM WAV encoder (for the dev page / tooling). */
export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels
  const len = buffer.length
  const out = new ArrayBuffer(44 + len * ch * 2)
  const v = new DataView(out)
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + len * ch * 2, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, ch, true)
  v.setUint32(24, buffer.sampleRate, true)
  v.setUint32(28, buffer.sampleRate * ch * 2, true)
  v.setUint16(32, ch * 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, len * ch * 2, true)
  const data = []
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c))
  let o = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] || 0))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return out
}

const CARS = {
  V8: { cylinders: 8, idle: 950, redline: 8400, engineTone: 1.0 },
  V6: { cylinders: 6, idle: 950, redline: 8800, engineTone: 1.18 },
  V12: { cylinders: 12, idle: 950, redline: 8000, engineTone: 0.86 },
}

/**
 * Run the whole suite. opts: { musicSeconds = 4, section = 'hook', quick = false }
 * Resolves to { ok, results, errors, ms, limits }.
 */
export async function runAudioSelfTest(opts = {}) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const results = []
  const errors = []
  const push = (kind, name, buf, extra = {}) => {
    const a = analyze(buf)
    results.push({ kind, name, seconds: +buf.duration.toFixed(2), rms: +a.rms.toFixed(5), peak: +a.peak.toFixed(4), nan: a.nan, ...extra })
  }
  const attempt = async (label, fn) => {
    try {
      await fn()
    } catch (e) {
      errors.push(`${label}: ${(e && e.message) || e}`)
    }
  }

  const secs = opts.musicSeconds ?? 4
  const section = opts.section ?? 'hook'
  for (const t of TRACKS) {
    await attempt(`music ${t.id}`, async () => push('music', t.id, await renderTrack(t.id, { seconds: secs, section }), { section }))
  }

  const engineCases = [
    ['V8 idle', CARS.V8, { rpm: 950, rpmNorm: 0, throttle: 0, load: 0.1 }],
    ['V8 3000', CARS.V8, { rpm: 3000, rpmNorm: 0.28, throttle: 0.6, load: 0.6 }],
    ['V8 6000', CARS.V8, { rpm: 6000, rpmNorm: 0.68, throttle: 1, load: 1 }],
    ['V8 redline limiter', CARS.V8, { rpm: 8400, rpmNorm: 1, throttle: 1, load: 1, limiter: true }],
    ['V8 overrun', CARS.V8, { rpm: 6500, rpmNorm: 0.75, throttle: 0, load: 0 }],
    ['V6 5000', CARS.V6, { rpm: 5000, rpmNorm: 0.52, throttle: 1, load: 0.9 }],
    ['V12 7000', CARS.V12, { rpm: 7000, rpmNorm: 0.86, throttle: 1, load: 1 }],
    ['V8 bumper cam', CARS.V8, { rpm: 5000, rpmNorm: 0.54, throttle: 1, load: 1, camera: 'bumper' }],
  ]
  for (const [name, car, p] of engineCases) {
    await attempt(`engine ${name}`, async () => {
      const buf = await renderEngine(car, p, { seconds: 2 })
      push('engine', name, buf, { impl: renderEngine.last })
    })
  }
  await attempt('engine fallback', async () => {
    const buf = await renderEngine(CARS.V8, { rpm: 5000, rpmNorm: 0.54, throttle: 1, load: 1 }, { seconds: 2, worklet: false })
    push('engine', 'V8 5000 (fallback)', buf, { impl: renderEngine.last })
  })

  await attempt('loops', async () => {
    const buf = await render(2, (ctx, mixer) => {
      const l = new DrivingLoops(ctx, mixer.buses.sfx)
      l.update({ speed: 55, drift: 0.9, rumble: 0.8, offroad: 0.6, wind: 0.7 }, 0)
    })
    push('loops', 'squeal+wind+rumble+gravel', buf)
  })

  const names = opts.quick ? ['checkpoint', 'backfire', 'pass'] : SFX_NAMES
  for (const name of names) {
    await attempt(`sfx ${name}`, async () => {
      const buf = await render(SFX_SECONDS[name] ?? 1.0, (ctx, mixer) => {
        const bank = new SfxBank(ctx, mixer.buses)
        bank.play(name, { when: 0.02, pan: 0.3, speed: 45, intensity: 0.9, dir: 1 })
      })
      push('sfx', name, buf)
    })
  }

  const bad = results.filter((r) => !(r.rms > LIMITS.minRms) || r.nan > 0 || r.peak > LIMITS.maxPeak)
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return { ok: errors.length === 0 && bad.length === 0, results, errors, failures: bad.map((r) => `${r.kind}:${r.name}`), limits: LIMITS, ms: Math.round(t1 - t0) }
}

/** Expose window.__audioSelfTest (idempotent). */
export function installSelfTest() {
  if (typeof window !== 'undefined') window.__audioSelfTest = runAudioSelfTest
  return runAudioSelfTest
}
