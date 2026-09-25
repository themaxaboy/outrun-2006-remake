// Turns the track-relative simulation state into a world transform for rendering:
// interpolated between sim steps, with visual-only body roll/pitch springs and the crash tumble.
import * as THREE from 'three'
import { lerp, lerpAngle, clamp, damp } from '../core/math.js'
import { FSM } from './sim.js'

const FR = {}
const mBasis = new THREE.Matrix4()
const qRoad = new THREE.Quaternion()
const qYaw = new THREE.Quaternion()
const qBody = new THREE.Quaternion()
const vN = new THREE.Vector3()
const vU = new THREE.Vector3()
const vB = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)
const eBody = new THREE.Euler(0, 0, 0, 'ZXY')

export function snapshot(car, course, out = {}) {
  out.course = course
  out.s = car.s
  out.x = car.x
  out.psi = car.psi
  out.beta = car.beta
  out.yOff = car.yOff
  return out
}

export class CarPoser {
  constructor() {
    this.roll = 0
    this.pitch = 0
    this.frame = {}
    this.velYaw = 0 // world yaw of the velocity vector
    this.bodyYaw = 0
    this.position = new THREE.Vector3()
    this.quaternion = new THREE.Quaternion()
    this.up = new THREE.Vector3(0, 1, 0)
    this.pitchRoad = 0
    this.bank = 0
  }

  update(car, course, prev, alpha, dt) {
    let s = car.s, x = car.x, psi = car.psi, beta = car.beta, yOff = car.yOff
    if (prev && prev.course === course) {
      s = lerp(prev.s, car.s, alpha)
      x = lerp(prev.x, car.x, alpha)
      psi = lerpAngle(prev.psi, car.psi, alpha)
      beta = lerpAngle(prev.beta, car.beta, alpha)
      yOff = lerp(prev.yOff, car.yOff, alpha)
    }
    const fr = course.sample(s, this.frame)
    this.pitchRoad = fr.pitch
    this.bank = fr.bank

    // visual springs
    const rollT = clamp(-car.latAcc * 0.0042, -0.075, 0.075)
    const pitchT = clamp(car.longAcc * 0.0035, -0.035, 0.03)
    this.roll = damp(this.roll, rollT, 7, dt)
    this.pitch = damp(this.pitch, pitchT, 6, dt)

    let lift = 0
    let tumble = 0
    if (car.fsm === FSM.CRASH) {
      const t = car.fsmT / 2.3
      const hop = Math.min(1, t * 1.7)
      lift = Math.sin(Math.PI * hop) * 2.2 * clamp(car.crashV / 40, 0.4, 1.2)
      tumble = car.crashDir * Math.PI * 2 * (1 - Math.pow(1 - hop, 2.2))
    }

    this.position.set(fr.x + fr.nx * x + fr.ux * (yOff + lift), fr.y + fr.ny * x + fr.uy * (yOff + lift), fr.z + fr.nz * x + fr.uz * (yOff + lift))

    // road basis: x→N, y→U, z→-T
    vN.set(fr.nx, fr.ny, fr.nz)
    vU.set(fr.ux, fr.uy, fr.uz)
    vB.set(-fr.tx, -fr.ty, -fr.tz)
    mBasis.makeBasis(vN, vU, vB)
    qRoad.setFromRotationMatrix(mBasis)
    qYaw.setFromAxisAngle(Y, -(psi + beta))
    eBody.set(this.pitch, 0, this.roll + tumble)
    qBody.setFromEuler(eBody)
    this.quaternion.copy(qRoad).multiply(qYaw).multiply(qBody)
    this.up.copy(vU)
    this.velYaw = fr.heading + psi
    this.bodyYaw = fr.heading + psi + beta
    return this
  }
}
