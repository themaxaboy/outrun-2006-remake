// Master mix: buses → master gain → gentle limiter → destination.
//
//   music ─┐                                (music = musicDuck → musicVol)
//   engine ┼─► master ─► DynamicsCompressor ─► makeup ─► destination
//   sfx ───┤
//   ui ────┘
import { setParam, holdParam } from './env.js'

export const DEFAULT_VOLUMES = { master: 0.9, music: 0.7, sfx: 0.85, engine: 0.8 }

// Per-bus trim so the default mix is balanced before user volumes are applied.
const TRIM = { music: 0.55, engine: 0.62, sfx: 0.75, ui: 0.7 }

export function createMixer(ctx, volumes = DEFAULT_VOLUMES) {
  const master = ctx.createGain()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -8
  comp.knee.value = 8
  comp.ratio.value = 6
  comp.attack.value = 0.003
  comp.release.value = 0.22
  const makeup = ctx.createGain()
  makeup.gain.value = 1.0
  master.connect(comp)
  comp.connect(makeup)
  makeup.connect(ctx.destination)

  const bus = (name) => {
    const g = ctx.createGain()
    g.gain.value = TRIM[name]
    g.connect(master)
    return g
  }
  const music = bus('music')
  const engine = bus('engine')
  const sfx = bus('sfx')
  const ui = bus('ui')

  // Music passes through a duck stage (crash / jingles) before its volume bus.
  const musicDuck = ctx.createGain()
  musicDuck.gain.value = 1
  musicDuck.connect(music)

  const vol = { ...DEFAULT_VOLUMES, ...volumes }
  master.gain.value = vol.master

  const mixer = {
    ctx,
    master,
    comp,
    buses: { music: musicDuck, engine, sfx, ui },
    musicDuck,
    volumes: vol,
    duckUntil: 0,
    duckDepth: 1,
    setVolumes(v = {}, time = ctx.currentTime) {
      for (const k of ['master', 'music', 'sfx', 'engine']) {
        if (typeof v[k] === 'number' && Number.isFinite(v[k])) vol[k] = Math.max(0, Math.min(1, v[k]))
      }
      setParam(master.gain, vol.master, time, 0.05)
      setParam(music.gain, TRIM.music * vol.music, time, 0.05)
      setParam(engine.gain, TRIM.engine * vol.engine, time, 0.05)
      setParam(sfx.gain, TRIM.sfx * vol.sfx, time, 0.05)
      setParam(ui.gain, TRIM.ui * vol.sfx, time, 0.05)
    },
    /** Temporarily lower music by `amount` (0..1) for `seconds`. Overlapping ducks merge. */
    duck(amount = 0.5, seconds = 1.2, time = ctx.currentTime) {
      let depth = Math.max(0.02, 1 - Math.max(0, Math.min(1, amount)))
      let until = time + Math.max(0.05, seconds)
      if (time < mixer.duckUntil) {
        // Already ducking: keep the deeper level and the later release.
        depth = Math.min(depth, mixer.duckDepth)
        until = Math.max(until, mixer.duckUntil)
      }
      mixer.duckDepth = depth
      mixer.duckUntil = until
      const g = musicDuck.gain
      holdParam(g, time)
      setParam(g, depth, time, 0.04)
      setParam(g, 1, until, 0.35)
    },
  }
  mixer.setVolumes(vol, ctx.currentTime)
  return mixer
}
