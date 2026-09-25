// Module worker: renders drum / sfx / loop / sampled-instrument buffers off the main thread.
// Receives { jobs: [{ id, kind, key, sr }] } and posts back { id, kind, key, sr, chans }
// (channel buffers transferred) one job at a time, so results stream in progressively.
import { renderDrumStereo } from '../music/drumkit.js'
import { renderSfxChannels } from '../sfx/sfxBank.js'
import { LOOP_RENDER } from '../sfx/loops.js'
import { renderSamplerNote } from '../music/samplers.js'

function render(kind, key, sr) {
  switch (kind) {
    case 'drum':
      return renderDrumStereo(key, sr)
    case 'sfx':
      return renderSfxChannels(key, sr)
    case 'loop':
      return LOOP_RENDER[key] ? [LOOP_RENDER[key](sr)] : null
    case 'smp': {
      const [preset, midi] = key.split(':')
      // slice → private copy we can transfer without emptying the worker-side cache
      return [renderSamplerNote(preset, Number(midi), sr).slice()]
    }
    default:
      return null
  }
}

self.onmessage = (e) => {
  const jobs = (e.data && e.data.jobs) || []
  for (const job of jobs) {
    try {
      const chans = render(job.kind, job.key, job.sr)
      if (!chans) {
        self.postMessage({ ...job, error: 'unknown asset' })
        continue
      }
      self.postMessage({ ...job, chans }, chans.map((c) => c.buffer))
    } catch (err) {
      self.postMessage({ ...job, error: String((err && err.message) || err) })
    }
  }
  self.postMessage({ done: true })
}
