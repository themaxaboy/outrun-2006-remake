import { describe, it, expect } from 'vitest'
import { createCar, stepCar, FSM, SURFACE } from '../../src/vehicle/sim.js'
import { collideWalls, collideTraffic } from '../../src/vehicle/collisions.js'
import { getCar } from '../../src/vehicle/carDefs.js'
import { Course } from '../../src/track/course.js'
import { Channel } from '../../src/track/roadgen.js'

const DT = 1 / 120

/** A synthetic straight or constant-curvature test road. */
function testCourse({ k = 0, length = 20000, hw = 7.2, barriers = true } = {}) {
  const program = {
    stageId: 't', length, entry: 'start', goal: true,
    k: new Channel(k), g: new Channel(0), hw: new Channel(hw),
    barL: [{ s: 0, on: barriers }], barR: [{ s: 0, on: barriers }],
  }
  return new Course({ id: 't', biome: 'coast', tod: 'noon', weather: 'clear', length }, program, { x: 0, y: 10, z: 0, heading: 0 })
}

function run(car, course, seconds, input) {
  const n = Math.round(seconds / DT)
  for (let i = 0; i < n; i++) {
    const inp = typeof input === 'function' ? input(i * DT, car) : input
    stepCar(car, inp, course, DT)
    collideWalls(car, course)
  }
}

const IN = (o = {}) => ({ steer: 0, throttle: 0, brake: 0, drift: false, shiftUp: false, shiftDown: false, ...o })

describe('vehicle sim', () => {
  const def = getCar('aurora')

  it('accelerates 0-100 km/h in roughly 3-5.5 s and approaches top speed', () => {
    const c = testCourse()
    const car = createCar(def)
    let t100 = null
    run(car, c, 40, (t, car) => {
      if (t100 === null && car.v * 3.6 >= 100) t100 = t
      return IN({ throttle: 1 })
    })
    expect(t100).toBeGreaterThan(2.8)
    expect(t100).toBeLessThan(5.5)
    expect(car.v).toBeGreaterThan(def.vmax * 0.9)
    expect(car.v).toBeLessThan(def.vmax * 1.03)
    expect(car.gear).toBe(6)
  })

  it('brake tap + steer enters a drift quickly', () => {
    const c = testCourse({ k: 1 / 400 })
    const car = createCar(def, { v: 60 })
    let entered = null
    run(car, c, 1.0, (t, car) => {
      if (entered === null && (car.fsm === FSM.ENTRY || car.fsm === FSM.DRIFT)) entered = t
      return IN({ throttle: 1, steer: 1, brake: t < 0.12 ? 1 : 0 })
    })
    expect(entered).not.toBeNull()
    expect(entered).toBeLessThan(0.25)
    expect(car.fsm).toBe(FSM.DRIFT)
    expect(car.beta).toBeGreaterThan(0.2) // nose into the right-hand bend
  })

  it('keeps ≥ 90% of its speed through a 2 s full-throttle drift', () => {
    const c = testCourse({ k: 1 / 350, hw: 30, barriers: false })
    const car = createCar(def, { v: 69 })
    car.gear = 5
    const v0 = car.v
    run(car, c, 2.2, (t) => IN({ throttle: 1, steer: 0.7, brake: t < 0.1 ? 1 : 0 }))
    expect(car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY).toBe(true)
    expect(car.v / v0).toBeGreaterThan(0.9)
  })

  it('drifting turns tighter than grip at the same speed', () => {
    const grip = createCar(def, { v: 60 })
    const drift = createCar(def, { v: 60 })
    const c1 = testCourse({ hw: 200, barriers: false })
    const c2 = testCourse({ hw: 200, barriers: false })
    run(grip, c1, 1.5, IN({ throttle: 1, steer: 1 }))
    run(drift, c2, 1.5, (t) => IN({ throttle: 1, steer: 1, brake: t < 0.1 ? 1 : 0 }))
    expect(drift.x).toBeGreaterThan(grip.x)
  })

  it('counter-steer exits the drift and recovers to grip', () => {
    const c = testCourse({ k: 1 / 400, hw: 30, barriers: false })
    const car = createCar(def, { v: 60 })
    run(car, c, 0.8, (t) => IN({ throttle: 1, steer: 1, brake: t < 0.1 ? 1 : 0 }))
    expect(car.fsm).toBe(FSM.DRIFT)
    run(car, c, 1.2, IN({ throttle: 1, steer: -1 }))
    expect(car.fsm).toBe(FSM.GRIP)
    expect(Math.abs(car.beta)).toBeLessThan(0.08)
  })

  it('does not drift below the minimum speed', () => {
    const c = testCourse()
    const car = createCar(def, { v: 12 })
    run(car, c, 0.5, (t) => IN({ throttle: 1, steer: 1, brake: t < 0.1 ? 1 : 0 }))
    expect(car.fsm).toBe(FSM.GRIP)
  })

  it('off-road speed converges to ≤ ~125 km/h', () => {
    const c = testCourse({ hw: 3, barriers: false })
    const car = createCar(def, { v: 80, x: 12 })
    car.gear = 6
    run(car, c, 6, IN({ throttle: 1 }))
    expect(car.surface).toBe(SURFACE.OFFROAD)
    expect(car.v * 3.6).toBeLessThan(126)
  })

  it('barrier hits keep the car inside the wall and point it back to the road', () => {
    const c = testCourse({ hw: 7.2 })
    const car = createCar(def, { v: 70 })
    car.psi = 0.25
    run(car, c, 1.5, IN({ throttle: 1 }))
    const fr = c.sample(car.s)
    expect(car.x).toBeLessThanOrEqual(fr.wallR)
    expect(car.psi).toBeLessThanOrEqual(0.01)
    expect(car.v).toBeGreaterThan(40) // bounced, not stopped
  })

  it('rear-ending traffic never pushes the player below the traffic speed - 3 m/s', () => {
    const c = testCourse()
    const car = createCar(def, { v: 60 })
    const t = { active: true, s: car.s + 3, x: 0, v: 30, halfL: 2.3, halfW: 0.95, knock: 0 }
    const hit = collideTraffic(car, [t])
    expect(hit).toBe(t)
    expect(car.v).toBeGreaterThanOrEqual(30 - 3 - 3.1)
    expect(t.v).toBeGreaterThan(30)
  })

  it('is deterministic', () => {
    const go = () => {
      const c = testCourse({ k: 1 / 500, hw: 20 })
      const car = createCar(def, { v: 40 })
      run(car, c, 5, (t) => IN({ throttle: 1, steer: Math.sin(t * 2), brake: t % 1.3 < 0.1 ? 1 : 0 }))
      return [car.s, car.x, car.v, car.beta]
    }
    expect(go()).toEqual(go())
  })
})
