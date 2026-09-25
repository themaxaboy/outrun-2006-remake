// Traffic: lane-following vehicles in track-relative space. They cruise in the same direction
// as the player (one-way roads, like the original), change lanes with indicators, queue behind
// slower cars and take fork branches by lane. Rendered as one InstancedMesh per vehicle type.
import * as THREE from 'three'
import { RNG } from '../core/rng.js'
import { clamp, lerp, damp, KMH } from '../core/math.js'
import { collideTraffic } from '../vehicle/collisions.js'
import { BRANCH_OFFSET } from '../track/route.js'
import { LANE_W } from '../track/roadgen.js'

const TYPES = [
  ['sedan', 0.36, [26, 38]],
  ['hatch', 0.24, [25, 36]],
  ['van', 0.12, [22, 31]],
  ['pickup', 0.12, [24, 34]],
  ['bus', 0.07, [20, 26]],
  ['semi', 0.09, [19, 26]],
]
const PAINTS = ['#e8e8e8', '#1c1c1e', '#9aa0a6', '#b3201c', '#1f4e9c', '#f2c230', '#2e7d4f', '#d9d3c4', '#5b2a86', '#e07b24', '#6f8fa8', '#8b1e3f']
const CAP = 36
const FR = {}
const FR2 = {}

export class Traffic {
  constructor(scene, atmo, models, { density = 1 } = {}) {
    this.scene = scene
    this.models = models
    this.density = density
    this.list = []
    this.meshes = new Map()
    this.enabled = true
    this.route = null
    this.rng = new RNG('traffic')
    this.events = []
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25, envMapIntensity: 1.8 })
    this.uniforms = { uNight: { value: 0 } }
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this.uniforms.uNight
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPaint;\nattribute float aLight;\nattribute vec2 aState;\nvarying float vLight;\nvarying vec2 vState;\nvarying float vPaint;')
        .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.rgb = mix(color.rgb, instanceColor.rgb, aPaint);
#endif
vLight = aLight; vState = aState; vPaint = aPaint;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vLight;\nvarying vec2 vState;\nvarying float vPaint;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, vPaint);')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
float head = step(0.5, vLight) * step(vLight, 1.5);
float tail = step(1.5, vLight) * step(vLight, 2.5);
totalEmissiveRadiance += head * vec3(1.0, 0.95, 0.85) * (0.2 + uNight * 6.0);
totalEmissiveRadiance += tail * vec3(1.0, 0.06, 0.03) * (0.5 + uNight * 1.5 + vState.x * 5.0);
totalEmissiveRadiance += step(2.5, vLight) * vec3(1.0, 0.55, 0.0) * vState.y * 5.0;`,
        )
    }
    mat.customProgramCacheKey = () => 'traffic-v1'
    atmo.applyFog(mat)
    this.material = mat
    for (const [type] of TYPES) {
      const m = models.get(type)
      if (!m) continue
      const geo = m.geometry.clone()
      const state = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2).setUsage(THREE.DynamicDrawUsage)
      geo.setAttribute('aState', state)
      const im = new THREE.InstancedMesh(geo, mat, CAP)
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      im.setColorAt(0, new THREE.Color(1, 1, 1))
      im.count = 0
      im.frustumCulled = false
      im.castShadow = true
      im.receiveShadow = true
      im.name = 'traffic-' + type
      scene.add(im)
      this.meshes.set(type, { im, state, m })
    }
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._qy = new THREE.Quaternion()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3(1, 1, 1)
    this._c = new THREE.Color()
    this._basis = new THREE.Matrix4()
    this._N = new THREE.Vector3()
    this._U = new THREE.Vector3()
    this._B = new THREE.Vector3()
    this._Y = new THREE.Vector3(0, 1, 0)
  }

  setShadows(v) { for (const { im } of this.meshes.values()) im.castShadow = v }

  reset(route, enabled = true, startS = 0, spawnDist = 1100) {
    this.route = route
    this.enabled = enabled
    this.spawnDist = spawnDist
    this.list.length = 0
    this.rng = new RNG('traffic|' + route.seed)
    this.spawnAcc = 0
    if (enabled) this._fill(route.current, startS + 70, Math.min(route.current.length - 40, startS + spawnDist))
  }

  _pickType() {
    let r = this.rng.next()
    for (const t of TYPES) { r -= t[1]; if (r <= 0) return t }
    return TYPES[0]
  }

  _spawn(course, s) {
    const fr = course.sample(s, FR)
    const lanes = fr.lanes
    const lane = this.rng.int(0, lanes - 1)
    const x = course.laneX(fr.hw, lane)
    // keep a gap from other vehicles in the same lane
    for (const o of this.list) if (o.course === course && Math.abs(o.s - s) < 30 && Math.abs(o.x - x) < 2.5) return null
    const [type, , vr] = this._pickType()
    const mdl = this.models.get(type)
    if (!mdl) return null
    const v0 = this.rng.range(vr[0], vr[1])
    const veh = {
      active: true, type, course, s, x, v: v0, v0, lane, lcT: this.rng.range(4, 16), lcFrom: x, lcTo: x, lcP: 1,
      blink: 0, blinkDir: 0, brake: 0, halfL: mdl.halfL, halfW: mdl.halfW, knock: 0, knockDir: 1, knockYaw: 0,
      paint: this.rng.pick(PAINTS), passed: false, prevS: s, prevX: x, prevCourse: course, id: this.rng.int(0, 1e9),
    }
    this.list.push(veh)
    return veh
  }

  _fill(course, from, to) {
    const per = (course.stage.traffic * this.density) / 1000
    const n = Math.round((to - from) * per)
    for (let i = 0; i < n; i++) {
      const s = from + ((i + this.rng.next()) / n) * (to - from)
      if (s < course.length - 10) this._spawn(course, s)
    }
  }

  /** Fixed-step update: AI, spawning, player collisions, passes, slipstream. */
  step(dt, car, course) {
    const list = this.list
    for (const t of list) { t.prevS = t.s; t.prevX = t.x; t.prevCourse = t.course }
    if (!this.enabled) { car.slip = Math.max(0, car.slip - dt); car.slipActive = false; return }

    // spawning just beyond the visible range to keep the density (cars/km) around the player
    const D = this.spawnDist || 1100
    const want = Math.round((course.stage.traffic * this.density * D) / 1000)
    let ahead = 0
    for (const t of list) {
      const r = this._relS(t, car, course)
      if (r > 0 && r < D + 150 && t.course !== course.sibling) ahead++
    }
    this.spawnAcc += dt
    if (ahead < want && this.spawnAcc > 0.4) {
      this.spawnAcc = 0
      const s = car.s + D + this.rng.range(0, 120)
      if (s < course.length - 30) this._spawn(course, s)
      else if (course.children) {
        const kid = this.rng.chance(0.5) ? course.children[0] : course.children[1]
        const ks = s - course.length
        if (ks > 20) this._spawn(kid, ks)
      }
    }

    // AI
    for (const t of list) {
      if (t.knock > 0) {
        t.knock = Math.max(0, t.knock - dt * 0.7)
        t.knockYaw = damp(t.knockYaw, t.knockDir * t.knock * 1.1, 6, dt)
      } else t.knockYaw = damp(t.knockYaw, 0, 4, dt)
      const fr = t.course.sample(t.s, FR)
      const lanes = fr.lanes
      if (t.lane >= lanes) { t.lane = lanes - 1; this._beginLaneChange(t, t.lane, fr) }
      // queue behind the vehicle ahead in the same lane
      let target = t.v0
      let aheadV = 99
      for (const o of list) {
        if (o === t || o.course !== t.course) continue
        const gap = o.s - t.s - o.halfL - t.halfL
        if (gap > 0 && gap < 45 && Math.abs(o.x - t.x) < 2.2) {
          target = Math.min(target, o.v + (gap - 12) * 0.25)
          aheadV = Math.min(aheadV, o.v)
        }
      }
      const prevV = t.v
      t.v = t.knock > 0.3 ? damp(t.v, t.v0 * 0.6, 0.8, dt) : t.v + clamp(target - t.v, -6 * dt, 2.5 * dt)
      t.v = Math.max(0, t.v)
      t.brake = damp(t.brake, prevV - t.v > 0.02 ? 1 : 0, 10, dt)
      // lane changes
      t.lcT -= dt
      if (t.lcP >= 1 && t.lcT <= 0) {
        const dir = this.rng.sign()
        const nl = t.lane + dir
        if (nl >= 0 && nl < lanes && this._laneFree(t, nl, fr)) {
          t.blinkDir = dir
          t.blink = 1.1 // indicate before moving
          t.pendingLane = nl
        }
        t.lcT = this.rng.range(6, 20)
      }
      if (t.blink > 0) {
        t.blink -= dt
        if (t.blink <= 0 && t.pendingLane !== undefined) {
          this._beginLaneChange(t, t.pendingLane, fr)
          t.pendingLane = undefined
        }
      }
      if (t.lcP < 1) {
        t.lcP = Math.min(1, t.lcP + dt / 2.2)
        const e = t.lcP * t.lcP * (3 - 2 * t.lcP)
        t.x = lerp(t.lcFrom, t.lcTo, e)
        if (t.lcP >= 1) t.blinkDir = 0
      } else {
        t.x = damp(t.x, t.course.laneX(fr.hw, t.lane), 1.5, dt)
      }
      t.s += t.v * dt
      // fork: take a branch by lane
      if (t.s >= t.course.length) {
        const c = t.course
        if (c.goal || !c.children) { t.active = false; continue }
        const side = t.x < 0 ? 0 : 1
        const kid = c.children[side]
        t.s -= c.length
        t.x += side === 0 ? BRANCH_OFFSET : -BRANCH_OFFSET
        t.lcFrom = t.lcTo = t.x
        t.course = kid
        t.prevCourse = null
        const kfr = kid.sample(t.s, FR2)
        t.lane = clamp(Math.round((t.x + kfr.hw) / LANE_W - 0.5), 0, kfr.lanes - 1)
      }
    }

    // despawn: behind the player, or on a branch the player didn't take
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]
      const rel = this._relS(t, car, course)
      if (!t.active || rel < -120 || rel > D + 500) list.splice(i, 1)
    }

    // player interaction
    const same = this._same || (this._same = [])
    same.length = 0
    for (const t of list) if (t.course === course) same.push(t)
    const hit = collideTraffic(car, same)
    if (hit) this.events.push({ type: 'hit', t: hit })

    let slipCand = false
    for (const t of same) {
      const ds = t.s - car.s
      const dx = t.x - car.x
      if (ds > 4 && ds < 38 && Math.abs(dx) < 1.5 && car.v > 38) slipCand = true
      // passing
      if (!t.passed && ds < -t.halfL) {
        t.passed = true
        if (Math.abs(dx) < 7 && car.v > 25) {
          this.events.push({ type: 'pass', pan: clamp(dx / 5, -1, 1), speed: car.v - t.v })
          if (Math.abs(dx) < t.halfW + car.def.halfWidth + 0.9 && car.v * KMH > 150 && car.fsm !== 5) {
            this.events.push({ type: 'nearMiss', pan: clamp(dx / 4, -1, 1) })
          }
          if (car.slipActive) this.events.push({ type: 'slipPass' })
        }
      } else if (t.passed && ds > t.halfL + 2) t.passed = false
    }
    car.slip = clamp(car.slip + (slipCand ? dt * 0.9 : -dt * 0.5), 0, 1)
    car.slipActive = car.slip > 0.55 || (car.slipActive && car.slip > 0.05)
  }

  _laneFree(t, lane, fr) {
    const x = t.course.laneX(fr.hw, lane)
    for (const o of this.list) {
      if (o === t || o.course !== t.course) continue
      if (Math.abs(o.s - t.s) < 28 && Math.abs(o.x - x) < 2.4) return false
    }
    return true
  }

  _beginLaneChange(t, lane, fr) {
    t.lane = lane
    t.lcFrom = t.x
    t.lcTo = t.course.laneX(fr.hw, lane)
    t.lcP = 0
  }

  /** s of vehicle relative to the player along the route (approximate across branches). */
  _relS(t, car, course) {
    if (t.course === course) return t.s - car.s
    if (course.children && course.children.includes(t.course)) return course.length - car.s + t.s
    if (t.course === course.sibling) return car.s < 900 ? t.s - car.s : -1e9
    if (t.course.children && t.course.children.includes(course)) return t.s - t.course.length - car.s
    return -1e9
  }

  /** Per-frame: instance transforms with interpolation. */
  render(alpha, night) {
    this.uniforms.uNight.value = night
    for (const e of this.meshes.values()) e.im.count = 0
    for (const t of this.list) {
      const e = this.meshes.get(t.type)
      if (!e || e.im.count >= CAP) continue
      const i = e.im.count++
      let s = t.s, x = t.x
      if (t.prevCourse === t.course) { s = lerp(t.prevS, t.s, alpha); x = lerp(t.prevX, t.x, alpha) }
      const fr = t.course.sample(s, FR)
      this._p.set(fr.x + fr.nx * x, fr.y + fr.ny * x, fr.z + fr.nz * x)
      this._N.set(fr.nx, fr.ny, fr.nz)
      this._U.set(fr.ux, fr.uy, fr.uz)
      this._B.set(-fr.tx, -fr.ty, -fr.tz)
      this._basis.makeBasis(this._N, this._U, this._B)
      this._q.setFromRotationMatrix(this._basis)
      const lcYaw = t.lcP < 1 ? -(t.lcTo - t.lcFrom) * 0.035 * Math.sin(Math.PI * t.lcP) : 0
      this._qy.setFromAxisAngle(this._Y, lcYaw - t.knockYaw)
      this._q.multiply(this._qy)
      this._m.compose(this._p, this._q, this._s)
      e.im.setMatrixAt(i, this._m)
      e.im.setColorAt(i, this._c.set(t.paint))
      const blinkOn = t.blinkDir !== 0 && Math.floor(performance.now() / 350) % 2 === 0 ? 1 : 0
      e.state.array[i * 2] = t.brake
      e.state.array[i * 2 + 1] = blinkOn
    }
    for (const e of this.meshes.values()) {
      e.im.instanceMatrix.needsUpdate = true
      if (e.im.instanceColor) e.im.instanceColor.needsUpdate = true
      e.state.needsUpdate = true
    }
  }
}
