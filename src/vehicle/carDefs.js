// Handling + drivetrain definitions for the four original cars.
// Units: m/s, m/s², radians. Tuned for arcade feel, not realism.
import { DEG } from '../core/math.js'

const base = {
  wheelbase: 2.65,
  halfWidth: 0.98,
  halfLength: 2.25,
  steerLock: 0.55, // max front wheel angle at low speed (rad)
  a0: 9.5, // peak drive accel
  aBrake: 15,
  aLatMax: 12, // grip lateral limit
  aLatDrift: 17.5, // lateral accel available while drifting (tighter than grip — the reward)
  betaMin: 14 * DEG,
  betaMax: 38 * DEG,
  kBeta: 6.5, // drift-angle response (1/s)
  driftDrag: 0.085, // speed bleed ∝ |sin β|
  gears: [0.29, 0.45, 0.6, 0.74, 0.875, 1.02], // fraction of vmax at redline per gear
  idle: 950,
  redline: 8400,
  cylinders: 8,
  engineTone: 1.0,
  unlock: null,
}

export const CARS = [
  {
    ...base,
    id: 'aurora',
    name: 'Aurora GT-R',
    blurb: 'Mid-engine V8 wedge. Balanced and forgiving — the classic choice.',
    vmax: 82, // 295 km/h
    stats: { speed: 4, accel: 4, handling: 4, drift: 4 },
    colors: ['#c8102e', '#f4f4f0', '#0f3d91', '#f2b705', '#111214', '#7fd1c7'],
  },
  {
    ...base,
    id: 'vento',
    name: 'Vento S',
    blurb: 'Lightweight roadster. Sticky grip and easy, snappy slides.',
    vmax: 75, // 270 km/h
    a0: 10.1,
    aLatMax: 13.2,
    aLatDrift: 18.6,
    betaMax: 34 * DEG,
    kBeta: 7.5,
    driftDrag: 0.075,
    wheelbase: 2.45,
    halfLength: 2.05,
    cylinders: 6,
    engineTone: 1.18,
    redline: 8800,
    stats: { speed: 3, accel: 5, handling: 5, drift: 5 },
    colors: ['#f2f2ee', '#e63946', '#2a9d8f', '#ffb703', '#6a4c93', '#1d1d1f'],
  },
  {
    ...base,
    id: 'stradale',
    name: 'Stradale V12',
    blurb: 'Long-hood front-engine GT. Huge top end, long lazy drifts.',
    vmax: 86, // 310 km/h
    a0: 8.9,
    aLatMax: 11.4,
    aLatDrift: 16.6,
    betaMin: 16 * DEG,
    betaMax: 42 * DEG,
    kBeta: 5.4,
    driftDrag: 0.095,
    wheelbase: 2.8,
    halfLength: 2.38,
    cylinders: 12,
    engineTone: 0.86,
    redline: 8000,
    stats: { speed: 5, accel: 3, handling: 3, drift: 4 },
    colors: ['#8a0f1b', '#1b2a41', '#c0c0c4', '#f7f3e3', '#2d6a4f', '#0a0a0a'],
  },
  {
    ...base,
    id: 'nebula',
    name: 'Nebula X',
    blurb: 'Hybrid hypercar with a towering wing. Unlocked by reaching any goal.',
    vmax: 89, // 320 km/h
    a0: 10.4,
    aLatMax: 12.6,
    aLatDrift: 18.2,
    kBeta: 6.8,
    driftDrag: 0.08,
    cylinders: 8,
    engineTone: 1.08,
    redline: 9200,
    stats: { speed: 5, accel: 5, handling: 4, drift: 4 },
    colors: ['#101820', '#e8e8e8', '#ff6b00', '#5b2a86', '#00a6a6', '#b5a642'],
    unlock: 'anyGoal',
  },
]

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0]
}
