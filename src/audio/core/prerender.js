// Pre-renders every procedurally generated buffer after unlock so nothing is synthesised on
// the main thread during play. Prefers a module Worker; falls back to small idle-time slices.
// Anything requested before its job has finished is still rendered synchronously on demand by
// the regular getters (getDrumBuffer, getSfxBuffer, …), so this is purely an optimisation.
import { toAudioBuffer, ctxCacheHas, ctxCacheSet } from './dsp.js'
import { hasWindow } from './env.js'
import { DRUM_NAMES, drumCacheKey, drumSampleRate, getDrumBuffer } from '../music/drumkit.js'
import { SFX_BUFFER_KEYS, sfxCacheKey, sfxSampleRate, getSfxBuffer } from '../sfx/sfxBank.js'
import { LOOP_NAMES, loopCacheKey, loopSampleRate, getLoopBuffer } from '../sfx/loops.js'
import { SAMPLER_SR, samplerCacheKey, installSamplerNote, getSamplerBuffer } from '../music/samplers.js'

const PRIORITY_SFX = ['countdown', 'go', 'shift', 'backfire0', 'backfire1', 'backfire2', 'uiMove', 'uiSelect', 'uiBack', 'whooshNoise']

/** Job list in priority order. `samplerNotes` = [{ preset, midi }] for the built-in tracks. */
export function buildJobs(ctx, samplerNotes = []) {
  const jobs = []
  const push = (kind, key, sr) => jobs.push({ id: jobs.length, kind, key, sr })
  for (const k of PRIORITY_SFX) push('sfx', k, sfxSampleRate(ctx))
  for (const d of DRUM_NAMES) push('drum', d, drumSampleRate(ctx))
  for (const l of LOOP_NAMES) push('loop', l, loopSampleRate(ctx))
  for (const { preset, midi } of samplerNotes) push('smp', `${preset}:${midi}`, SAMPLER_SR)
  for (const k of SFX_BUFFER_KEYS) if (!PRIORITY_SFX.includes(k)) push('sfx', k, sfxSampleRate(ctx))
  return jobs
}

const cacheKeyOf = (job) => {
  if (job.kind === 'drum') return drumCacheKey(job.key)
  if (job.kind === 'sfx') return sfxCacheKey(job.key)
  if (job.kind === 'loop') return loopCacheKey(job.key)
  const [preset, midi] = job.key.split(':')
  return samplerCacheKey(preset, Number(midi))
}

function install(ctx, job, chans) {
  const key = cacheKeyOf(job)
  if (ctxCacheHas(ctx, key)) return
  if (job.kind === 'smp') {
    const [preset, midi] = job.key.split(':')
    installSamplerNote(preset, Number(midi), chans[0], job.sr)
  }
  ctxCacheSet(ctx, key, toAudioBuffer(ctx, chans, job.sr))
}

function renderSync(ctx, job) {
  if (job.kind === 'drum') getDrumBuffer(ctx, job.key)
  else if (job.kind === 'sfx') getSfxBuffer(ctx, job.key)
  else if (job.kind === 'loop') getLoopBuffer(ctx, job.key)
  else {
    const [preset, midi] = job.key.split(':')
    getSamplerBuffer(ctx, preset, Number(midi))
  }
}

const idle = (fn) => {
  if (hasWindow() && window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 250 })
  else setTimeout(fn, 16)
}

/**
 * Start pre-rendering. Returns { pending(), mode, done: Promise }.
 */
export function startPrerender(ctx, jobs) {
  const state = { left: jobs.length, mode: 'worker' }
  let resolveDone
  state.done = new Promise((r) => (resolveDone = r))
  state.pending = () => state.left

  const fallback = (remaining) => {
    state.mode = 'idle'
    const q = remaining.slice()
    const run = () => {
      const t0 = Date.now()
      while (q.length && Date.now() - t0 < 6) {
        renderSync(ctx, q.shift())
        state.left = q.length
      }
      if (q.length) idle(run)
      else resolveDone()
    }
    idle(run)
  }

  let worker = null
  try {
    if (typeof Worker !== 'undefined') worker = new Worker(new URL('./renderWorker.js', import.meta.url), { type: 'module' })
  } catch {
    worker = null
  }
  if (!worker) {
    fallback(jobs)
    return state
  }
  const done = new Set()
  const finish = () => {
    try {
      worker.terminate()
    } catch {
      /* ignore */
    }
  }
  worker.onmessage = (e) => {
    const d = e.data || {}
    if (d.done) {
      finish()
      const missing = jobs.filter((j) => !done.has(j.id))
      if (missing.length) fallback(missing)
      else resolveDone()
      return
    }
    done.add(d.id)
    state.left = jobs.length - done.size
    if (!d.error && d.chans) install(ctx, d, d.chans)
  }
  worker.onerror = () => {
    // module workers unsupported or failed to load → render on the main thread in idle slices
    finish()
    fallback(jobs.filter((j) => !done.has(j.id)))
  }
  worker.postMessage({ jobs })
  return state
}
