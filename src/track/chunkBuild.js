// Pure geometry builders for a 200 m road chunk: road ribbon, terrain strips, barriers and
// prop placements. Output goes into caller-owned typed arrays (pooled, no allocation churn).
// Positions are chunk-local (relative to `o`) to keep float32 precision high.
import { DS, CURB_W, BARRIER_GAP } from './course.js'
import { TERRAIN_COLS, TERRAIN_EDGE, terrainHeight, terrainColor, stripLimit } from '../world/terrain.js'
import { RNG, hashSeed } from '../core/rng.js'
import { smoothstep } from '../core/math.js'
import { BRANCH_ZONE } from './roadgen.js'

export const CHUNK_LEN = 200
export const ROAD_ROWS = CHUNK_LEN / DS + 1
export const ROAD_COLS = 7
export const TER_STEP = 4
export const TER_ROWS = CHUNK_LEN / TER_STEP + 1
export const TER_COLS = TERRAIN_COLS.length
export const TER_VERTS = TER_ROWS * TER_COLS * 2
export const BAR_MAX_VERTS = 5200
export const BAR_MAX_INDEX = 8400

export function chunkCount(course) { return Math.ceil(course.length / CHUNK_LEN) }
export function chunkSpan(course, k) {
  const s0 = k * CHUNK_LEN
  return [s0, Math.min(course.length, s0 + CHUNK_LEN)]
}

const FR = {}
const FR2 = {}

export function chunkOrigin(course, k) {
  const fr = course.sample(k * CHUNK_LEN, FR)
  return { x: fr.x, y: fr.y, z: fr.z }
}

/** Grid index buffer (rows × cols), CCW when viewed from +normal for increasing col = +x. */
export function gridIndex(rows, cols, flip = false, base = 0, out = null, offset = 0) {
  const idx = out || new Uint32Array((rows - 1) * (cols - 1) * 6)
  let p = offset
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c
      const b = a + 1
      const cc = a + cols
      const d = cc + 1
      if (!flip) { idx[p++] = a; idx[p++] = b; idx[p++] = cc; idx[p++] = b; idx[p++] = d; idx[p++] = cc }
      else { idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d }
    }
  }
  return idx
}

// ── road ─────────────────────────────────────────────────────────────────────
/** Returns number of rows written. buf: { pos, nrm, uv, road } */
export function buildRoad(course, k, o, buf) {
  const [s0, s1] = chunkSpan(course, k)
  const rows = Math.min(ROAD_ROWS, Math.ceil((s1 - s0) / DS - 1e-6) + 1)
  const { pos, nrm, uv, road } = buf
  let v = 0
  const L = course.length
  const branch = course.innerSide
  for (let r = 0; r < rows; r++) {
    const s = Math.min(s0 + r * DS, s1)
    const fr = course.sample(s, FR)
    const hw = fr.hw
    const toEnd = course.goal ? 1e4 : L - s
    const median = branch && s < BRANCH_ZONE ? branch : 0
    for (let c = 0; c < ROAD_COLS; c++) {
      let x
      switch (c) {
        case 0: x = -(hw + CURB_W); break
        case 1: x = -hw; break
        case 2: x = -hw * 0.5; break
        case 3: x = 0; break
        case 4: x = hw * 0.5; break
        case 5: x = hw; break
        default: x = hw + CURB_W
      }
      const lift = c === 0 || c === 6 ? 0.025 : 0
      pos[v * 3] = fr.x + fr.nx * x + fr.ux * lift - o.x
      pos[v * 3 + 1] = fr.y + fr.ny * x + fr.uy * lift - o.y
      pos[v * 3 + 2] = fr.z + fr.nz * x + fr.uz * lift - o.z
      nrm[v * 3] = fr.ux; nrm[v * 3 + 1] = fr.uy; nrm[v * 3 + 2] = fr.uz
      uv[v * 2] = x
      uv[v * 2 + 1] = s
      road[v * 3] = hw
      road[v * 3 + 1] = Math.min(toEnd, 9999)
      road[v * 3 + 2] = median
      v++
    }
  }
  return rows
}

// ── terrain ──────────────────────────────────────────────────────────────────
const H = new Float32Array(TER_ROWS * TER_COLS)
const WX = new Float32Array(TER_ROWS * TER_COLS)
const WZ = new Float32Array(TER_ROWS * TER_COLS)
const DD = new Float32Array(TER_ROWS * TER_COLS)
const RY = new Float32Array(TER_ROWS)
const COL = [0, 0, 0]

/** Returns rows written. buf: { pos, nrm, col } laid out [side L rows×cols][side R rows×cols] */
export function buildTerrain(course, k, o, ctx, buf) {
  const [s0, s1] = chunkSpan(course, k)
  const rows = Math.min(TER_ROWS, Math.ceil((s1 - s0) / TER_STEP - 1e-6) + 1)
  const { pos, nrm, col } = buf
  for (let sideI = 0; sideI < 2; sideI++) {
    const side = sideI === 0 ? -1 : 1
    const base = sideI * TER_ROWS * TER_COLS
    for (let r = 0; r < rows; r++) {
      const s = Math.min(s0 + r * TER_STEP, s1)
      const fr = course.sample(s, FR)
      // signed curvature extremum nearby (for fold prevention)
      let kMax = fr.k
      for (let q = -60; q <= 60; q += 30) {
        const kk = course.sample(s + q, FR2).k
        if (Math.abs(kk) > Math.abs(kMax)) kMax = kk
      }
      const lim = stripLimit(kMax, side, fr.hw, course.wedgeHalfGap(s), course.innerSide)
      const scale = Math.min(1, lim / TERRAIN_EDGE)
      const ex = side * (fr.hw + CURB_W)
      const edgeX = fr.x + fr.nx * ex
      const edgeY = fr.y + fr.ny * ex
      const edgeZ = fr.z + fr.nz * ex
      // horizontal outward direction (unbanked)
      const ox = Math.cos(fr.heading) * side
      const oz = Math.sin(fr.heading) * side
      if (ctx.parent) ctx.blend = smoothstep(0, 520, s)
      RY[r] = edgeY
      for (let c = 0; c < TER_COLS; c++) {
        const d = c === 0 ? TERRAIN_COLS[0] : Math.max(TERRAIN_COLS[c] * scale, TERRAIN_COLS[c - 1] * scale + 0.05)
        const wx = edgeX + ox * d
        const wz = edgeZ + oz * d
        const h = c === 0 ? edgeY - 0.1 : terrainHeight(ctx, wx, wz, d, side, edgeY)
        const i = r * TER_COLS + c
        H[i] = h; WX[i] = wx; WZ[i] = wz; DD[i] = d
        const vi = (base + i) * 3
        pos[vi] = wx - o.x
        pos[vi + 1] = h - o.y
        pos[vi + 2] = wz - o.z
      }
    }
    // normals + colours
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < TER_COLS; c++) {
        const i = r * TER_COLS + c
        const r0 = r > 0 ? r - 1 : r, r1 = r < rows - 1 ? r + 1 : r
        const c0 = c > 0 ? c - 1 : c, c1 = c < TER_COLS - 1 ? c + 1 : c
        const a = r0 * TER_COLS + c, b = r1 * TER_COLS + c
        const e = r * TER_COLS + c0, f = r * TER_COLS + c1
        // row tangent (along road) and column tangent (outward)
        const tx = WX[b] - WX[a], ty = H[b] - H[a], tz = WZ[b] - WZ[a]
        const ux = WX[f] - WX[e], uy = H[f] - H[e], uz = WZ[f] - WZ[e]
        let nx = ty * uz - tz * uy
        let ny = tz * ux - tx * uz
        let nz = tx * uy - ty * ux
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz }
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len; ny /= len; nz /= len
        const vi = (base + i) * 3
        nrm[vi] = nx; nrm[vi + 1] = ny; nrm[vi + 2] = nz
        terrainColor(ctx, WX[i], WZ[i], DD[i], side, H[i], RY[r], ny, COL)
        col[vi] = COL[0]; col[vi + 1] = COL[1]; col[vi + 2] = COL[2]
      }
    }
  }
  return rows
}

/** Terrain index buffer for `rows` rows (left side flipped). */
export function terrainIndex(rows, out) {
  const per = (rows - 1) * (TER_COLS - 1) * 6
  gridIndex(rows, TER_COLS, true, 0, out, 0)
  gridIndex(rows, TER_COLS, false, TER_ROWS * TER_COLS, out, per)
  return per * 2
}

// ── barriers ─────────────────────────────────────────────────────────────────
const STYLES = {
  guardrail: {
    profile: [[0, 0.46], [0.07, 0.55], [0.07, 0.73], [0, 0.82]],
    color: [0.42, 0.44, 0.47], post: { every: 4, w: 0.1, h: 0.8, back: 0.14, color: [0.25, 0.26, 0.28] },
  },
  concrete: {
    profile: [[0, 0], [0.06, 0.09], [0.2, 0.34], [0.26, 0.84], [0.42, 0.84]],
    color: [0.55, 0.55, 0.53], post: null,
  },
  stone: {
    profile: [[0, 0], [0.02, 0.92], [0.12, 1.02], [0.5, 1.02]],
    color: [0.36, 0.33, 0.29], post: null,
  },
  wood: {
    profile: [[0, 0.5], [0.05, 0.5], [0.05, 0.72], [0, 0.72]],
    color: [0.26, 0.16, 0.08], post: { every: 3, w: 0.14, h: 0.95, back: 0.08, color: [0.2, 0.12, 0.06] },
  },
}

/** Returns { verts, indices }. buf: { pos, nrm, col, index } */
export function buildBarriers(course, k, o, styleName, buf) {
  const style = STYLES[styleName] || STYLES.guardrail
  const [s0, s1] = chunkSpan(course, k)
  const rows = Math.min(ROAD_ROWS, Math.ceil((s1 - s0) / DS - 1e-6) + 1)
  const { pos, nrm, col, index } = buf
  let v = 0, ii = 0
  const prof = style.profile
  const segs = prof.length - 1
  const pushV = (x, y, z, nx, ny, nz, c) => {
    pos[v * 3] = x - o.x; pos[v * 3 + 1] = y - o.y; pos[v * 3 + 2] = z - o.z
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz
    col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]
    return v++
  }
  for (let sideI = 0; sideI < 2; sideI++) {
    const side = sideI === 0 ? -1 : 1
    const bit = side < 0 ? 1 : 2
    let prevOn = false
    let prevBase = -1
    for (let r = 0; r < rows; r++) {
      const s = Math.min(s0 + r * DS, s1)
      const on = (course.bits[Math.min(course.n - 1, Math.round(s / DS))] & bit) !== 0
      if (!on) { prevOn = false; continue }
      if (v + segs * 2 + 20 > BAR_MAX_VERTS || ii + segs * 6 + 40 > BAR_MAX_INDEX) break
      const fr = course.sample(s, FR)
      const wx = side * (fr.hw + CURB_W + BARRIER_GAP)
      const bx = fr.x + fr.nx * wx, by = fr.y + fr.ny * wx, bz = fr.z + fr.nz * wx
      const ox = Math.cos(fr.heading) * side, oz = Math.sin(fr.heading) * side
      const rowBase = v
      for (let q = 0; q < segs; q++) {
        const [o0, h0] = prof[q]
        const [o1, h1] = prof[q + 1]
        // face normal (toward road for the front face)
        let no = -(h1 - h0), nh = o1 - o0
        const l = Math.hypot(no, nh) || 1
        no /= l; nh /= l
        const nx = ox * no, ny = nh, nz = oz * no
        pushV(bx + ox * o0, by + h0, bz + oz * o0, nx, ny, nz, style.color)
        pushV(bx + ox * o1, by + h1, bz + oz * o1, nx, ny, nz, style.color)
      }
      if (prevOn && prevBase >= 0) {
        for (let q = 0; q < segs; q++) {
          const a = prevBase + q * 2, b = a + 1
          const c = rowBase + q * 2, d = c + 1
          index[ii++] = a; index[ii++] = c; index[ii++] = b
          index[ii++] = b; index[ii++] = c; index[ii++] = d
        }
      }
      prevBase = rowBase
      prevOn = true
      // posts
      const post = style.post
      if (post && Math.round(s / DS) % Math.round(post.every / DS) === 0) {
        const px = bx + ox * post.back, pz = bz + oz * post.back
        const tx = fr.tx, tz = fr.tz
        const w = post.w
        const corners = [
          [px - tx * w - ox * w, pz - tz * w - oz * w],
          [px + tx * w - ox * w, pz + tz * w - oz * w],
          [px + tx * w + ox * w, pz + tz * w + oz * w],
          [px - tx * w + ox * w, pz - tz * w + oz * w],
        ]
        for (let f = 0; f < 4; f++) {
          const A = corners[f], B = corners[(f + 1) % 4]
          const mx = (A[0] + B[0]) / 2 - px, mz = (A[1] + B[1]) / 2 - pz
          const ml = Math.hypot(mx, mz) || 1
          const a = pushV(A[0], by - 0.2, A[1], mx / ml, 0, mz / ml, post.color)
          const b = pushV(B[0], by - 0.2, B[1], mx / ml, 0, mz / ml, post.color)
          const c = pushV(A[0], by + post.h, A[1], mx / ml, 0, mz / ml, post.color)
          const d = pushV(B[0], by + post.h, B[1], mx / ml, 0, mz / ml, post.color)
          index[ii++] = a; index[ii++] = b; index[ii++] = c
          index[ii++] = b; index[ii++] = d; index[ii++] = c
        }
      }
    }
  }
  return { verts: v, indices: ii }
}

// ── props ────────────────────────────────────────────────────────────────────
/**
 * Deterministic prop placement for chunk k.
 * Returns { instances: Map(kind → Float32Array [x,y,z,rotY,scale,tint]*n), colliders: [{s,x,r}] }
 */
export function placeProps(course, k, o, ctx, { density = 1, seed = 'or2r' } = {}) {
  const [s0, s1] = chunkSpan(course, k)
  const biome = ctx.biome
  const out = new Map()
  const colliders = []
  biome.props.forEach((rule, ri) => {
    const rng = new RNG(hashSeed(seed, course.stage.id, course.entry, 'props', k, ri))
    const spacing = rule.spacing / Math.max(0.05, density)
    const list = []
    let s = s0 + rng.range(0, spacing)
    while (s < s1) {
      const sides = rule.side === 'span' ? [0] : rule.side === 'both' ? [-1, 1]
        : (rule.side === 'sea' || rule.side === 'lake') ? [ctx.waterSide] : [-ctx.waterSide]
      for (const side of sides) {
        const ss = Math.min(s1 - 0.1, s + (rule.jitter ? rng.range(-0.4, 0.4) * spacing * rule.jitter : 0))
        const fr = course.sample(ss, FR)
        if (course.innerSide && side === course.innerSide && ss < BRANCH_ZONE + 200) continue
        if (!course.goal && course.length - ss < 720) continue // keep the fork zone clean
        if (ss < 60 && course.entry !== 'start') continue
        let d = rng.range(rule.d[0], rule.d[1])
        const barrierOn = side < 0 ? fr.barrierL : fr.barrierR
        if (rule.onBarrier) {
          if (!barrierOn) { rng.next(); continue }
          d = BARRIER_GAP + 0.35
        } else if (barrierOn && d < BARRIER_GAP + 1.2) {
          d += BARRIER_GAP + 1.2
        }
        let kMax = fr.k
        const lim = stripLimit(kMax, side || 1, fr.hw, course.wedgeHalfGap(ss), course.innerSide)
        if (side !== 0 && d > lim - 2) { rng.next(); continue }
        const x = side === 0 ? 0 : side * (fr.hw + CURB_W + d)
        const rot = rng.range(0, Math.PI * 2)
        const sc = rng.range(rule.scale[0], rule.scale[1])
        const tint = rng.next()
        let wx, wy, wz
        if (side === 0) {
          wx = fr.x; wy = fr.y; wz = fr.z
        } else {
          const ex = side * (fr.hw + CURB_W)
          const edgeY = fr.y + fr.ny * ex
          wx = fr.x + fr.nx * ex + Math.cos(fr.heading) * side * d
          wz = fr.z + fr.nz * ex + Math.sin(fr.heading) * side * d
          if (ctx.parent) ctx.blend = smoothstep(0, 520, ss)
          wy = terrainHeight(ctx, wx, wz, d, side, edgeY)
          if (rule.water) {
            if (ctx.waterLevel < -999 || wy > ctx.waterLevel - 1.5) continue
            wy = ctx.waterLevel
          } else if (ctx.waterLevel > -999 && wy < ctx.waterLevel + 0.6) continue
          if (rule.air) wy += rng.range(rule.air[0], rule.air[1])
        }
        const yaw = rule.side === 'span' ? -fr.heading : rot
        list.push(wx - o.x, wy - o.y, wz - o.z, yaw, sc, tint)
        if (rule.collide > 0 && d < 24) colliders.push({ s: ss, x, r: rule.collide * sc, kind: rule.kind })
      }
      s += spacing * (rule.jitter ? rng.range(0.7, 1.3) : 1)
    }
    if (list.length) {
      const prev = out.get(rule.kind)
      const arr = prev ? [...prev, ...list] : list
      out.set(rule.kind, arr)
    }
  })
  const inst = new Map()
  for (const [kind, arr] of out) inst.set(kind, new Float32Array(arr))
  return { instances: inst, colliders }
}
