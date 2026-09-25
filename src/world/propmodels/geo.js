// GeoBuilder: merges primitive parts into a single vertex-coloured BufferGeometry with
// per-vertex wind-sway weight (aSway) and emissive mask (aEmit). Used for props, traffic and cars.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hexLin } from '../color.js'

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz)
  _q.setFromEuler(_e)
  _p.set(x, y, z)
  _s.set(sx, sy, sz)
  return new THREE.Matrix4().compose(_p, _q, _s)
}

export function toLinColor(c) {
  if (Array.isArray(c)) return c
  if (typeof c === 'string') return hexLin(c)
  return [c, c, c]
}

export class GeoBuilder {
  constructor() {
    this.parts = []
  }

  /**
   * @param geo    BufferGeometry (indexed or not)
   * @param opts   { color, matrix, sway (number | fn(y)), emit, colorFn(x,y,z) → [r,g,b] }
   */
  add(geo, { color = '#888888', matrix = null, sway = 0, emit = 0, colorFn = null, flat = false } = {}) {
    let g = geo
    if (flat && g.index) g = g.toNonIndexed()
    if (!g.index) {
      // make indexed so every part merges consistently
      const n = g.attributes.position.count
      const idx = new Uint32Array(n)
      for (let i = 0; i < n; i++) idx[i] = i
      g.setIndex(new THREE.BufferAttribute(idx, 1))
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    if (matrix) g.applyMatrix4(matrix)
    if (flat) g.computeVertexNormals()
    if (!g.attributes.normal) g.computeVertexNormals()
    const n = g.attributes.position.count
    const pos = g.attributes.position.array
    const col = new Float32Array(n * 3)
    const sw = new Float32Array(n)
    const em = new Float32Array(n)
    const base = toLinColor(color)
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]
      const c = colorFn ? colorFn(x, y, z, base) : base
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]
      sw[i] = typeof sway === 'function' ? sway(x, y, z) : sway
      em[i] = emit
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1))
    g.setAttribute('aEmit', new THREE.BufferAttribute(em, 1))
    // normalise index type
    const idx = g.index.array
    if (!(idx instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1))
    this.parts.push(g)
    return this
  }

  build() {
    const g = mergeGeometries(this.parts, false)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    this.parts = []
    return g
  }
}

/** Tube along a list of points with per-point radius (open ends). */
export function tube(points, radii, radial = 8) {
  const verts = []
  const norms = []
  const idx = []
  const up = new THREE.Vector3(0, 1, 0)
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const a = points[Math.max(0, i - 1)], c = points[Math.min(points.length - 1, i + 1)]
    t.subVectors(c, a).normalize()
    n.crossVectors(Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, t).normalize()
    b.crossVectors(t, n).normalize()
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2
      const cx = Math.cos(th), sx = Math.sin(th)
      const nx = n.x * cx + b.x * sx, ny = n.y * cx + b.y * sx, nz = n.z * cx + b.z * sx
      const r = radii[i]
      verts.push(p.x + nx * r, p.y + ny * r, p.z + nz * r)
      norms.push(nx, ny, nz)
    }
  }
  const rs = radial + 1
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * rs + j, b2 = a + 1, c = a + rs, d = c + 1
      idx.push(a, c, b2, b2, c, d)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
  g.setIndex(idx)
  return g
}

/** A leaf/frond ribbon: spine points, width profile, V-fold depth. Normals roughly "up". */
export function ribbon(spine, widths, fold = 0.25, sideDir = new THREE.Vector3(1, 0, 0)) {
  const verts = []
  const idx = []
  const t = new THREE.Vector3(), s = new THREE.Vector3(), u = new THREE.Vector3()
  for (let i = 0; i < spine.length; i++) {
    const p = spine[i]
    const a = spine[Math.max(0, i - 1)], c = spine[Math.min(spine.length - 1, i + 1)]
    t.subVectors(c, a).normalize()
    s.copy(sideDir).addScaledVector(t, -sideDir.dot(t)).normalize()
    u.crossVectors(s, t).normalize()
    const w = widths[i]
    // left edge, centre (lifted = fold), right edge
    verts.push(p.x - s.x * w - u.x * w * fold, p.y - s.y * w - u.y * w * fold, p.z - s.z * w - u.z * w * fold)
    verts.push(p.x, p.y, p.z)
    verts.push(p.x + s.x * w - u.x * w * fold, p.y + s.y * w - u.y * w * fold, p.z + s.z * w - u.z * w * fold)
  }
  for (let i = 0; i < spine.length - 1; i++) {
    const a = i * 3
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** Randomly displaced icosphere (rocks, bushes, foliage clumps). */
export function lumpy(radius = 1, detail = 1, amount = 0.25, seed = 1, squashY = 1) {
  const g = new THREE.IcosahedronGeometry(radius, detail)
  const p = g.attributes.position
  let s = seed * 7919
  const rnd = (x, y, z) => {
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s) * 43758.5453
    return h - Math.floor(h)
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const k = 1 + (rnd(Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)) - 0.5) * 2 * amount
    p.setXYZ(i, x * k, y * k * squashY, z * k)
  }
  g.computeVertexNormals()
  return g
}
