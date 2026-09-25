// Scripted driver for attract mode, benchmarks and e2e tests. Produces the same input
// shape as a human and uses the real drift mechanics (brake-tap entries on tight bends).
import { clamp } from '../core/math.js'
import { FSM } from '../vehicle/sim.js'

const FR = {}

export class Autopilot {
  constructor(route = '') {
    this.route = route.toUpperCase()
    this.state = { steer: 0, throttle: 1, brake: 0, drift: false, shiftUp: false, shiftDown: false }
    this.lane = null
    this.laneT = 0
    this.tapT = 0
  }

  forkSide(course) {
    const row = Number(course.stage.id.split('-')[0])
    const ch = this.route[row]
    return ch === 'R' ? 1 : ch === 'L' ? -1 : ((row * 7 + 3) % 2 ? 1 : -1)
  }

  update(car, course, traffic, dt) {
    const st = this.state
    const def = car.def
    const v = Math.max(car.v, 1)
    const fr = course.sample(car.s, FR)
    this.laneT -= dt

    // lane choice: avoid traffic ahead
    const lanes = fr.lanes
    if (this.lane === null || this.lane >= lanes || this.laneT <= 0) {
      let best = this.lane ?? Math.floor(lanes / 2), bestScore = -1e9
      for (let j = 0; j < lanes; j++) {
        const lx = course.laneX(fr.hw, j)
        let score = -Math.abs(lx - car.x) * 0.4 - Math.abs(lx) * 0.15
        if (traffic) {
          for (const t of traffic) {
            if (!t.active || t.course !== course) continue
            const ds = t.s - car.s
            if (ds > -6 && ds < 90 + v && Math.abs(t.x - lx) < 2.6) score -= 60 * (1 - ds / (100 + v))
          }
        }
        if (score > bestScore) { bestScore = score; best = j }
      }
      this.lane = best
      this.laneT = 0.35
    }
    let xt = course.laneX(fr.hw, this.lane)
    // fork: head for the chosen side well before the split
    if (!course.goal && course.length - car.s < 650) {
      const side = this.forkSide(course)
      xt = side * Math.max(3, fr.hw * 0.5)
    }

    // curvature ahead
    const la = 8 + v * 0.55
    let kPeak = 0
    for (let d = 10; d < v * 2.6; d += 12) {
      const k = course.sample(car.s + d, FR).k
      if (Math.abs(k) > Math.abs(kPeak)) kPeak = k
    }
    const need = Math.abs(kPeak) * v * v
    const fa = course.sample(car.s + la, FR)
    const kAhead = fa.k

    // heading control → desired yaw rate
    const psiDes = Math.atan2(xt - car.x, la)
    const wNeed = kAhead * v + 2.2 * (psiDes - car.psi)

    const drifting = car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY
    st.drift = false
    st.brake = 0
    st.throttle = 1
    if (drifting) {
      const dir = car.driftDir
      const turn = (wNeed * v) / (def.aLatDrift * dir)
      const u = turn >= 0.42 ? (turn - 0.42) / 0.58 : (turn - 0.42) / 0.62
      st.steer = clamp(u * dir, -1, 1)
      if (need > def.aLatDrift * 1.05) st.brake = 0.6
    } else {
      st.steer = clamp((wNeed * v) / def.aLatMax, -1, 1)
      this.tapT -= dt
      if (need > def.aLatMax * 0.95 && v > 26 && this.tapT <= 0 && Math.abs(kAhead) > Math.abs(kPeak) * 0.6) {
        // brake-tap + steer into the bend → powerslide
        st.steer = Math.sign(kPeak)
        st.brake = 1
        this.tapT = 1.2
      }
      if (need > def.aLatDrift * 1.1) { st.brake = 1; st.throttle = 0 }
    }
    return st
  }
}
