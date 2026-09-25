// Collision response in road space (s, x). Everything the player can hit is described in
// track-relative coordinates, so there is no tunnelling and responses are easy to tune.
import { clamp } from '../core/math.js'
import { FSM, exitDrift, startCrash, startSpin } from './sim.js'

const FR = {}

/** Lateral extent of the car body given its yaw relative to the road. */
export function carHalfExtent(car) {
  const th = car.psi + car.beta
  return car.def.halfWidth * Math.abs(Math.cos(th)) + car.def.halfLength * Math.abs(Math.sin(th)) * 0.85
}

export function collideWalls(car, course) {
  if (car.fsm === FSM.CRASH) return
  const fr = course.sample(car.s, FR)
  const ext = carHalfExtent(car)
  const minX = fr.wallL + ext
  const maxX = fr.wallR - ext
  if (car.x > maxX) wallImpact(car, maxX, 1, fr.barrierR)
  else if (car.x < minX) wallImpact(car, minX, -1, fr.barrierL)
}

function wallImpact(car, limit, side, isBarrier) {
  car.x = limit
  const into = car.psi * side
  if (into > 0) {
    const vn = car.v * Math.sin(into)
    car.psi = -0.28 * car.psi
    car.omega *= 0.3
    car.v *= clamp(1 - 0.5 * Math.sin(into) - 0.015, 0.45, 1)
    if (vn > 1.2) {
      car.events.push({ type: 'wall', side, vn, barrier: isBarrier })
      if (car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY) exitDrift(car)
    }
  } else {
    // sliding along the barrier
    car.events.push({ type: 'scrape', side })
  }
}

/**
 * Solid roadside objects (trees, rocks, signs, pillars).
 * @param props array of { s, x, r } in the same course's coordinates
 */
export function collideProps(car, props) {
  if (car.fsm === FSM.CRASH || !props) return
  const hl = car.def.halfLength
  const hw = carHalfExtent(car)
  for (let i = 0; i < props.length; i++) {
    const p = props[i]
    const ds = p.s - car.s
    if (ds > hl + p.r || ds < -hl - p.r) continue
    const dx = p.x - car.x
    const ex = hw + p.r
    const es = hl + p.r
    if ((ds * ds) / (es * es) + (dx * dx) / (ex * ex) >= 1) continue
    if (car.v > 24) {
      startCrash(car)
    } else {
      car.v *= 0.35
      car.x -= Math.sign(dx || 1) * 0.6
      car.psi = -car.psi * 0.3
      car.events.push({ type: 'bump', vn: car.v })
    }
    return
  }
}

/**
 * Traffic cars: { s, x, v, halfL, halfW, knock } on the same course.
 * Returns the vehicle hit (if any) so the traffic system can react.
 */
export function collideTraffic(car, traffic) {
  if (car.fsm === FSM.CRASH || car.ghostT > 0 || !traffic) return null
  const hl = car.def.halfLength
  const hw = carHalfExtent(car)
  for (let i = 0; i < traffic.length; i++) {
    const t = traffic[i]
    if (!t.active) continue
    const ds = t.s - car.s
    const dx = t.x - car.x
    const os = hl + t.halfL - Math.abs(ds)
    const ox = hw + t.halfW - Math.abs(dx)
    if (os <= 0 || ox <= 0) continue
    const dv = car.v - t.v
    if (os < ox * 1.6 && ds > 0 && dv > 0) {
      // rear-end: player hits the car in front
      const offset = Math.abs(dx) / (hw + t.halfW)
      if (dv > 32 && offset < 0.55) startCrash(car)
      else if (dv > 17) startSpin(car, dx > 0 ? -1 : 1)
      car.v = Math.max(0, t.v - 2 - dv * 0.1)
      car.s = t.s - hl - t.halfL - 0.05
      t.v += dv * 0.35
      t.knock = Math.min(1, t.knock + dv / 25)
      t.knockDir = dx > 0 ? 1 : -1
      car.events.push({ type: 'hit', dv, kind: 'rear' })
    } else if (os < ox * 1.6 && ds < 0 && dv < 0) {
      // traffic car rear-ends the player (rare: player much slower)
      t.v = Math.max(0, car.v - 1)
      t.s = car.s - hl - t.halfL - 0.05
      car.events.push({ type: 'hit', dv: -dv, kind: 'bumped' })
    } else {
      // side swipe: push apart laterally
      const side = dx > 0 ? -1 : 1
      car.x += side * ox * 0.9
      t.x -= side * ox * 0.3
      const into = car.psi * -side
      if (into < 0) car.psi *= -0.3
      car.v *= 0.965
      t.knock = Math.min(1, t.knock + 0.25)
      t.knockDir = -side
      if (car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY) exitDrift(car)
      car.events.push({ type: 'hit', dv: Math.abs(dv), kind: 'side' })
    }
    return t
  }
  return null
}
