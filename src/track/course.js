// A stage's road, sampled every DS metres in world space. Pure JS (no three.js) so the
// simulation and tests can run in Node. Every system (sim, traffic, chunks, camera) reads
// the road through sample()/world().
import { DEG, clamp } from '../core/math.js'
import { BRANCH_ZONE, LANE_W } from './roadgen.js'

export const DS = 2
export const CURB_W = 0.9 // rumble strip width beyond the road edge
export const BARRIER_GAP = 2.4 // road edge → barrier face
export const OFFROAD_LIMIT = 26 // road edge → soft wall when there is no barrier
const BANK_MAX = 6 * DEG
const BANK_K = 0.0062 * 70 * 70 // bank = k·BANK_K (radians), design speed ~70 m/s

let uidCounter = 1

export class Course {
  /**
   * @param {object} stage   stage def
   * @param {object} program from generateProgram
   * @param {object} start   { x, y, z, heading }
   */
  constructor(stage, program, start) {
    this.uid = uidCounter++
    this.stage = stage
    this.program = program
    this.entry = program.entry
    this.length = program.length
    this.goal = program.goal
    this.start = { ...start }
    this.D0 = 0 // route distance at s=0 (set by the route manager)
    this.parent = null
    this.children = null // [L, R] Course instances once generated
    this.innerSide = program.entry === 'L' ? 1 : program.entry === 'R' ? -1 : 0

    const n = Math.ceil(this.length / DS) + 2
    this.n = n
    this.px = new Float64Array(n)
    this.py = new Float64Array(n)
    this.pz = new Float64Array(n)
    this.hd = new Float32Array(n) // heading (rad)
    this.pt = new Float32Array(n) // pitch (rad)
    this.bk = new Float32Array(n) // bank (rad)
    this.kp = new Float32Array(n) // curvature (1/m)
    this.hw = new Float32Array(n) // road half width (m)
    this.bits = new Uint8Array(n) // bit0 barrier L, bit1 barrier R
    this.lat = new Float32Array(n) // lateral displacement from entry axis (branch separation)
    this._integrate()
  }

  _integrate() {
    const { program, n } = this
    const rk = program.k.reader()
    const rg = program.g.reader()
    const rh = program.hw.reader()
    const k = this.kp, grade = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const s = i * DS
      k[i] = rk(s)
      grade[i] = rg(s)
      this.hw[i] = rh(s)
    }
    // barriers
    let bi = 0, bj = 0
    const bl = program.barL, br = program.barR
    for (let i = 0; i < n; i++) {
      const s = i * DS
      while (bi + 1 < bl.length && s >= bl[bi + 1].s) bi++
      while (bj + 1 < br.length && s >= br[bj + 1].s) bj++
      this.bits[i] = (bl[bi].on ? 1 : 0) | (br[bj].on ? 2 : 0)
    }
    // integrate position
    let x = this.start.x, y = this.start.y, z = this.start.z, h = this.start.heading
    const nx0 = Math.cos(h), nz0 = Math.sin(h)
    for (let i = 0; i < n; i++) {
      this.px[i] = x; this.py[i] = y; this.pz[i] = z
      this.hd[i] = h
      this.pt[i] = Math.atan(grade[i])
      this.bk[i] = clamp(k[i] * BANK_K, -BANK_MAX, BANK_MAX)
      this.lat[i] = (x - this.start.x) * nx0 + (z - this.start.z) * nz0
      const kMid = i + 1 < n ? 0.5 * (k[i] + k[i + 1]) : k[i]
      const gMid = i + 1 < n ? 0.5 * (grade[i] + grade[i + 1]) : grade[i]
      const hMid = h + kMid * DS * 0.5
      const horiz = DS / Math.sqrt(1 + gMid * gMid)
      x += Math.sin(hMid) * horiz
      z -= Math.cos(hMid) * horiz
      y += gMid * horiz
      h += kMid * DS
    }
  }

  /** Fill `o` with the interpolated road frame at arc length s. Returns o. */
  sample(s, o = {}) {
    const f = clamp(s / DS, 0, this.n - 1.0001)
    const i = f | 0
    const t = f - i
    const j = i + 1
    const lerp = (a) => a[i] + (a[j] - a[i]) * t
    o.s = s
    o.x = lerp(this.px); o.y = lerp(this.py); o.z = lerp(this.pz)
    const h = lerp(this.hd), p = lerp(this.pt), b = lerp(this.bk)
    o.heading = h; o.pitch = p; o.bank = b
    o.k = lerp(this.kp)
    o.hw = lerp(this.hw)
    o.grade = Math.tan(p)
    const bits = this.bits[t < 0.5 ? i : j]
    o.barrierL = (bits & 1) !== 0
    o.barrierR = (bits & 2) !== 0
    frameVectors(h, p, b, o)
    // lateral limits (car centre can't pass these)
    o.wallL = -(o.hw + (o.barrierL ? CURB_W + BARRIER_GAP : OFFROAD_LIMIT))
    o.wallR = o.hw + (o.barrierR ? CURB_W + BARRIER_GAP : OFFROAD_LIMIT)
    o.lanes = Math.max(1, Math.round((2 * o.hw) / LANE_W))
    return o
  }

  /** World position of road-relative point (s, x lateral, y up). */
  world(s, x, y, out = {}, fr = this._fr || (this._fr = {})) {
    this.sample(s, fr)
    out.x = fr.x + fr.nx * x + fr.ux * y
    out.y = fr.y + fr.ny * x + fr.uy * y
    out.z = fr.z + fr.nz * x + fr.uz * y
    return out
  }

  /** Road surface height at lateral x (world y) */
  surfaceY(fr, x) { return fr.y + fr.ny * x }

  /** Separation between this branch's inner edge and its sibling's (fork wedge), Infinity if n/a. */
  wedgeHalfGap(s) {
    if (!this.innerSide || s > BRANCH_ZONE + 400) return Infinity
    const f = clamp(s / DS, 0, this.n - 1.0001)
    const i = f | 0
    return Math.abs(this.lat[i] + (this.lat[i + 1] - this.lat[i]) * (f - i))
  }

  endPose() {
    const i = this.n - 1
    const s = (this.n - 1) * DS
    const fr = this.sample(Math.min(s, this.length))
    return { x: fr.x, y: fr.y, z: fr.z, heading: fr.heading, nx: fr.nx, nz: fr.nz, s, i }
  }

  /** Lane centre (lateral offset) for lane j, counted from the left edge. */
  laneX(hw, j) { return -hw + LANE_W * (j + 0.5) }
}

/** T (forward), N (right), U (up) for heading h, pitch p, bank b. heading 0 = -Z. */
export function frameVectors(h, p, b, o) {
  const ch = Math.cos(h), sh = Math.sin(h), cp = Math.cos(p), sp = Math.sin(p)
  const tx = sh * cp, ty = sp, tz = -ch * cp
  const n0x = ch, n0y = 0, n0z = sh
  const u0x = -sh * sp, u0y = cp, u0z = ch * sp
  const cb = Math.cos(b), sb = Math.sin(b)
  o.tx = tx; o.ty = ty; o.tz = tz
  o.nx = n0x * cb - u0x * sb; o.ny = n0y * cb - u0y * sb; o.nz = n0z * cb - u0z * sb
  o.ux = u0x * cb + n0x * sb; o.uy = u0y * cb + n0y * sb; o.uz = u0z * cb + n0z * sb
  return o
}
