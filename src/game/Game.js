// Game orchestrator: owns the renderer, scene, systems and the race state machine.
// Vue never touches per-frame data: it calls methods here and listens to `bus` events.
import * as THREE from 'three'
import { Loop } from '../core/loop.js'
import { bus } from '../core/events.js'
import { params } from '../core/params.js'
import { Perf } from '../core/perf.js'
import { PRESETS, detectPreset, DynamicResolution, gpuInfo } from '../core/quality.js'
import { clamp, smoothstep, KMH, damp } from '../core/math.js'
import { Route } from '../track/route.js'
import { getStage, stageRowCol, stageExtension, START_TIME } from '../track/stages.js'
import { routeStages } from '../track/pyramid.js'
import { ChunkManager } from '../world/chunks.js'
import { Atmosphere } from '../world/atmosphere.js'
import { makeAsphalt, makeDetail, makeRadial } from '../render/textures.js'
import { createRoadMaterial } from '../render/materials/road.js'
import { createTerrainMaterial } from '../render/materials/terrain.js'
import { createPropMaterial } from '../render/materials/props.js'
import { PostFX } from '../render/post.js'
import { getCar, CARS } from '../vehicle/carDefs.js'
import { createCar, stepCar, startSpin, FSM, SURFACE } from '../vehicle/sim.js'
import { collideWalls, collideProps } from '../vehicle/collisions.js'
import { CarPoser, snapshot } from '../vehicle/pose.js'
import { buildPlaceholderCar } from '../vehicle/placeholderCar.js'
import { ChaseCam } from '../camera/chaseCam.js'
import { Input } from '../input/input.js'
import { Autopilot } from '../input/autopilot.js'
import { HUD } from '../hud/hud.js'
import { RaceTimer } from './timer.js'
import { Score } from './score.js'
import { WorldExtras } from '../world/extras.js'

const carBuilders = import.meta.glob('../vehicle/model/CarBuilder.js')
const trafficModules = import.meta.glob('../traffic/traffic.js')
const audioModules = import.meta.glob('../audio/audio.js')

const STORAGE_KEY = 'or2r.settings.v1'

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas
    this.uiRoot = uiRoot
    this.bus = bus
    this.state = 'boot'
    this.mode = 'outrun'
    this.frameNo = 0
    this._humanInput = { steer: 0, throttle: 0, brake: 0, drift: false, shiftUp: false, shiftDown: false }
    this._zeroInput = { steer: 0, throttle: 0, brake: 0, drift: false, shiftUp: false, shiftDown: false }
    this.prev = {}
    this.settings = this._loadSettings()
    this.audio = null
    this.traffic = null
  }

  _loadSettings() {
    const defaults = { preset: null, volume: { master: 0.9, music: 0.7, sfx: 0.9, engine: 0.85 }, camera: 'chase', manual: false, autoGas: true, speedUnit: 'kmh' }
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }
    } catch {
      return defaults
    }
  }

  saveSettings(patch = {}) {
    Object.assign(this.settings, patch)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)) } catch { /* private mode */ }
  }

  async init(onProgress = () => {}) {
    onProgress(0.05, 'renderer')
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: params.autotest,
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.info.autoReset = false
    this.renderer = renderer
    this.gpu = gpuInfo(renderer)

    const presetId = params.preset || this.settings.preset || detectPreset(renderer)
    this.preset = PRESETS[presetId] || PRESETS.medium
    this.dynres = new DynamicResolution(this.preset)
    this.dynres.enabled = !params.autotest && !params.bench

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.3, 7000)
    this.scene.add(this.camera)

    onProgress(0.15, 'atmosphere')
    this.atmosphere = new Atmosphere(this.scene, renderer)

    onProgress(0.25, 'textures')
    this.tex = { asphalt: makeAsphalt(512), detail: makeDetail(256), radial: makeRadial(128) }
    const A = this.atmosphere
    this.mats = {
      roadMat: A.applyFog(createRoadMaterial(this.tex.asphalt)),
      terrainMat: A.applyFog(createTerrainMaterial(this.tex.detail)),
      barrierMat: A.applyFog(createTerrainMaterial(this.tex.detail, { roughness: 0.55, strength: 0.25, side: THREE.DoubleSide, metalness: 0.35 })),
      propMat: A.applyFog(createPropMaterial()),
    }

    onProgress(0.4, 'world')
    this.chunks = new ChunkManager(this.scene, this.mats, { viewDist: this.preset.viewDist, density: this.preset.density, shadows: this.preset.shadows })
    this.extras = new WorldExtras(this.scene, this.atmosphere, this.tex)

    this.input = new Input({ touchParent: this.uiRoot })
    this.input.touch.autoGas = this.settings.autoGas
    this.cam = new ChaseCam(this.camera)
    this.cam.mode = this.settings.camera
    this.poser = new CarPoser()
    this.hud = new HUD(this.uiRoot)
    this.perf = new Perf({ overlay: params.perf || params.bench })

    onProgress(0.55, 'post')
    this.post = new PostFX(renderer, this.scene, this.camera, this.preset)
    this._applyPreset()

    // blob contact shadow under the player car
    const blobMat = new THREE.MeshBasicMaterial({ map: this.tex.radial, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false })
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), blobMat)
    this.blob.rotation.x = -Math.PI / 2
    this.blob.renderOrder = 1
    this.scene.add(this.blob)

    this.resize()
    window.addEventListener('resize', () => this.resize())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'race') this.pause()
    })

    onProgress(0.7, 'audio')
    if (audioModules['../audio/audio.js']) {
      try {
        const m = await audioModules['../audio/audio.js']()
        this.audio = m.audio
        this.audio.setVolumes?.(this.settings.volume)
      } catch (e) { console.warn('audio unavailable', e) }
    }

    onProgress(0.8, 'car')
    this.carDef = getCar(params.car || 'aurora')
    await this._setRig(this.carDef, this.carDef.colors[0], 'metallic')

    this.loop = new Loop({ step: (dt) => this.step(dt), render: (a, dt, now) => this.render(a, dt, now) })
    if (params.autotest || params.bench) {
      this.loop.virtual = true
      this.loop.virtualStepsPerFrame = params.ff ? Math.round(params.ff) : 2
    }
    onProgress(0.9, 'compile')
    // start the attract drive (title background)
    this.startAttract()
    await this._warmup()
    onProgress(1, 'ready')
    this.loop.start()
    window.__game = this
    bus.emit('game:ready', { preset: this.preset.id, gpu: this.gpu })
  }

  async _warmup() {
    this.chunks.update(this.route, this.car.s, this.camera.position, Infinity)
    this._syncVisuals(1, 1 / 60)
    try { await this.renderer.compileAsync(this.scene, this.camera) } catch { /* optional */ }
  }

  async _setRig(def, color, finish) {
    if (this.rig) {
      this.scene.remove(this.rig.root)
      this.rig.dispose?.()
    }
    let rig = null
    const loader = carBuilders['../vehicle/model/CarBuilder.js']
    if (loader) {
      try {
        const m = await loader()
        rig = m.buildCar(def.id, { color, finish, quality: this.preset.id === 'low' ? 'low' : 'high' })
      } catch (e) {
        console.warn('CarBuilder failed, using placeholder', e)
      }
    }
    if (!rig) rig = buildPlaceholderCar(def, color)
    for (const m of rig.materials) this.atmosphere.applyFog(m)
    rig.setShadow?.(this.preset.shadows)
    this.rig = rig
    this.scene.add(rig.root)
    return rig
  }

  _applyPreset() {
    const p = this.preset
    this.chunks.setQuality({ viewDist: p.viewDist, density: p.density, shadows: p.shadows })
    this.atmosphere.setShadows(p.shadows, p.shadowMap)
    this.atmosphere.setFarFade(p.farFade[0], p.farFade[1])
    this.camera.far = p.viewDist + 5200
    this.camera.updateProjectionMatrix()
    this.dynres.setPreset(p)
    this.rig?.setShadow?.(p.shadows)
    this.blob && (this.blob.material.opacity = p.shadows ? 0.35 : 0.6)
    this.resize()
  }

  setPreset(id) {
    if (!PRESETS[id] || id === this.preset.id) return
    this.preset = PRESETS[id]
    this.saveSettings({ preset: id })
    this.post.build(this.preset)
    this._applyPreset()
    this.rig && this._setRig(this.carDef, this._color, this._finish)
  }

  resize() {
    if (!this.renderer) return
    const w = window.innerWidth, h = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.dprCap) * (this.dynres?.scale ?? 1)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.post?.setSize(w, h)
  }

  // ── race lifecycle ──────────────────────────────────────────────────────────

  _newRun({ stage = '0-0', seed = params.seed || 'or2r', carDef, manual = false, autopilotRoute = null, startS = 30 }) {
    this.route = new Route({ seed, startStage: stage })
    this.course = this.route.current
    this.car = createCar(carDef, { manual, s: startS })
    const fr = this.course.sample(startS)
    this.car.x = this.course.laneX(fr.hw, Math.floor(fr.lanes / 2))
    this.stageNo = stageRowCol(stage).row + 1
    this.timer = new RaceTimer(START_TIME, { countDown: this.mode === 'outrun' })
    this.score = new Score()
    this.checkpointPending = false
    this.goalReached = false
    this.autopilot = autopilotRoute !== null ? new Autopilot(autopilotRoute) : null
    this.atmosphere.setStage(this.course.stage, this.course.start.heading)
    this.post.applyLook(this.atmosphere.look)
    this.chunks.clear()
    this.cam.reset()
    this.prev = {}
    snapshot(this.car, this.course, this.prev)
    this.extras.reset(this.route)
    if (this.traffic) this.traffic.reset(this.route, this.mode !== 'timeattack')
    this.hud.setStage(this.stageNo, this.course.stage.name, this.route.visited, this.course.stage.id)
    this.hud.setTransmission(manual)
  }

  startAttract() {
    this.mode = 'attract'
    const route = ['LRLR', 'RLRR', 'LLRL', 'RRLL', 'LRRR'][Math.floor(Math.random() * 5)]
    const def = CARS[Math.floor(Math.random() * 3)]
    this._newRun({ stage: '0-0', carDef: this.carDef || def, autopilotRoute: route, startS: 400 })
    this.car.v = 55
    this.state = 'attract'
    this.hud.show(false)
    this.input.showTouch(false)
  }

  /**
   * Start a race. cfg: { mode: 'outrun'|'timeattack', carId, color, finish, manual, music, stage?, route? }
   */
  async startRace(cfg = {}) {
    this.mode = cfg.mode || 'outrun'
    this.carDef = getCar(cfg.carId || this.carDef?.id || 'aurora')
    this._color = cfg.color || this.carDef.colors[0]
    this._finish = cfg.finish || 'metallic'
    await this._setRig(this.carDef, this._color, this._finish)
    const autopilotRoute = params.autopilot ? params.route || 'LRLR' : null
    this._newRun({
      stage: cfg.stage || params.stage || '0-0',
      carDef: this.carDef,
      manual: !!cfg.manual,
      autopilotRoute,
      startS: params.startS || 20,
    })
    this.chunks.update(this.route, this.car.s, this.camera.position, Infinity)
    this.state = 'countdown'
    this.countdownT = params.autotest || params.bench ? 0.01 : 3.6
    this._lastCount = null
    this.hud.show(true)
    this.input.showTouch(true)
    if (this.audio) {
      await this.audio.unlock?.()
      this.audio.startEngine?.(this.carDef)
      if (cfg.music) this.audio.playMusic?.(cfg.music)
    }
    bus.emit('race:start', { mode: this.mode, car: this.carDef.id })
  }

  pause() {
    if (this.state !== 'race' && this.state !== 'countdown') return
    this._pausedFrom = this.state
    this.state = 'paused'
    this.audio?.pause?.()
    bus.emit('race:paused')
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = this._pausedFrom || 'race'
    this.audio?.resume?.()
    this.loop.last = performance.now()
    bus.emit('race:resumed')
  }

  quitToTitle() {
    this.audio?.stopEngine?.()
    this.audio?.resume?.()
    this.startAttract()
    bus.emit('race:quit')
  }

  // ── simulation step (fixed dt) ─────────────────────────────────────────────

  step(dt) {
    const car = this.car
    if (!car || this.state === 'paused' || this.state === 'boot') return
    if (this.state === 'countdown') {
      this.countdownT -= dt
      car.rpm = damp(car.rpm, car.def.idle + (car.def.redline - car.def.idle) * 0.85 * this._humanInput.throttle, 6, dt)
      if (this.countdownT <= 0) {
        this.state = 'race'
        this.timer.start()
        bus.emit('race:go')
        this.audio?.sfx?.('go')
        this.hud.countdown('GO!')
      }
      return
    }
    const course = this.course
    snapshot(car, course, this.prev)

    let inp
    if (this.autopilot) inp = this.autopilot.update(car, course, this.traffic?.list, dt)
    else inp = this._humanInput
    if (this.state === 'goal' || this.state === 'timeup' || this.state === 'gameover') {
      inp = this._zeroInput
      if (this.state === 'goal') this._goalDrive(car, course, dt)
    }

    stepCar(car, inp, course, dt)
    this._humanInput.shiftUp = false
    this._humanInput.shiftDown = false

    collideWalls(car, course)
    collideProps(car, this.chunks.collidersNear(course, car.s))
    if (this.traffic) this.traffic.step(dt, car, course)

    if (car.s >= course.length) {
      if (course.goal) car.s = course.length - 0.01
      else this._commitFork()
    }
    const c = this.course

    if (this.checkpointPending && car.s > 140) {
      this.checkpointPending = false
      if (this.state === 'race') {
        const ext = this.timer.checkpoint(stageExtension(c.stage))
        this.hud.banner('CHECKPOINT!', this.mode === 'outrun' ? `EXTENDED PLAY  +${ext}` : formatSplit(this.timer.splits.at(-1)), 2.6, 'good')
        this.audio?.sfx?.('checkpoint')
        bus.emit('race:checkpoint', { stage: c.stage.id, ext })
      }
    }

    if (c.goal && !this.goalReached && car.s > c.length - 90 && this.state === 'race') this._goal()

    if (this.state === 'race') {
      if (this.timer.tick(dt)) this._timeUp()
      this.score.tick(dt, car.v)
    }
    if (this.state === 'timeup' && car.v < 0.5 && !this._overSent) {
      this._overSent = true
      setTimeout(() => this._gameOver(), 900)
    }

    for (const e of car.events) this._onCarEvent(e)
    car.events.length = 0
  }

  _goalDrive(car, course, dt) {
    // after the goal line the car cruises to a stop
    car.v = Math.max(0, car.v - 9 * dt)
  }

  _commitFork() {
    const car = this.car
    const parent = this.course
    const x = car.x
    const res = this.route.commit(x)
    if (!res) return
    // median nose (crash barrels) at the split
    if (Math.abs(x) < 1.1) {
      this.car.events.push({ type: 'hit', dv: car.v * 0.5, kind: 'nose' })
      if (car.v > 22) startSpin(car, x >= 0 ? 1 : -1)
      else car.v *= 0.5
    }
    car.s -= parent.length
    car.x += res.dx
    this.prev.course = null
    this.course = res.course
    this.stageNo++
    this.checkpointPending = true
    this.atmosphere.beginBlend(res.course.stage, res.course.start.heading)
    this.extras.onStage(res.course)
    this.hud.setStage(this.stageNo, res.course.stage.name, this.route.visited, res.course.stage.id)
    bus.emit('race:stage', { stage: res.course.stage.id, side: res.side, no: this.stageNo })
  }

  _goal() {
    this.goalReached = true
    this.timer.finish()
    const bonus = this.mode === 'outrun' ? this.score.goalBonus(this.timer.left) : 0
    this.state = 'goal'
    this.hud.banner('GOAL!', this.mode === 'outrun' ? `TIME BONUS  ${bonus.toLocaleString('en-US')}` : '', 5, 'good')
    this.audio?.sfx?.('goal')
    this.cam.mode = 'far'
    const col = Number(this.course.stage.id.split('-')[1])
    this.result = this._makeResult(true, col)
    setTimeout(() => {
      this.hud.show(false)
      this.input.showTouch(false)
      bus.emit('race:goal', this.result)
    }, 4200)
  }

  _timeUp() {
    this.state = 'timeup'
    this._overSent = false
    this.hud.banner('TIME UP', '', 4, 'bad')
    this.audio?.sfx?.('timeup')
  }

  _gameOver() {
    this.state = 'gameover'
    this.result = this._makeResult(false, null)
    this.hud.show(false)
    this.input.showTouch(false)
    this.audio?.sfx?.('gameover')
    bus.emit('race:gameover', this.result)
  }

  _makeResult(goal, goalCol) {
    return {
      mode: this.mode,
      goal,
      goalCol,
      route: this.route.routeString,
      stages: [...this.route.visited],
      score: this.score.value,
      totalTime: this.timer.total,
      splits: [...this.timer.splits],
      timeLeft: this.timer.left,
      car: this.carDef.id,
      color: this._color,
      crashes: this.car.crashes,
      bestDrift: this.score.bestDrift,
      nearMisses: this.score.nearMisses,
      distance: this.car.distance,
    }
  }

  _onCarEvent(e) {
    const a = this.audio
    switch (e.type) {
      case 'driftStart':
        if (this.state === 'race') this.score.driftStart()
        a?.sfx?.('driftStart')
        break
      case 'driftEnd':
        if (this.state === 'race') {
          const pts = this.score.driftEnd(e.score, e.broken)
          if (pts > 0) this.hud.drift(false, this.score.multiplier, pts)
        }
        break
      case 'wall':
        this.cam.shake.add(Math.min(0.6, e.vn / 20))
        a?.sfx?.('wall', { intensity: Math.min(1, e.vn / 20) })
        this.input.rumble(0.6, 0.3, 140)
        this.extras.sparks(this.poser.position, e.side)
        break
      case 'scrape':
        if ((this.frameNo & 7) === 0) this.extras.sparks(this.poser.position, e.side, 0.3)
        break
      case 'crash':
        this.cam.shake.add(1)
        a?.sfx?.('crash')
        a?.duck?.(0.4, 2)
        this.input.rumble(1, 1, 500)
        this.hud.banner('CRASH!', '', 1.6, 'bad')
        break
      case 'spin':
      case 'hit':
      case 'bump':
        this.cam.shake.add(0.45)
        a?.sfx?.(e.type === 'bump' ? 'bump' : 'hit', { intensity: Math.min(1, (e.dv || 10) / 25) })
        this.input.rumble(0.8, 0.5, 200)
        break
      case 'land':
        if (e.impact > 2) { this.cam.shake.add(Math.min(0.5, e.impact / 10)); a?.sfx?.('land', { intensity: Math.min(1, e.impact / 8) }) }
        break
      case 'shift':
        a?.sfx?.('shift', { dir: e.dir })
        break
    }
  }

  // ── render (per frame) ─────────────────────────────────────────────────────

  render(alpha, frameDt, now) {
    const t0 = performance.now()
    this.frameNo++
    const car = this.car
    const inp = this.input.update(frameDt, car ? car.v / car.def.vmax : 0)
    if (this.state === 'race' || this.state === 'countdown') {
      const h = this._humanInput
      h.steer = inp.steer; h.throttle = inp.throttle; h.brake = inp.brake; h.drift = inp.drift
      h.shiftUp = h.shiftUp || inp.shiftUp
      h.shiftDown = h.shiftDown || inp.shiftDown
      if (inp.camera) { this.cam.cycle(); this.saveSettings({ camera: this.cam.mode }) }
      if (inp.pause) this.pause()
    } else if (this.state === 'paused' && inp.pause) {
      this.resume()
    }
    bus.emit('input:frame', inp) // menus listen (cheap: no reactive data)

    if (this.state === 'countdown') {
      const n = Math.ceil(this.countdownT - 0.6)
      if (n !== this._lastCount && n >= 1 && n <= 3) {
        this._lastCount = n
        this.hud.countdown(String(n))
        this.audio?.sfx?.('countdown')
      }
    }

    this._syncVisuals(alpha, frameDt)

    // stream world
    const builds = this.chunks.complete ? 1 : 2
    this.chunks.update(this.route, car.s, this.camera.position, builds)

    // HUD
    if (this.state !== 'attract') this._updateHud(frameDt)

    // audio
    if (this.audio && (this.state === 'race' || this.state === 'countdown' || this.state === 'goal' || this.state === 'timeup')) {
      this.audio.updateEngine?.({
        rpm: car.rpm, rpmNorm: car.rpmNorm, throttle: car.throttle, load: car.throttle, speed: car.v, limiter: car.limiter,
        drift: car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY ? clamp(Math.abs(car.beta) / 0.5, 0, 1) * clamp(car.v / 30, 0, 1) : 0,
        offroad: car.surface === SURFACE.OFFROAD ? clamp(car.v / 20, 0, 1) : 0,
        rumble: car.surface === SURFACE.CURB ? clamp(car.v / 20, 0, 1) : 0,
        wind: clamp(car.v / car.def.vmax, 0, 1), airborne: car.airborne, camera: this.cam.mode,
      })
    }

    const updateMs = performance.now() - t0 + this.loop.stepCost
    this.renderer.info.reset()
    this.post.render(frameDt)
    this.perf.frame(frameDt * 1000, updateMs, this.renderer)
    if (this.perf.el) {
      this.perf.extra.preset = `${this.preset.id} x${this.dynres.scale.toFixed(2)}`
      this.perf.extra.speed = `${(car.v * KMH).toFixed(0)} km/h  ${['GRIP', 'ENTRY', 'DRIFT', 'RECOVER', 'SPIN', 'CRASH'][car.fsm]}`
      this.perf.extra.stage = `${this.course.stage.id} s=${car.s.toFixed(0)} chunks=${this.chunks.count}`
    }
    const ns = this.dynres.sample(frameDt * 1000, now)
    if (ns !== null) this.resize()
  }

  _syncVisuals(alpha, frameDt) {
    const car = this.car
    const poser = this.poser.update(car, this.course, this.prev, alpha, frameDt)
    const rig = this.rig
    rig.root.position.copy(poser.position)
    rig.root.quaternion.copy(poser.quaternion)
    const look = this.atmosphere.look
    rig.update(frameDt, {
      speed: car.v, steerAngle: car.steerAngle, brake: car.brake, throttle: car.throttle,
      lights: look.night > 0.3 ? 1 : 0, drift: car.fsm === FSM.DRIFT ? 1 : 0, crashed: car.fsm === FSM.CRASH,
    })
    // contact shadow
    const fr = poser.frame
    this.blob.position.set(poser.position.x, fr.y + fr.ny * car.x + 0.04, poser.position.z)
    this.blob.rotation.set(-Math.PI / 2, 0, -poser.bodyYaw, 'YXZ')
    this.blob.visible = car.fsm !== FSM.CRASH && car.yOff < 2

    // stage blend
    if (this.course.parent) this.atmosphere.setBlend(smoothstep(0, 520, car.s))
    this.cam.update(frameDt, poser, car, { slip: car.slipActive ? 1 : 0 })
    this.atmosphere.update(frameDt, this.camera, poser.position)
    this.post.applyLook(look)
    if (this.post.hasSpeed) {
      const vn = clamp(car.v / car.def.vmax, 0, 1.1)
      this.post.speed.strength = damp(this.post.speed.strength, Math.max(0, vn - 0.45) * 0.06 + (car.slipActive ? 0.02 : 0), 4, frameDt)
    }
    // material uniforms
    this.mats.propMat.userData.uniforms.uTime.value += frameDt
    this.mats.propMat.userData.uniforms.uNight.value = look.night
    this.mats.propMat.userData.uniforms.uWind.value = look.wind
    this.mats.roadMat.userData.uniforms.uWet.value = look.wet
    this.extras.update(frameDt, this.camera, poser, car, this.course, look)
  }

  _updateHud(dt) {
    const car = this.car
    const c = this.course
    const drifting = car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY
    if (drifting && this.state === 'race') this.hud.drift(true, this.score.multiplier, Math.round(car.driftScore * 9) * this.score.multiplier)
    const forkShow = !c.goal && c.children && c.length - car.s < 950 && c.length - car.s > 0
    this.hud.fork(forkShow, c.children?.[0]?.stage.name, c.children?.[1]?.stage.name)
    this.hud.update(dt, {
      speedKmh: car.v * KMH,
      rpmNorm: car.rpm / car.def.redline,
      gear: car.gear,
      timeLeft: this.timer.left,
      countDown: this.mode === 'outrun',
      stageTotal: this.timer.total,
      score: this.score.value,
      stageTime: this.timer.stageTime,
      progress: clamp(car.s / c.length, 0, 1),
      slip: car.slip,
      slipActive: car.slipActive,
    })
  }
}

function formatSplit(t) {
  if (t === undefined) return ''
  const m = Math.floor(t / 60)
  const s = (t - m * 60).toFixed(2).padStart(5, '0')
  return `SPLIT ${m}'${s.replace('.', '"')}`
}

export { routeStages }
