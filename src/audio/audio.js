// Public audio API for the game. Everything is synthesised with the Web Audio API.
//
//   import { audio } from './audio/audio.js'
//   await audio.unlock()                 // from a user gesture
//   audio.playMusic('coastline')
//   audio.startEngine(carDef); audio.updateEngine(p)   // every frame
//   audio.sfx('checkpoint')
//
// Safe to import in Node: no window / AudioContext access happens until unlock().
import { getAudioContextClass, hasWindow, hasDocument } from './core/env.js'
import { createMixer, DEFAULT_VOLUMES } from './core/mixer.js'
import { EngineSound, loadEngineWorklet } from './engine/engineSound.js'
import { DrivingLoops } from './sfx/loops.js'
import { SfxBank } from './sfx/sfxBank.js'
import { TrackPlayer, BufferPlayer, TICK_MS, samplerNotes, VOICE_CAP } from './music/player.js'
import { TRACKS, getTrack } from './music/tracks/index.js'
import { getReverb } from './music/fx.js'
import { buildJobs, startPrerender } from './core/prerender.js'
import { saveUserTrack, loadUserTracks, clearUserTracks } from './userTracks.js'

const MAX_USER_TRACKS = 40
const MAX_USER_FILE_BYTES = 80 * 1024 * 1024
const DECODED_CACHE = 2

function decode(ctx, arrayBuffer) {
  // decodeAudioData detaches its input — always hand it a copy.
  const copy = arrayBuffer.slice(0)
  return new Promise((resolve, reject) => {
    try {
      const p = ctx.decodeAudioData(copy, resolve, reject)
      if (p && p.then) p.then(resolve, reject)
    } catch (e) {
      reject(e)
    }
  })
}

// resume() can stay pending until a user gesture (autoplay policy) — never block callers on it.
const settle = (p, ms = 300) => Promise.race([p, new Promise((r) => setTimeout(r, ms))])

export class AudioEngine {
  constructor() {
    this.ctx = null
    this.mixer = null
    this._volumes = { ...DEFAULT_VOLUMES }
    this._paused = false
    this._hidden = false
    this._timer = null
    this._sfx = null
    this._engine = null
    this._loops = null
    this._car = null
    this._workletOk = null // null while the module is loading
    this._player = null
    this._fading = []
    this._musicId = null
    this._wantMusic = null
    this._user = [] // { id, title, size, data: ArrayBuffer, duration }
    this._decoded = new Map() // id → AudioBuffer (small LRU)
    this._restorePromise = null
    this._prerender = null
    this._seed = 1
  }

  // ── context lifecycle ──────────────────────────────────────────────────────────────────
  /** Create / resume the AudioContext. Call from user gestures; idempotent and cheap. */
  async unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !this._paused && !this._hidden) {
        await settle(this.ctx.resume().catch(() => {}))
      }
      return this.ready
    }
    const Ctor = getAudioContextClass()
    if (!Ctor) return false
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' })
    } catch {
      try {
        this.ctx = new Ctor()
      } catch {
        return false
      }
    }
    // resume() synchronously inside the gesture (Safari), then build the graph.
    const resumed = this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume().catch(() => {})
    this._setup()
    await settle(resumed)
    return this.ready
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running'
  }

  _setup() {
    const ctx = this.ctx
    this.mixer = createMixer(ctx, this._volumes)
    this._sfx = new SfxBank(ctx, this.mixer.buses, { onDuck: (a, s) => this.duck(a, s) })
    getReverb(ctx)
    this._timer = setInterval(() => this._tick(), TICK_MS)
    if (hasDocument()) {
      this._hidden = !!document.hidden
      this._onVis = () => {
        this._hidden = !!document.hidden
        if (!this.ctx) return
        if (this._hidden) this.ctx.suspend().catch(() => {})
        else if (!this._paused) this.ctx.resume().catch(() => {})
      }
      document.addEventListener('visibilitychange', this._onVis)
    }
    loadEngineWorklet(ctx).then((ok) => {
      this._workletOk = ok
      if (this._car) this._createEngine()
    })
    this._restorePromise = this._restoreUserTracks()
    this._queuePrewarm()
    if (this._wantMusic) {
      const id = this._wantMusic
      this._wantMusic = null
      this.playMusic(id)
    }
  }

  _tick() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    if (this._player) this._player.tick()
    if (this._fading.length) {
      const now = ctx.currentTime
      this._fading = this._fading.filter((p) => {
        p.tick()
        return now < p.stopAt + 0.2
      })
    }
  }

  /** Pre-render sfx / drum / loop / sampler buffers (Worker, or idle-time slices). */
  _queuePrewarm() {
    const notes = []
    for (const t of TRACKS) notes.push(...samplerNotes(t))
    this._prerender = startPrerender(this.ctx, buildJobs(this.ctx, notes))
  }

  /** Game pause: suspend the whole context. */
  pause() {
    this._paused = true
    if (this.ctx) this.ctx.suspend().catch(() => {})
  }

  resume() {
    this._paused = false
    if (this.ctx && !this._hidden) this.ctx.resume().catch(() => {})
  }

  setVolumes(v = {}) {
    for (const k of ['master', 'music', 'sfx', 'engine']) {
      if (typeof v[k] === 'number' && Number.isFinite(v[k])) this._volumes[k] = Math.max(0, Math.min(1, v[k]))
    }
    if (this.mixer) this.mixer.setVolumes(this._volumes)
  }

  get volumes() {
    return { ...this._volumes }
  }

  duck(amount = 0.5, seconds = 1.2) {
    if (this.mixer) this.mixer.duck(amount, seconds)
  }

  // ── engine ─────────────────────────────────────────────────────────────────────────────
  startEngine(carDef = {}) {
    this._car = { ...carDef }
    if (!this.ctx || this._workletOk === null) return // created once unlocked / worklet settled
    this._createEngine()
  }

  _createEngine() {
    const ctx = this.ctx
    if (this._engine) this._engine.stop(ctx.currentTime, 0.12)
    this._engine = new EngineSound(ctx, this.mixer.buses.engine, this._car, {
      useWorklet: !!this._workletOk,
      seed: this._seed++,
      onBackfire: (when, intensity) => this._sfx && this._sfx.play('backfire', { when, intensity }),
    })
    if (!this._loops || this._loops.stopped) this._loops = new DrivingLoops(ctx, this.mixer.buses.sfx)
    if (this._lastParams) this.updateEngine(this._lastParams)
  }

  stopEngine() {
    this._car = null
    const t = this.ctx ? this.ctx.currentTime : 0
    if (this._engine) this._engine.stop(t, 0.3)
    if (this._loops) this._loops.stop(t, 0.2)
    this._engine = null
    this._loops = null
  }

  /** Per-frame engine / surface update. Cheap: a few guarded AudioParam targets. */
  updateEngine(p) {
    if (!p) return
    this._lastParams = p
    const e = this._engine
    if (!e || !this.ctx || this.ctx.state !== 'running') return
    const t = this.ctx.currentTime
    e.update(p, t)
    if (this._loops) this._loops.update(p, t)
  }

  get engineKind() {
    return this._engine ? this._engine.kind : this._workletOk === false ? 'fallback' : null
  }

  // ── sfx ────────────────────────────────────────────────────────────────────────────────
  sfx(name, opts = {}) {
    if (!this._sfx || !this.ready) return false
    if (name === 'shift' && this._engine) this._engine.shift(opts.dir ?? 1, this.ctx.currentTime)
    if (name === 'backfire' && this._engine) this._engine.crackle(0.8, this.ctx.currentTime)
    return this._sfx.play(name, opts)
  }

  // ── music ──────────────────────────────────────────────────────────────────────────────
  get tracks() {
    return TRACKS.map((t) => ({ id: t.id, title: t.title, bpm: t.bpm, style: t.style }))
  }

  get userTracks() {
    return this._user.map((u) => ({ id: u.id, title: u.title }))
  }

  get currentMusic() {
    return this._musicId
  }

  /** Built-in id or 'user:<index>'. Crossfades ~1 s; loops. Before unlock it is remembered. */
  playMusic(id) {
    if (!id) return
    if (!this.ctx) {
      this._wantMusic = id
      return
    }
    if (id === this._musicId && this._player && !this._player.stopped) return
    const ctx = this.ctx
    const fade = 1
    const hadPlayer = !!this._player
    this._stopPlayer(fade)
    this._musicId = id
    if (String(id).startsWith('user:')) {
      this._playUser(id, hadPlayer ? fade : 0.3)
      return
    }
    const track = getTrack(id)
    if (!track) {
      this._musicId = null
      return
    }
    const p = new TrackPlayer(ctx, track, this.mixer.buses.music, { seed: this._seed++ })
    p.prewarm()
    p.start(ctx.currentTime + 0.06, { fade: hadPlayer ? fade : 0.3 })
    this._player = p
    if (ctx.state === 'running') p.tick()
  }

  _stopPlayer(fade) {
    if (!this._player) return
    this._player.stop(this.ctx.currentTime, fade)
    this._fading.push(this._player)
    this._player = null
  }

  stopMusic(fadeSeconds = 1) {
    this._wantMusic = null
    this._musicId = null
    if (this.ctx) this._stopPlayer(Math.max(0.02, fadeSeconds))
  }

  get musicTime() {
    return this._player ? this._player.position : 0
  }

  async _playUser(id, fade) {
    const entry = this._user.find((u) => u.id === id)
    if (!entry) {
      this._musicId = null
      return
    }
    let buf = this._decoded.get(id)
    if (!buf) {
      try {
        buf = await decode(this.ctx, entry.data)
      } catch {
        this._musicId = null
        return
      }
      this._remember(id, buf)
    }
    if (this._musicId !== id) return // user switched away meanwhile
    this._stopPlayer(fade)
    const p = new BufferPlayer(this.ctx, buf, this.mixer.buses.music)
    p.start(this.ctx.currentTime + 0.03, { fade })
    this._player = p
  }

  _remember(id, buf) {
    this._decoded.delete(id)
    this._decoded.set(id, buf)
    while (this._decoded.size > DECODED_CACHE) this._decoded.delete(this._decoded.keys().next().value)
  }

  async _restoreUserTracks() {
    const recs = await loadUserTracks()
    for (const r of recs) {
      if (!r || !r.data) continue
      if (this._user.some((u) => u.title === r.title && u.size === r.size)) continue
      this._user.push({ id: `user:${this._user.length}`, title: r.title || r.name || 'Track', size: r.size, data: r.data, duration: r.duration })
    }
  }

  /**
   * Decode a FileList / File[] of audio files. Returns the added tracks [{ id, title }].
   * Files are kept (encoded) in IndexedDB so they come back after a reload.
   */
  async loadUserFiles(fileList) {
    if (!this.ctx) await this.unlock()
    if (!this.ctx) return []
    if (this._restorePromise) await this._restorePromise
    const added = []
    for (const f of Array.from(fileList || [])) {
      if (this._user.length >= MAX_USER_TRACKS) break
      try {
        if (!f || typeof f.arrayBuffer !== 'function' || f.size > MAX_USER_FILE_BYTES) continue
        const title = String(f.name || 'Track').replace(/\.[^.]+$/, '')
        const dup = this._user.find((u) => u.title === title && u.size === f.size)
        if (dup) {
          added.push({ id: dup.id, title: dup.title })
          continue
        }
        const data = await f.arrayBuffer()
        const buf = await decode(this.ctx, data) // validates the file
        const entry = { id: `user:${this._user.length}`, title, size: f.size, data, duration: buf.duration }
        this._user.push(entry)
        this._remember(entry.id, buf)
        added.push({ id: entry.id, title })
        saveUserTrack({ name: f.name, title, type: f.type, size: f.size, duration: buf.duration, data })
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[audio] could not decode', f && f.name, e)
      }
    }
    return added
  }

  /** Forget all user tracks (memory + IndexedDB). */
  async clearUserTracks() {
    if (this._musicId && this._musicId.startsWith('user:')) this.stopMusic(0.5)
    this._user = []
    this._decoded.clear()
    await clearUserTracks()
  }

  /** Debug snapshot (voices, state). */
  stats() {
    return {
      state: this.ctx ? this.ctx.state : 'none',
      sampleRate: this.ctx ? this.ctx.sampleRate : 0,
      engine: this.engineKind,
      music: this._musicId,
      voices: this._player && this._player.pool ? this._player.pool.active : 0,
      voiceCap: VOICE_CAP,
      stolen: this._player && this._player.pool ? this._player.pool.stolen : 0,
      fading: this._fading.length,
      sfxActive: this._sfx ? this._sfx.active : 0,
      prewarmMode: this._prerender ? this._prerender.mode : null,
      prewarmPending: this._prerender ? this._prerender.pending() : 0,
    }
  }
}

export const audio = new AudioEngine()

// Lazy self-test hook for e2e runs: available wherever the game imports the audio module,
// without pulling the self-test code into the main chunk.
if (hasWindow() && !window.__audioSelfTest) {
  window.__audioSelfTest = (opts) => import('./selfTest.js').then((m) => m.runAudioSelfTest(opts))
}
