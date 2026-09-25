// Chase / bumper / far cameras. The chase cam follows the *velocity* heading (not the body),
// so in a powerslide you see the car's flank swing out — the signature OutRun2 look.
import * as THREE from 'three'
import { damp, lerpAngle, clamp, lerp } from '../core/math.js'
import { Shake } from './shake.js'
import { FSM } from '../vehicle/sim.js'

const MODES = ['chase', 'far', 'bumper']

export class ChaseCam {
  constructor(camera) {
    this.camera = camera
    this.mode = 'chase'
    this.yaw = 0
    this.pitch = 0
    this.fov = 60
    this.height = 1.6
    this.dist = 5.6
    this.swing = 0
    this.roll = 0
    this.shake = new Shake()
    this.initialized = false
    this._f = new THREE.Vector3()
    this._t = new THREE.Vector3()
  }

  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]
  }

  reset() { this.initialized = false }

  /** Cinematic shots (not user-selectable): orbit around the car, or a fixed trackside camera. */
  _cinematic(dt, poser, car, course) {
    const cam = this.camera
    const P = poser.position
    this.cineT = (this.cineT || 0) + dt
    if (this.mode === 'orbit') {
      const a = poser.velYaw + Math.PI * 0.8 + this.cineT * 0.35
      const r = 8.5 + Math.sin(this.cineT * 0.3) * 1.5
      cam.position.set(P.x + Math.sin(a) * r, P.y + 2.2 + Math.sin(this.cineT * 0.5) * 0.6, P.z - Math.cos(a) * r)
      cam.lookAt(P.x, P.y + 0.7, P.z)
      this.fov = damp(this.fov, 44, 2, dt)
    } else {
      // trackside: pick a spot ahead at the roadside, hold it until the car passes
      if (!this.spot || !course || this.spot.course !== course || car.s > this.spot.s + 25) {
        const fr = course.sample(car.s + 140 + car.v * 1.2)
        const side = Math.random() < 0.5 ? -1 : 1
        const x = side * (fr.hw + 5)
        this.spot = { course, s: fr.s, pos: { x: fr.x + fr.nx * x, y: fr.y + fr.ny * x + 1.4, z: fr.z + fr.nz * x } }
      }
      cam.position.set(this.spot.pos.x, this.spot.pos.y, this.spot.pos.z)
      cam.lookAt(P.x, P.y + 0.8, P.z)
      const d = cam.position.distanceTo(P)
      this.fov = damp(this.fov, Math.max(12, Math.min(55, 900 / (d + 8))), 4, dt)
    }
    cam.up.set(0, 1, 0)
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix() }
  }

  update(dt, poser, car, { slip = 0, course = null } = {}) {
    const cam = this.camera
    if (this.mode === 'orbit' || this.mode === 'trackside') return this._cinematic(dt, poser, car, course)
    const vn = clamp(car.v / car.def.vmax, 0, 1.1)
    const drifting = car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY
    // yaw target: velocity heading, partially following the body during slides
    const bodyFollow = car.fsm === FSM.SPIN || car.fsm === FSM.CRASH ? 0 : 0.28
    const yawT = poser.velYaw + car.beta * bodyFollow
    if (!this.initialized) {
      this.yaw = yawT
      this.pitch = poser.pitchRoad
      this.initialized = true
    }
    this.yaw = lerpAngle(this.yaw, yawT, 1 - Math.exp(-(car.fsm === FSM.CRASH ? 1.5 : 7.5) * dt))
    this.pitch = damp(this.pitch, poser.pitchRoad * 0.85, 4, dt)
    this.swing = damp(this.swing, drifting ? -car.beta * 0.9 : 0, 3, dt)
    this.roll = damp(this.roll, poser.bank * 0.45 - car.latAcc * 0.0015, 4, dt)

    let dist, height, look, fovT
    if (this.mode === 'bumper') {
      dist = -0.4; height = 1.02; look = 20; fovT = 70 + 16 * vn * vn
    } else if (this.mode === 'far') {
      dist = 8.4 + 1.4 * vn; height = 2.6; look = 7; fovT = 56 + 12 * vn * vn
    } else {
      dist = 5.5 + 1.1 * vn; height = 1.55 + 0.2 * vn; look = 6.5; fovT = 58 + 15 * vn * vn
    }
    fovT += slip * 4 + (drifting ? 2 : 0)
    this.fov = damp(this.fov, fovT, 3, dt)

    const cp = Math.cos(this.pitch)
    const f = this._f.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
    const sideX = Math.cos(this.yaw), sideZ = Math.sin(this.yaw)
    const P = poser.position
    const sh = this.shake.update(dt)
    const swing = this.mode === 'bumper' ? 0 : this.swing
    cam.position.set(
      P.x - f.x * dist + sideX * (swing + sh.x),
      P.y - f.y * dist + height + sh.y,
      P.z - f.z * dist + sideZ * (swing + sh.x),
    )
    if (this.mode === 'bumper') {
      // rigid to the body
      const by = poser.bodyYaw
      cam.position.set(P.x + Math.sin(by) * 0.2, P.y + height, P.z - Math.cos(by) * 0.2)
      this._t.set(P.x + Math.sin(by) * look, P.y + height - 0.3 + Math.sin(this.pitch) * look, P.z - Math.cos(by) * look)
    } else {
      this._t.set(P.x + f.x * look, P.y + f.y * look + 0.95, P.z + f.z * look)
    }
    cam.up.set(0, 1, 0)
    cam.lookAt(this._t)
    cam.rotateZ(this.roll + sh.r)
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov
      cam.updateProjectionMatrix()
    }
  }
}
