// Arcade vehicle simulation in track-relative coordinates (s along the road, x lateral).
// Pure JS, fixed timestep. The OutRun2-style powerslide lives here.
//
// Conventions: +x = right of the road, ψ (psi) = velocity heading relative to the road
// tangent (+ = pointing right), β (beta) = body angle relative to velocity (+ = nose right).
import { clamp, damp, smoothstep, TAU } from '../core/math.js'
import { CURB_W } from '../track/course.js'

export const FSM = { GRIP: 0, ENTRY: 1, DRIFT: 2, RECOVER: 3, SPIN: 4, CRASH: 5 }
export const SURFACE = { ROAD: 0, CURB: 1, OFFROAD: 2 }
const SURFACE_GRIP = [1, 0.92, 0.62]
const G = 9.81
const OFFROAD_VMAX = 31 // ~112 km/h soft cap (equilibrium ≈ 115-120 km/h at full throttle)
const ENTRY_TIME = 0.16
const RECOVER_TIME = 0.38
const CRASH_TIME = 2.3
const SPIN_TIME = 1.15
const DRIFT_MIN_V = 19 // ~68 km/h

export function createCar(def, opts = {}) {
  return {
    def,
    manual: !!opts.manual,
    s: opts.s ?? 0,
    x: opts.x ?? 0,
    v: opts.v ?? 0,
    psi: 0,
    beta: 0,
    betaVel: 0,
    omega: 0,
    // vertical
    airborne: false,
    H: 0, // world height while airborne
    vy: 0,
    yOff: 0, // height above the road surface (for rendering)
    // drivetrain
    gear: 1,
    rpm: def.idle,
    rpmNorm: 0,
    shiftT: 0,
    limiter: false,
    // state machine
    fsm: FSM.GRIP,
    fsmT: 0,
    driftDir: 0,
    brakeTapT: 99,
    liftT: 99,
    prevBrake: 0,
    prevThrottle: 0,
    prevDrift: false,
    neutralT: 0,
    counterT: 0,
    offroadT: 0,
    spinDir: 1,
    ghostT: 0, // traffic-collision immunity after a respawn
    // outputs for rendering / audio / scoring
    surface: SURFACE.ROAD,
    latAcc: 0,
    longAcc: 0,
    steerAngle: 0,
    throttle: 0,
    brake: 0,
    slip: 0, // slipstream meter 0..1
    slipActive: false,
    driftTime: 0,
    driftScore: 0, // accumulated during current drift
    distance: 0,
    events: [],
    crashes: 0,
  }
}

const FR = {}
const FR2 = {}

/**
 * Advance one fixed step.
 * @param car     state from createCar
 * @param input   { steer, throttle, brake, drift, shiftUp, shiftDown }
 * @param course  Course
 * @param dt      seconds
 */
export function stepCar(car, input, course, dt) {
  const def = car.def
  const fr = course.sample(car.s, FR)

  // ── surface ─────────────────────────────────────────────────────────────
  const ax = Math.abs(car.x)
  car.surface = ax <= fr.hw ? SURFACE.ROAD : ax <= fr.hw + CURB_W ? SURFACE.CURB : SURFACE.OFFROAD
  const grip = SURFACE_GRIP[car.surface]
  if (car.surface === SURFACE.OFFROAD) car.offroadT += dt
  else car.offroadT = 0

  if (car.ghostT > 0) car.ghostT -= dt

  if (car.fsm === FSM.CRASH) return stepCrash(car, fr, course, dt)
  if (car.fsm === FSM.SPIN) return stepSpin(car, fr, course, dt)

  const steer = clamp(input.steer || 0, -1, 1)
  const throttle = clamp(input.throttle || 0, 0, 1)
  const brake = clamp(input.brake || 0, 0, 1)
  car.throttle = throttle
  car.brake = brake

  // ── input edges ─────────────────────────────────────────────────────────
  car.brakeTapT += dt
  car.liftT += dt
  if (brake > 0.45 && car.prevBrake <= 0.45) car.brakeTapT = 0
  const driftBtn = !!input.drift
  if (driftBtn && !car.prevDrift) car.brakeTapT = 0 // drift button behaves like a brake tap without braking
  if (throttle < 0.2 && car.prevThrottle >= 0.2) car.liftT = 0
  const throttleRepress = throttle > 0.7 && car.prevThrottle <= 0.7 && car.liftT < 0.3
  car.prevBrake = brake
  car.prevThrottle = throttle
  car.prevDrift = driftBtn

  // ── gearbox ─────────────────────────────────────────────────────────────
  const gearEff = stepGearbox(car, input, dt)

  // ── longitudinal ────────────────────────────────────────────────────────
  const v = car.v
  const slipBoost = car.slipActive ? 1 : 0
  const vmax = def.vmax * (1 + 0.06 * slipBoost)
  const shiftCut = car.shiftT > 0 ? 0.25 : 1
  let drive = throttle * def.a0 * (1 + 0.2 * slipBoost) * Math.max(0, 1 - Math.pow(v / vmax, 1.6)) * gearEff * shiftCut
  if (car.airborne) drive *= 0.2
  const drifting = car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY
  const brakeA = brake * def.aBrake * (drifting ? 0.6 : 1) * (car.airborne ? 0 : 1)
  const coast = 0.35 + 2.6 * (v / def.vmax) * (v / def.vmax) * (1 - 0.7 * throttle)
  let a = drive - (v > 0.05 ? brakeA + coast : 0)
  if (car.surface === SURFACE.OFFROAD && v > OFFROAD_VMAX) a -= (v - OFFROAD_VMAX) * 2.0
  if (car.surface === SURFACE.OFFROAD) a -= 2.0 * throttle
  car.v = Math.max(0, v + a * dt)
  if (drifting) car.v -= def.driftDrag * Math.abs(Math.sin(car.beta)) * car.v * dt
  car.longAcc = a

  // ── drift triggers ──────────────────────────────────────────────────────
  const canDrift = car.v > DRIFT_MIN_V && !car.airborne && car.surface !== SURFACE.OFFROAD
  if ((car.fsm === FSM.GRIP || car.fsm === FSM.RECOVER) && canDrift) {
    const tap = car.brakeTapT < 0.25 && Math.abs(steer) > 0.3
    const lift = throttleRepress && Math.abs(steer) > 0.6 && car.v > 28
    if (tap || lift) enterDrift(car, steer > 0 ? 1 : -1)
  }

  // ── lateral ─────────────────────────────────────────────────────────────
  const vSafe = Math.max(car.v, 1)
  if (car.fsm === FSM.ENTRY || car.fsm === FSM.DRIFT) {
    car.fsmT += dt
    const dir = car.driftDir
    const u = steer * dir // +: steering into the slide, -: counter-steer
    const turn = u >= 0 ? 0.42 + 0.58 * u : 0.42 + 0.62 * u
    const latD = def.aLatDrift * grip
    const wTarget = (dir * latD * turn) / Math.max(car.v, 8)
    car.omega = damp(car.omega, wTarget, car.fsm === FSM.ENTRY ? 12 : 7, dt)
    let bT = u >= 0 ? dir * (def.betaMin + (def.betaMax - def.betaMin) * u) : dir * def.betaMin * (1 + u)
    bT += dir * 0.05 * (1 - throttle) + dir * 0.04 * brake
    if (car.fsm === FSM.ENTRY) {
      car.beta = damp(car.beta, dir * def.betaMin * 1.35, def.kBeta * 2.2, dt)
      if (car.fsmT >= ENTRY_TIME) { car.fsm = FSM.DRIFT; car.fsmT = 0 }
    } else {
      car.beta = damp(car.beta, bT, def.kBeta, dt)
    }
    car.driftTime += dt
    car.driftScore += car.v * Math.abs(car.beta) * dt
    // exit conditions
    car.neutralT = Math.abs(steer) < 0.12 ? car.neutralT + dt : 0
    car.counterT = u < -0.45 ? car.counterT + dt : 0
    if (
      car.fsm === FSM.DRIFT &&
      (car.neutralT > 0.55 || car.counterT > 0.22 || car.v < 15 || car.offroadT > 0.35 || car.airborne)
    ) {
      exitDrift(car)
    }
  } else {
    // GRIP / RECOVER
    const latMax = def.aLatMax * grip
    // yaw rate limited by steering geometry at low speed and by grip at high speed
    const wGeom = (car.v * def.steerLock * Math.abs(steer)) / def.wheelbase
    const wGrip = latMax / vSafe
    const authority = smoothstep(0, 6, car.v)
    const wTarget = Math.sign(steer) * Math.min(wGeom, wGrip * Math.min(1, Math.abs(steer) * 1.12)) * authority
    car.omega = damp(car.omega, wTarget, 9, dt)
    if (car.fsm === FSM.RECOVER) {
      car.fsmT += dt
      // underdamped spring back to straight (one wobble)
      const w = 13, z = 0.42
      car.betaVel += (-w * w * car.beta - 2 * z * w * car.betaVel) * dt
      car.beta += car.betaVel * dt
      if (car.fsmT > RECOVER_TIME) { car.fsm = FSM.GRIP; car.fsmT = 0 }
    } else {
      // tiny visual slip under hard cornering keeps grip driving alive
      const bT = clamp((car.omega * car.v) / def.aLatMax, -1, 1) * 0.045
      car.beta = damp(car.beta, bT, 8, dt)
      car.betaVel = 0
    }
    // gentle arcade road-alignment assist when not steering
    if (Math.abs(steer) < 0.08 && !car.airborne) car.psi = damp(car.psi, 0, 0.45, dt)
  }
  if (car.airborne) car.omega *= 1 - 2.5 * dt

  // ── kinematics in road frame ────────────────────────────────────────────
  integrateRoad(car, fr, dt)

  // ── vertical: crests / airtime ──────────────────────────────────────────
  stepVertical(car, fr, course, dt)

  car.latAcc = car.omega * car.v
  car.steerAngle = damp(car.steerAngle, steer * def.steerLock * (0.35 + 0.65 / (1 + car.v / 25)) - (drifting ? 0.7 * car.beta : 0), 14, dt)
  return car
}

function integrateRoad(car, fr, dt) {
  const k = fr.k
  const denom = Math.max(0.2, 1 - k * car.x)
  const sdot = (car.v * Math.cos(car.psi)) / denom
  const xdot = car.v * Math.sin(car.psi)
  car.psi += (car.omega - k * sdot) * dt
  car.psi = clamp(car.psi, -1.25, 1.25)
  car.s += sdot * dt
  car.x += xdot * dt
  car.distance += Math.max(0, sdot * dt)
}

export function enterDrift(car, dir) {
  car.fsm = FSM.ENTRY
  car.fsmT = 0
  car.driftDir = dir
  car.v *= 0.975
  car.brakeTapT = 99
  car.neutralT = 0
  car.counterT = 0
  car.driftTime = 0
  car.driftScore = 0
  car.events.push({ type: 'driftStart', dir })
}

export function exitDrift(car) {
  if (car.fsm !== FSM.DRIFT && car.fsm !== FSM.ENTRY) return
  car.events.push({ type: 'driftEnd', score: car.driftScore, time: car.driftTime })
  car.fsm = FSM.RECOVER
  car.fsmT = 0
  car.betaVel = 0
  car.driftDir = 0
}

function stepGearbox(car, input, dt) {
  const def = car.def
  const gears = def.gears
  if (car.shiftT > 0) car.shiftT -= dt
  const topFor = (g) => def.vmax * gears[g - 1]
  let rn = car.v / topFor(car.gear)
  if (car.manual) {
    if (input.shiftUp && car.gear < gears.length) shift(car, +1)
    if (input.shiftDown && car.gear > 1) {
      // refuse a downshift that would over-rev badly
      if (car.v / topFor(car.gear - 1) < 1.08) shift(car, -1)
    }
  } else if (car.shiftT <= 0) {
    if (rn > 0.95 && car.gear < gears.length && car.throttle > 0.1) shift(car, +1)
    else if (car.gear > 1 && car.v / topFor(car.gear - 1) < 0.78 && rn < 0.52) shift(car, -1)
  }
  rn = car.v / topFor(car.gear)
  if (car.gear === 1) rn = Math.max(rn, 0.34 * car.throttle) // launch clutch slip
  car.rpmNorm = clamp(rn, 0, 1.06)
  car.limiter = rn >= 1
  const target = def.idle + (def.redline - def.idle) * clamp(rn, 0.0, 1.04)
  car.limT = (car.limT || 0) + dt
  car.rpm = damp(car.rpm, car.limiter ? def.redline * (0.965 + 0.035 * Math.sin(car.limT * 55)) : target, 18, dt)
  // torque curve
  if (rn >= 1.0) return car.gear === gears.length ? 0.15 : 0
  return 0.58 + 0.42 * smoothstep(0.08, 0.62, rn) - 0.12 * smoothstep(0.88, 1.0, rn)
}

function shift(car, d) {
  car.gear += d
  car.shiftT = 0.12
  car.events.push({ type: 'shift', dir: d, gear: car.gear })
}

function stepVertical(car, fr, course, dt) {
  const surfY = fr.y + fr.ny * car.x
  if (!car.airborne) {
    // vertical curvature from pitch change
    const a = course.sample(car.s + 3, FR2).pitch
    const b = course.sample(car.s - 3, FR2).pitch
    const kv = (a - b) / 6
    if (car.v * car.v * -kv > G * 1.08 && car.v > 30) {
      car.airborne = true
      car.H = surfY
      car.vy = car.v * Math.sin(fr.pitch)
      car.events.push({ type: 'takeoff' })
    } else {
      car.yOff = 0
      car.H = surfY
      return
    }
  }
  car.vy -= G * dt
  car.H += car.vy * dt
  car.yOff = car.H - surfY
  if (car.yOff <= 0) {
    const impact = Math.max(0, car.v * Math.sin(fr.pitch) - car.vy)
    car.airborne = false
    car.yOff = 0
    car.H = surfY
    car.events.push({ type: 'land', impact })
  }
}

// ── scripted states ─────────────────────────────────────────────────────────

export function startCrash(car) {
  if (car.fsm === FSM.CRASH) return
  if (car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY) car.events.push({ type: 'driftEnd', score: 0, time: 0, broken: true })
  car.fsm = FSM.CRASH
  car.fsmT = 0
  car.crashV = car.v
  car.crashDir = car.x >= 0 ? 1 : -1
  car.crashes++
  car.events.push({ type: 'crash', v: car.v })
}

export function startSpin(car, dir) {
  if (car.fsm === FSM.CRASH || car.fsm === FSM.SPIN) return
  if (car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY) car.events.push({ type: 'driftEnd', score: 0, time: 0, broken: true })
  car.fsm = FSM.SPIN
  car.fsmT = 0
  car.spinDir = dir || 1
  car.spinBeta0 = car.beta
  car.events.push({ type: 'spin' })
}

function stepCrash(car, fr, course, dt) {
  car.fsmT += dt
  car.v = Math.max(0, car.v - 22 * dt)
  car.omega = 0
  integrateRoad(car, fr, dt)
  car.x = clamp(car.x, fr.wallL + 1.2, fr.wallR - 1.2)
  car.yOff = 0
  car.airborne = false
  if (car.fsmT >= CRASH_TIME) respawn(car, course)
  return car
}

function stepSpin(car, fr, course, dt) {
  car.fsmT += dt
  const t = car.fsmT / SPIN_TIME
  car.v = Math.max(0, car.v - car.v * 0.55 * dt / SPIN_TIME * 1.6)
  car.beta = car.spinBeta0 + car.spinDir * TAU * easeOutCubic(Math.min(1, t))
  car.psi = damp(car.psi, 0, 2, dt)
  car.omega = 0
  integrateRoad(car, fr, dt)
  if (t >= 1) {
    car.beta = 0
    car.betaVel = 0
    car.fsm = FSM.GRIP
    car.fsmT = 0
  }
  return car
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

export function respawn(car, course) {
  const fr = course.sample(car.s, FR)
  const lanes = fr.lanes
  // nearest lane centre
  let best = 0, bestD = 1e9
  for (let j = 0; j < lanes; j++) {
    const lx = course.laneX(fr.hw, j)
    const d = Math.abs(lx - car.x)
    if (d < bestD) { bestD = d; best = lx }
  }
  car.x = best
  car.psi = 0
  car.beta = 0
  car.betaVel = 0
  car.omega = 0
  car.v = 0
  car.gear = 1
  car.fsm = FSM.GRIP
  car.fsmT = 0
  car.ghostT = 2.5
  car.events.push({ type: 'respawn' })
}
