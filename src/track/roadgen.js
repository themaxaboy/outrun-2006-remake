// Stage seed + biome grammar → a "road program": piecewise channels (curvature, grade,
// half-width, barriers) with linear (clothoid-like) blends. course.js integrates it.
import { RNG, hashSeed } from '../core/rng.js'
import { DEG, clamp } from '../core/math.js'
import { ROAD_STYLES } from './roadStyles.js'
import { isGoalStage } from './pyramid.js'

export const LANE_W = 3.6
export const FORK_ZONE = 700 // parent's final metres: straight, flat, widening to FORK_LANES
export const FORK_LANES = 8
export const BRANCH_LANES = 4
export const BRANCH_ZONE = 760 // child's first metres: mirrored S-bend, flat
export const GOAL_ZONE = 450
export const START_ZONE = 420
export const BRANCH_R = 520

/** Piecewise channel. Each key blends linearly from the previous value over [s, e]. Keys must be added in order of s. */
export class Channel {
  constructor(v0) {
    this.keys = [{ s: -1, e: -1, v: v0 }]
  }
  set(s, blend, v) {
    this.keys.push({ s, e: s + Math.max(blend, 1e-3), v })
    return this
  }
  /** Sequential evaluator (O(1) amortised for non-decreasing s). */
  reader() {
    const keys = this.keys
    let i = 0
    let startV = keys[0].v // channel value at the moment key i started blending
    const evalKey = (s) => {
      const k = keys[i]
      if (i === 0 || s >= k.e) return k.v
      const t = (s - k.s) / (k.e - k.s)
      return startV + (k.v - startV) * (t < 0 ? 0 : t)
    }
    return (s) => {
      while (i + 1 < keys.length && s >= keys[i + 1].s) {
        startV = evalKey(keys[i + 1].s)
        i++
      }
      return evalKey(s)
    }
  }
}

/**
 * @param {object} stage   stage def from stages.js
 * @param {object} opts    { entry: 'start'|'L'|'R', startElev: number, seed?: string }
 */
export function generateProgram(stage, { entry = 'start', startElev = 12, seed } = {}) {
  const style = ROAD_STYLES[stage.biome]
  const rng = new RNG(hashSeed(seed ?? 'or2r', stage.id, 'road'))
  const L = stage.length
  const goal = isGoalStage(stage.id)
  const endZone = goal ? GOAL_ZONE : FORK_ZONE

  const k = new Channel(0)
  const g = new Channel(0)
  const hw = new Channel(((entry === 'start' ? 5 : BRANCH_LANES) * LANE_W) / 2)
  const barL = [] // [{s, on}]
  const barR = []

  // ── curvature ────────────────────────────────────────────────────────────
  let s = 0
  let h = 0 // approximate heading relative to entry (radians)
  let kPrev = 0
  const addCurve = (at, blend, kv, len) => {
    k.set(at, blend, kv)
    h += (blend * (kPrev + kv)) / 2 + (len - blend) * kv
    kPrev = kv
  }

  if (entry === 'start') {
    s = START_ZONE
  } else {
    // Mirrored S-bend that pulls the two branches apart, then straightens them parallel.
    const d = entry === 'L' ? -1 : 1
    addCurve(0, 90, d / BRANCH_R, 210)
    addCurve(210, 90, 0, 120)
    addCurve(330, 90, -d / BRANCH_R, 210)
    addCurve(540, 90, 0, BRANCH_ZONE - 540)
    s = BRANCH_ZONE
  }

  const curveEnd = L - endZone - 160
  let lastStraight = false
  let pendingS = false
  let prevDir = 0
  while (s < curveEnd - 80) {
    const room = curveEnd - s
    if (!pendingS && !lastStraight && rng.chance(style.pStraight)) {
      const len = Math.min(rng.range(style.straight[0], style.straight[1]), room)
      addCurve(s, clamp(len * 0.4, 60, 140), 0, len)
      s += len
      lastStraight = true
      continue
    }
    let dir
    if (pendingS && prevDir) dir = -prevDir
    else dir = rng.sign()
    if (Math.abs(h) > 0.42 && rng.chance(0.8)) dir = -Math.sign(h)
    if (Math.abs(h) > 0.75) dir = -Math.sign(h)
    const tight = rng.chance(style.tight)
    const R = tight ? rng.range(style.rMin, style.rMin * 1.35) : rng.range(style.rMin * 1.2, style.rMax)
    const turn = rng.range(style.turn[0], style.turn[1]) * DEG
    let len = clamp(turn * R, 110, 950)
    len = Math.min(len, room)
    if (len < 90) break
    const blend = clamp(len * 0.35, 55, 150)
    addCurve(s, blend, dir / R, len)
    s += len
    prevDir = dir
    pendingS = !pendingS && rng.chance(style.pS)
    lastStraight = false
  }
  addCurve(Math.max(s, curveEnd - 80), 150, 0, 150)

  // ── grade ────────────────────────────────────────────────────────────────
  const flatUntil = entry === 'start' ? START_ZONE - 120 : BRANCH_ZONE
  let e = startElev
  let gPrev = 0
  s = flatUntil
  const gradeEnd = L - endZone - 120
  const eMin = style.elev.abs ? style.elev.abs[0] : Math.max(style.elev.min, startElev + style.elev.rel[0])
  const eMax = style.elev.abs ? style.elev.abs[1] : Math.max(eMin + 20, startElev + style.elev.rel[1])
  while (s < gradeEnd - 60) {
    let len = Math.min(rng.range(style.hill[0], style.hill[1]), gradeEnd - s)
    let gt = rng.range(-style.gradeMax, style.gradeMax)
    // keep elevation inside the biome's band (predict where this hill ends)
    const predicted = e + gt * len
    if (predicted < eMin) gt = Math.abs(gt) * 0.6 + style.gradeMax * 0.4
    if (predicted > eMax) gt = -(Math.abs(gt) * 0.6 + style.gradeMax * 0.4)
    const blend = clamp(len * 0.45, 60, 170)
    g.set(s, blend, gt)
    e += (blend * (gPrev + gt)) / 2 + (len - blend) * gt
    gPrev = gt
    s += len
  }
  g.set(Math.max(s, gradeEnd - 60), 200, 0)

  // ── width (lanes) ────────────────────────────────────────────────────────
  s = entry === 'start' ? 600 : BRANCH_ZONE - 300
  const widthEnd = L - endZone
  while (s < widthEnd - 500) {
    const lanes = rng.int(style.lanes[0], style.lanes[1])
    hw.set(s, 180, (lanes * LANE_W) / 2)
    s += rng.range(900, 1700)
  }
  if (!goal) hw.set(L - endZone, 240, (FORK_LANES * LANE_W) / 2)

  // ── barriers ─────────────────────────────────────────────────────────────
  s = 0
  if (entry === 'L') { barL.push({ s: 0, on: rng.chance(0.5) }); barR.push({ s: 0, on: true }) }
  else if (entry === 'R') { barL.push({ s: 0, on: true }); barR.push({ s: 0, on: rng.chance(0.5) }) }
  else { barL.push({ s: 0, on: true }); barR.push({ s: 0, on: true }) }
  s = entry === 'start' ? START_ZONE : BRANCH_ZONE
  while (s < L - endZone) {
    barL.push({ s, on: rng.chance(style.barrier) })
    barR.push({ s, on: rng.chance(style.barrier) })
    s += rng.range(300, 900)
  }
  barL.push({ s: L - endZone, on: true })
  barR.push({ s: L - endZone, on: true })

  return { stageId: stage.id, length: L, entry, goal, k, g, hw, barL, barR, startElev, endZone }
}
