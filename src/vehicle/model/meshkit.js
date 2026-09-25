// Geometry toolkit for the procedural cars: a multi-group mesh accumulator, parametric grid
// surfaces with smooth normals, lathes, and "decals" that are ray-projected onto a surface.
//
// Everything is written into per-material groups so the car ends up as one merged
// BufferGeometry per material (one draw call each).
import * as THREE from 'three'

const _v = new THREE.Vector3()
const _n = new THREE.Vector3()
const _nm = new THREE.Matrix3()

export class MeshAcc {
  /** @param extra  extra per-vertex attributes { name: itemSize }, filled from the current state (see set()). */
  constructor(extra = {}) {
    this.extra = extra
    this.groups = new Map()
    this.state = {}
    for (const [k, size] of Object.entries(extra)) this.state[k] = new Array(size).fill(k === 'color' ? 1 : 0)
  }

  /** Set the current value of extra attributes for subsequently added vertices. */
  set(vals) {
    for (const k in vals) {
      const v = vals[k]
      this.state[k] = Array.isArray(v) ? v.slice() : [v]
    }
    return this
  }

  group(name) {
    let g = this.groups.get(name)
    if (!g) {
      g = { name, pos: [], nrm: [], uv: [], idx: [], ex: {} }
      for (const k in this.extra) g.ex[k] = []
      this.groups.set(name, g)
    }
    return g
  }

  vert(g, px, py, pz, nx, ny, nz, u = 0, v = 0) {
    const i = g.pos.length / 3
    g.pos.push(px, py, pz)
    g.nrm.push(nx, ny, nz)
    g.uv.push(u, v)
    for (const k in this.extra) {
      const s = this.state[k]
      const arr = g.ex[k]
      for (let c = 0; c < s.length; c++) arr.push(s[c])
    }
    return i
  }

  tri(g, a, b, c) {
    g.idx.push(a, b, c)
  }

  /** Snapshot of the current sizes of every group (for mirrorX). */
  mark() {
    const m = new Map()
    for (const [k, g] of this.groups) m.set(k, [g.pos.length / 3, g.idx.length])
    return m
  }

  /** Duplicate everything added since `mark`, mirrored across x = 0 (winding flipped). */
  mirrorX(mark) {
    for (const [k, g] of this.groups) {
      const [v0, i0] = mark.get(k) || [0, 0]
      const v1 = g.pos.length / 3, i1 = g.idx.length
      const off = v1 - v0
      if (off <= 0) continue
      for (let v = v0; v < v1; v++) {
        g.pos.push(-g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2])
        g.nrm.push(-g.nrm[v * 3], g.nrm[v * 3 + 1], g.nrm[v * 3 + 2])
        g.uv.push(g.uv[v * 2], g.uv[v * 2 + 1])
        for (const e in this.extra) {
          const size = this.extra[e]
          const arr = g.ex[e]
          for (let c = 0; c < size; c++) arr.push(arr[v * size + c])
        }
      }
      for (let i = i0; i < i1; i += 3) g.idx.push(g.idx[i] + off, g.idx[i + 2] + off, g.idx[i + 1] + off)
    }
  }

  /** Add back-facing copies (flipped normal + winding) of everything added to `name` since `mark`. */
  backfaces(mark, name) {
    const g = this.groups.get(name)
    if (!g) return
    const [v0, i0] = mark.get(name) || [0, 0]
    const v1 = g.pos.length / 3, i1 = g.idx.length
    const off = v1 - v0
    for (let v = v0; v < v1; v++) {
      g.pos.push(g.pos[v * 3], g.pos[v * 3 + 1], g.pos[v * 3 + 2])
      g.nrm.push(-g.nrm[v * 3], -g.nrm[v * 3 + 1], -g.nrm[v * 3 + 2])
      g.uv.push(g.uv[v * 2], g.uv[v * 2 + 1])
      for (const e in this.extra) {
        const size = this.extra[e]
        const arr = g.ex[e]
        for (let c = 0; c < size; c++) arr.push(arr[v * size + c])
      }
    }
    for (let i = i0; i < i1; i += 3) g.idx.push(g.idx[i] + off, g.idx[i + 2] + off, g.idx[i + 1] + off)
  }

  /**
   * Append a three.js BufferGeometry to a group.
   * opts: { matrix, boxUV (metres → uv scale), flipWinding }
   */
  addGeometry(name, geo, { matrix = null, boxUV = 0, flip = false } = {}) {
    const g = this.group(name)
    const pos = geo.attributes.position
    const nrm = geo.attributes.normal
    const uv = geo.attributes.uv
    let det = 1
    if (matrix) {
      _nm.getNormalMatrix(matrix)
      det = matrix.determinant()
    }
    const base = g.pos.length / 3
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i)
      if (nrm) _n.fromBufferAttribute(nrm, i)
      else _n.set(0, 1, 0)
      if (matrix) {
        _v.applyMatrix4(matrix)
        _n.applyMatrix3(_nm).normalize()
      }
      let u = 0, v = 0
      if (boxUV) {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z)
        if (ax >= ay && ax >= az) { u = _v.z * boxUV; v = _v.y * boxUV }
        else if (ay >= az) { u = _v.x * boxUV; v = _v.z * boxUV }
        else { u = _v.x * boxUV; v = _v.y * boxUV }
      } else if (uv) {
        u = uv.getX(i)
        v = uv.getY(i)
      }
      this.vert(g, _v.x, _v.y, _v.z, _n.x, _n.y, _n.z, u, v)
    }
    const flipW = (det < 0) !== flip
    const push = (a, b, c) => (flipW ? g.idx.push(base + a, base + c, base + b) : g.idx.push(base + a, base + b, base + c))
    if (geo.index) {
      const ix = geo.index.array
      for (let i = 0; i < ix.length; i += 3) push(ix[i], ix[i + 1], ix[i + 2])
    } else {
      for (let i = 0; i < pos.count; i += 3) push(i, i + 1, i + 2)
    }
    return this
  }

  triangleCount(name) {
    const g = this.groups.get(name)
    return g ? g.idx.length / 3 : 0
  }

  /** Build one indexed BufferGeometry per group. Returns Map(name → geometry). */
  build() {
    const out = new Map()
    for (const [name, g] of this.groups) {
      if (!g.idx.length) continue
      out.set(name, toGeometry(g, this.extra))
    }
    return out
  }
}

export function toGeometry(g, extra = {}) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.pos), 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(g.nrm), 3))
  if (g.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.uv), 2))
  for (const k in extra) geo.setAttribute(k, new THREE.BufferAttribute(new Float32Array(g.ex[k]), extra[k]))
  const n = g.pos.length / 3
  geo.setIndex(new THREE.BufferAttribute(n > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx), 1))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

// ---------------------------------------------------------------------------------------------
// Parametric grids

/**
 * Smooth, area-weighted vertex normals for a rows×cols grid of points (Float64Array, xyz).
 * closed: columns wrap around. include(i, j): whether quad (i, j) contributes.
 * Rows that collapse to a single point (poles) get the average normal of the row.
 */
export function gridNormals(P, rows, cols, closed = false, include = null) {
  const N = new Float64Array(rows * cols * 3)
  const jmax = closed ? cols : cols - 1
  const acc = (k, x, y, z) => {
    N[k * 3] += x
    N[k * 3 + 1] += y
    N[k * 3 + 2] += z
  }
  const faceTo = (a, b, c) => {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2]
    const e1x = P[b * 3] - ax, e1y = P[b * 3 + 1] - ay, e1z = P[b * 3 + 2] - az
    const e2x = P[c * 3] - ax, e2y = P[c * 3 + 1] - ay, e2z = P[c * 3 + 2] - az
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    acc(a, nx, ny, nz)
    acc(b, nx, ny, nz)
    acc(c, nx, ny, nz)
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < jmax; j++) {
      if (include && !include(i, j)) continue
      const j1 = (j + 1) % cols
      const a = i * cols + j, b = i * cols + j1, c = (i + 1) * cols + j, d = (i + 1) * cols + j1
      faceTo(a, b, c)
      faceTo(b, d, c)
    }
  }
  // poles
  for (let i = 0; i < rows; i++) {
    let span = 0
    const x0 = P[i * cols * 3], y0 = P[i * cols * 3 + 1], z0 = P[i * cols * 3 + 2]
    for (let j = 1; j < cols; j++) {
      const k = (i * cols + j) * 3
      span = Math.max(span, Math.abs(P[k] - x0) + Math.abs(P[k + 1] - y0) + Math.abs(P[k + 2] - z0))
    }
    if (span < 1e-5) {
      let sx = 0, sy = 0, sz = 0
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3
        const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1
        sx += N[k] / l
        sy += N[k + 1] / l
        sz += N[k + 2] / l
      }
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3
        N[k] = sx
        N[k + 1] = sy
        N[k + 2] = sz
      }
    }
  }
  normalizeAll(N)
  return N
}

export function normalizeAll(N) {
  for (let k = 0; k < N.length; k += 3) {
    const l = Math.hypot(N[k], N[k + 1], N[k + 2])
    if (l > 1e-12) {
      N[k] /= l
      N[k + 1] /= l
      N[k + 2] /= l
    } else {
      N[k] = 0
      N[k + 1] = 1
      N[k + 2] = 0
    }
  }
  return N
}

/**
 * Emit a grid surface into the accumulator.
 * classify(i, j) → group name | null (skip) | { g: name, flat: true } (flat-shaded quad)
 * uv(i, j) → [u, v]; for closed grids j may equal cols on the seam.
 */
export function emitGrid(acc, P, N, rows, cols, { closed = false, classify, uv = null }) {
  const maps = new Map()
  const jmax = closed ? cols : cols - 1
  const getV = (g, map, i, j) => {
    const key = i * (cols + 1) + j
    let id = map.get(key)
    if (id !== undefined) return id
    const k = (i * cols + (j % cols)) * 3
    const t = uv ? uv(i, j) : [j / (cols - 1), i / Math.max(1, rows - 1)]
    id = acc.vert(g, P[k], P[k + 1], P[k + 2], N[k], N[k + 1], N[k + 2], t[0], t[1])
    map.set(key, id)
    return id
  }
  const area2 = (a, b, c) => {
    const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2]
    const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2]
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    return [nx, ny, nz, nx * nx + ny * ny + nz * nz]
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < jmax; j++) {
      const cls = classify(i, j)
      if (!cls) continue
      const j1 = j + 1
      const a = i * cols + j, b = i * cols + (j1 % cols), c = (i + 1) * cols + j, d = (i + 1) * cols + (j1 % cols)
      const t1 = area2(a, b, c), t2 = area2(b, d, c)
      if (typeof cls === 'object') {
        // flat-shaded quad
        const g = acc.group(cls.g)
        let nx = t1[0] + t2[0], ny = t1[1] + t2[1], nz = t1[2] + t2[2]
        const l = Math.hypot(nx, ny, nz)
        if (l < 1e-12) continue
        nx /= l; ny /= l; nz /= l
        const ids = [a, b, c, d].map((k, q) => {
          const ii = q < 2 ? i : i + 1, jj = q % 2 === 0 ? j : j1
          const t = uv ? uv(ii, jj) : [0, 0]
          return acc.vert(g, P[k * 3], P[k * 3 + 1], P[k * 3 + 2], nx, ny, nz, t[0], t[1])
        })
        if (t1[3] > 1e-14) acc.tri(g, ids[0], ids[1], ids[2])
        if (t2[3] > 1e-14) acc.tri(g, ids[1], ids[3], ids[2])
        continue
      }
      const g = acc.group(cls)
      let map = maps.get(cls)
      if (!map) maps.set(cls, (map = new Map()))
      if (t1[3] > 1e-14) acc.tri(g, getV(g, map, i, j), getV(g, map, i, j1), getV(g, map, i + 1, j))
      if (t2[3] > 1e-14) acc.tri(g, getV(g, map, i, j1), getV(g, map, i + 1, j1), getV(g, map, i + 1, j))
    }
  }
}

/** Apply a Matrix4 to grid positions + normals in place. */
export function transformPN(P, N, m) {
  _nm.getNormalMatrix(m)
  for (let k = 0; k < P.length; k += 3) {
    _v.set(P[k], P[k + 1], P[k + 2]).applyMatrix4(m)
    P[k] = _v.x; P[k + 1] = _v.y; P[k + 2] = _v.z
    if (N) {
      _n.set(N[k], N[k + 1], N[k + 2]).applyMatrix3(_nm).normalize()
      N[k] = _n.x; N[k + 1] = _n.y; N[k + 2] = _n.z
    }
  }
}

/**
 * Lathe a 2D profile [[x, r], ...] around the X axis (wheel axle). Walk the profile so that the
 * outside is on the left of the direction of travel in (x, r) — e.g. +x along a cylinder faces out.
 * Every profile "run" is lathed separately so runs meet with a hard edge.
 */
export function lathe(acc, group, runs, segs, { uv = null, matrix = null, arc = Math.PI * 2, phase = 0 } = {}) {
  const closed = arc >= Math.PI * 2 - 1e-6
  const cols = closed ? segs : segs + 1
  for (const prof of runs) {
    const rows = prof.length
    const P = new Float64Array(rows * cols * 3)
    for (let i = 0; i < rows; i++) {
      const [x, r] = prof[i]
      for (let j = 0; j < cols; j++) {
        const th = phase + (j / segs) * arc
        const k = (i * cols + j) * 3
        P[k] = x
        P[k + 1] = r * Math.cos(th)
        P[k + 2] = r * Math.sin(th)
      }
    }
    const N = gridNormals(P, rows, cols, closed)
    if (matrix) transformPN(P, N, matrix)
    emitGrid(acc, P, N, rows, cols, {
      closed,
      classify: () => group,
      uv: (i, j) => (uv ? uv(prof[i], i, j / segs) : [i / (rows - 1), j / segs]),
    })
  }
}

// ---------------------------------------------------------------------------------------------
// Ray projection ("decals" and part placement)

/** Triangle soup target for ray casts: built from an accumulator group. */
export class RayTarget {
  constructor(groups) {
    let count = 0
    for (const g of groups) count += g.idx.length / 3
    this.count = count
    this.P = new Float64Array(count * 9)
    this.N = new Float64Array(count * 9)
    this.F = new Float64Array(count * 3)
    let t = 0
    for (const g of groups) {
      for (let i = 0; i < g.idx.length; i += 3, t++) {
        for (let c = 0; c < 3; c++) {
          const v = g.idx[i + c]
          for (let a = 0; a < 3; a++) {
            this.P[t * 9 + c * 3 + a] = g.pos[v * 3 + a]
            this.N[t * 9 + c * 3 + a] = g.nrm[v * 3 + a]
          }
        }
        const p = this.P, o = t * 9
        const e1x = p[o + 3] - p[o], e1y = p[o + 4] - p[o + 1], e1z = p[o + 5] - p[o + 2]
        const e2x = p[o + 6] - p[o], e2y = p[o + 7] - p[o + 1], e2z = p[o + 8] - p[o + 2]
        const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
        const l = Math.hypot(nx, ny, nz) || 1
        this.F[t * 3] = nx / l
        this.F[t * 3 + 1] = ny / l
        this.F[t * 3 + 2] = nz / l
      }
    }
  }

  /** Triangles facing against d whose projection on the (a, b) plane (origin org) overlaps [u0,u1]×[v0,v1]. */
  candidates(a, b, d, u0, u1, v0, v1, org = [0, 0, 0]) {
    const out = []
    const P = this.P, F = this.F
    const ou = org[0] * a[0] + org[1] * a[1] + org[2] * a[2]
    const ov = org[0] * b[0] + org[1] * b[1] + org[2] * b[2]
    for (let t = 0; t < this.count; t++) {
      if (F[t * 3] * d[0] + F[t * 3 + 1] * d[1] + F[t * 3 + 2] * d[2] > 0.2) continue
      let mnu = Infinity, mxu = -Infinity, mnv = Infinity, mxv = -Infinity
      for (let c = 0; c < 3; c++) {
        const o = t * 9 + c * 3
        const u = P[o] * a[0] + P[o + 1] * a[1] + P[o + 2] * a[2] - ou
        const v = P[o] * b[0] + P[o + 1] * b[1] + P[o + 2] * b[2] - ov
        if (u < mnu) mnu = u
        if (u > mxu) mxu = u
        if (v < mnv) mnv = v
        if (v > mxv) mxv = v
      }
      if (mxu < u0 || mnu > u1 || mxv < v0 || mnv > v1) continue
      out.push(t)
    }
    return out
  }

  /** Nearest hit along ray (ro, rd) among candidate triangles (all when cand is null). */
  cast(ro, rd, cand = null) {
    const P = this.P
    let best = Infinity, bt = -1, bu = 0, bv = 0
    const n = cand ? cand.length : this.count
    for (let q = 0; q < n; q++) {
      const t = cand ? cand[q] : q
      const o = t * 9
      const e1x = P[o + 3] - P[o], e1y = P[o + 4] - P[o + 1], e1z = P[o + 5] - P[o + 2]
      const e2x = P[o + 6] - P[o], e2y = P[o + 7] - P[o + 1], e2z = P[o + 8] - P[o + 2]
      const px = rd[1] * e2z - rd[2] * e2y, py = rd[2] * e2x - rd[0] * e2z, pz = rd[0] * e2y - rd[1] * e2x
      const det = e1x * px + e1y * py + e1z * pz
      if (Math.abs(det) < 1e-14) continue
      const inv = 1 / det
      const tx = ro[0] - P[o], ty = ro[1] - P[o + 1], tz = ro[2] - P[o + 2]
      const u = (tx * px + ty * py + tz * pz) * inv
      if (u < -1e-7 || u > 1 + 1e-7) continue
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
      const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * inv
      if (v < -1e-7 || u + v > 1 + 1e-7) continue
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv
      if (tt > 1e-6 && tt < best) {
        best = tt
        bt = t
        bu = u
        bv = v
      }
    }
    if (bt < 0) return null
    const w = 1 - bu - bv, o = bt * 9, N = this.N
    const nx = N[o] * w + N[o + 3] * bu + N[o + 6] * bv
    const ny = N[o + 1] * w + N[o + 4] * bu + N[o + 7] * bv
    const nz = N[o + 2] * w + N[o + 5] * bu + N[o + 8] * bv
    const l = Math.hypot(nx, ny, nz) || 1
    return {
      t: best,
      p: [ro[0] + rd[0] * best, ro[1] + rd[1] * best, ro[2] + rd[2] * best],
      n: [nx / l, ny / l, nz / l],
    }
  }
}

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * Projection frame from a direction d (into the surface) and an "up" hint.
 * Plane coords: u along a (right), v along b (up).
 */
export function frameFrom(d, up = [0, 1, 0], o = [0, 0, 0]) {
  d = norm3(d)
  let a = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]]
  a = norm3(a)
  const b = norm3([d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]])
  return { a, b, d, o }
}

// 2D shape grids for decals: { rows, cols, closed, pts: Float64Array(rows*cols*2), boundary: 'ring'|'rect' }

/** Superellipse (n=2 → ellipse), polar grid with a centre pole, optional bilinear warp via quad corners. */
export function shapeEllipse(cx, cy, rx, ry, { n = 2, rings = 3, segs = 24, rot = 0, quad = null } = {}) {
  const rows = rings + 1, cols = segs
  const pts = new Float64Array(rows * cols * 2)
  const cr = Math.cos(rot), sr = Math.sin(rot)
  for (let i = 0; i < rows; i++) {
    const r = i / rings
    for (let j = 0; j < cols; j++) {
      const th = (j / segs) * Math.PI * 2
      const c = Math.cos(th), s = Math.sin(th)
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * r
      const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * r
      let x, y
      if (quad) {
        // bilinear map of [-1,1]² onto the 4 corners (p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left)
        const u = (ex + 1) / 2, v = (ey + 1) / 2
        x = (1 - v) * ((1 - u) * quad[0][0] + u * quad[1][0]) + v * ((1 - u) * quad[3][0] + u * quad[2][0])
        y = (1 - v) * ((1 - u) * quad[0][1] + u * quad[1][1]) + v * ((1 - u) * quad[3][1] + u * quad[2][1])
      } else {
        const lx = ex * rx, ly = ey * ry
        x = cx + lx * cr - ly * sr
        y = cy + lx * sr + ly * cr
      }
      pts[(i * cols + j) * 2] = x
      pts[(i * cols + j) * 2 + 1] = y
    }
  }
  return { rows, cols, closed: true, pts, boundary: 'ring' }
}

/** Bilinear quad (corners p0 bottom-left, p1 bottom-right, p2 top-right, p3 top-left). */
export function shapeQuad(q, rows = 3, cols = 6) {
  const pts = new Float64Array(rows * cols * 2)
  for (let i = 0; i < rows; i++) {
    const v = i / (rows - 1)
    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1)
      pts[(i * cols + j) * 2] = (1 - v) * ((1 - u) * q[0][0] + u * q[1][0]) + v * ((1 - u) * q[3][0] + u * q[2][0])
      pts[(i * cols + j) * 2 + 1] = (1 - v) * ((1 - u) * q[0][1] + u * q[1][1]) + v * ((1 - u) * q[3][1] + u * q[2][1])
    }
  }
  return { rows, cols, closed: false, pts, boundary: 'rect' }
}

/** Strip along a 2D polyline with per-point half widths (rows along the line, cols across). */
export function shapeStrip(line, halfW, cols = 2, step = 0.03) {
  // resample the polyline so the strip follows curved surfaces
  if (step > 0) {
    const out = [line[0]]
    const hwOut = typeof halfW === 'number' ? null : [halfW[0]]
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i]
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step))
      for (let k = 1; k <= n; k++) {
        out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
        if (hwOut) hwOut.push(halfW[i - 1] + ((halfW[i] - halfW[i - 1]) * k) / n)
      }
    }
    line = out
    if (hwOut) halfW = hwOut
  }
  const rows = line.length
  const pts = new Float64Array(rows * cols * 2)
  for (let i = 0; i < rows; i++) {
    const p = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(rows - 1, i + 1)]
    let tx = b[0] - a[0], ty = b[1] - a[1]
    const l = Math.hypot(tx, ty) || 1
    tx /= l
    ty /= l
    const hw = typeof halfW === 'number' ? halfW : halfW[i]
    for (let j = 0; j < cols; j++) {
      const s = (j / (cols - 1)) * 2 - 1
      pts[(i * cols + j) * 2] = p[0] - ty * hw * s
      pts[(i * cols + j) * 2 + 1] = p[1] + tx * hw * s
    }
  }
  return { rows, cols, closed: false, pts, boundary: 'rect' }
}

/**
 * Project a 2D shape onto a RayTarget and emit it (offset along the surface normal by `gap`).
 * frame: { a, b, d } from frameFrom(); shape: from shape*(); plane coords are world-space
 * dot products with a and b. extrude: add a side wall down into the surface (raised badge look).
 * Returns the projected points (null where the ray missed).
 */
export function projectDecal(acc, target, frame, shape, { group, gap = 0.004, extrude = 0, gapFn = null, uvScale = 1, back = 3 } = {}) {
  const { a, b, d } = frame
  const o = frame.o || [0, 0, 0]
  const { rows, cols, closed, pts } = shape
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (let k = 0; k < rows * cols; k++) {
    u0 = Math.min(u0, pts[k * 2]); u1 = Math.max(u1, pts[k * 2])
    v0 = Math.min(v0, pts[k * 2 + 1]); v1 = Math.max(v1, pts[k * 2 + 1])
  }
  const m = 0.02
  const cand = target.candidates(a, b, d, u0 - m, u1 + m, v0 - m, v1 + m, o)
  const P = new Float64Array(rows * cols * 3)
  const N = new Float64Array(rows * cols * 3)
  const H = new Float64Array(rows * cols * 3) // surface hit (no gap)
  const ok = new Uint8Array(rows * cols)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const k = i * cols + j
      const pu = pts[k * 2], pv = pts[k * 2 + 1]
      const ro = [o[0] + a[0] * pu + b[0] * pv - d[0] * back, o[1] + a[1] * pu + b[1] * pv - d[1] * back, o[2] + a[2] * pu + b[2] * pv - d[2] * back]
      const h = target.cast(ro, d, cand)
      if (!h) continue
      ok[k] = 1
      const gg = gapFn ? gapFn(i / Math.max(1, rows - 1), j / (closed ? cols : cols - 1)) : gap
      for (let c = 0; c < 3; c++) {
        H[k * 3 + c] = h.p[c]
        P[k * 3 + c] = h.p[c] + h.n[c] * gg
        N[k * 3 + c] = h.n[c]
      }
    }
  }
  const g = acc.group(group)
  const ids = new Int32Array(rows * cols).fill(-1)
  const vid = (k) => {
    if (ids[k] < 0) ids[k] = acc.vert(g, P[k * 3], P[k * 3 + 1], P[k * 3 + 2], N[k * 3], N[k * 3 + 1], N[k * 3 + 2], pts[k * 2] * uvScale, pts[k * 2 + 1] * uvScale)
    return ids[k]
  }
  const emitTri = (x, y, z) => {
    if (!ok[x] || !ok[y] || !ok[z]) return
    const e1 = [P[y * 3] - P[x * 3], P[y * 3 + 1] - P[x * 3 + 1], P[y * 3 + 2] - P[x * 3 + 2]]
    const e2 = [P[z * 3] - P[x * 3], P[z * 3 + 1] - P[x * 3 + 1], P[z * 3 + 2] - P[x * 3 + 2]]
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    const a2 = fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2]
    if (a2 < 1e-16) return
    const sn = N[x * 3] + N[y * 3] + N[z * 3], sy = N[x * 3 + 1] + N[y * 3 + 1] + N[z * 3 + 1], sz = N[x * 3 + 2] + N[y * 3 + 2] + N[z * 3 + 2]
    if (fn[0] * sn + fn[1] * sy + fn[2] * sz >= 0) acc.tri(g, vid(x), vid(y), vid(z))
    else acc.tri(g, vid(x), vid(z), vid(y))
  }
  const jmax = closed ? cols : cols - 1
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < jmax; j++) {
      const j1 = (j + 1) % cols
      const k00 = i * cols + j, k01 = i * cols + j1, k10 = (i + 1) * cols + j, k11 = (i + 1) * cols + j1
      emitTri(k00, k01, k10)
      emitTri(k01, k11, k10)
    }
  }
  if (extrude > 0) {
    // side wall around the boundary, from the decal surface down into the body
    let loop = []
    if (shape.boundary === 'ring') for (let j = 0; j < cols; j++) loop.push((rows - 1) * cols + j)
    else {
      for (let j = 0; j < cols; j++) loop.push(j)
      for (let i = 1; i < rows; i++) loop.push(i * cols + cols - 1)
      for (let j = cols - 2; j >= 0; j--) loop.push((rows - 1) * cols + j)
      for (let i = rows - 2; i > 0; i--) loop.push(i * cols)
    }
    let cx = 0, cy = 0, cz = 0, cn = 0
    for (let k = 0; k < rows * cols; k++) if (ok[k]) { cx += P[k * 3]; cy += P[k * 3 + 1]; cz += P[k * 3 + 2]; cn++ }
    if (cn) { cx /= cn; cy /= cn; cz /= cn }
    const L = loop.length
    for (let q = 0; q < L; q++) {
      const k0 = loop[q], k1 = loop[(q + 1) % L]
      if (!ok[k0] || !ok[k1]) continue
      const top0 = [P[k0 * 3], P[k0 * 3 + 1], P[k0 * 3 + 2]], top1 = [P[k1 * 3], P[k1 * 3 + 1], P[k1 * 3 + 2]]
      const bot0 = [H[k0 * 3] - N[k0 * 3] * extrude, H[k0 * 3 + 1] - N[k0 * 3 + 1] * extrude, H[k0 * 3 + 2] - N[k0 * 3 + 2] * extrude]
      const bot1 = [H[k1 * 3] - N[k1 * 3] * extrude, H[k1 * 3 + 1] - N[k1 * 3 + 1] * extrude, H[k1 * 3 + 2] - N[k1 * 3 + 2] * extrude]
      const e1 = [top1[0] - top0[0], top1[1] - top0[1], top1[2] - top0[2]]
      const e2 = [bot0[0] - top0[0], bot0[1] - top0[1], bot0[2] - top0[2]]
      let fn = norm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]])
      const out = [top0[0] - cx, top0[1] - cy, top0[2] - cz]
      let flip = fn[0] * out[0] + fn[1] * out[1] + fn[2] * out[2] < 0
      if (flip) fn = [-fn[0], -fn[1], -fn[2]]
      const i0 = acc.vert(g, ...top0, ...fn, 0, 0)
      const i1 = acc.vert(g, ...top1, ...fn, 1, 0)
      const i2 = acc.vert(g, ...bot0, ...fn, 0, 1)
      const i3 = acc.vert(g, ...bot1, ...fn, 1, 1)
      if (!flip) {
        acc.tri(g, i0, i1, i2)
        acc.tri(g, i1, i3, i2)
      } else {
        acc.tri(g, i0, i2, i1)
        acc.tri(g, i1, i2, i3)
      }
    }
  }
  return { P, N, ok, rows, cols }
}
