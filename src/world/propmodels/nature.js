// Vegetation & rocks. Every model is built around the origin (base at y=0).
import * as THREE from 'three'
import { GeoBuilder, mat4, tube, ribbon, lumpy } from './geo.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)

export function palm(lod = 0, variant = 0) {
  const gb = new GeoBuilder()
  const H = 8.2
  const lean = 0.9 + variant * 0.3
  const segs = lod ? 5 : 10
  const pts = [], rad = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    pts.push(V(lean * t * t, H * t, 0.15 * Math.sin(t * 3)))
    // bulging ring segments near the base, slimmer at the top
    rad.push(0.26 - 0.1 * t + (lod ? 0 : 0.015 * Math.sin(i * 2.7)))
  }
  gb.add(tube(pts, rad, lod ? 5 : 8), {
    color: '#8a7456',
    sway: (x, y) => Math.pow(y / H, 2) * 0.6,
    colorFn: (x, y, z, c) => {
      const band = 0.85 + 0.15 * Math.sin(y * 9)
      return [c[0] * band, c[1] * band, c[2] * band]
    },
  })
  const top = pts[pts.length - 1]
  const fronds = lod ? 7 : 11
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + variant
    const len = 4.2 + ((f * 37) % 7) * 0.12
    const dirX = Math.cos(a), dirZ = Math.sin(a)
    const up = f % 3 === 0 ? 0.9 : 0.4
    const spine = []
    const widths = []
    const n = lod ? 4 : 8
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const hx = dirX * len * t, hz = dirZ * len * t
      const hy = up * t * 2.2 - t * t * 3.4
      spine.push(V(top.x + hx, top.y + hy, top.z + hz))
      widths.push(0.08 + Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.62)
    }
    const side = V(-dirZ, 0, dirX)
    gb.add(ribbon(spine, widths, 0.55, side), {
      color: '#3f7a2c',
      sway: (x, y) => 0.6 + Math.hypot(x - top.x, y - top.y) * 0.25,
      colorFn: (x, y, z, c) => {
        const d = Math.hypot(x - top.x, z - top.z) / len
        return [c[0] * (0.7 + d * 0.6), c[1] * (0.75 + d * 0.45), c[2] * (0.7 + d * 0.3)]
      },
    })
  }
  if (!lod) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7
      gb.add(new THREE.SphereGeometry(0.16, 6, 5), { color: '#5a4a22', matrix: mat4(top.x + Math.cos(a) * 0.25, top.y - 0.25, top.z + Math.sin(a) * 0.25), sway: 0.6 })
    }
  }
  return gb.build()
}

export function pine(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(new THREE.CylinderGeometry(0.12, 0.26, 3.2, lod ? 5 : 7, 1, true), { color: '#4a3524', matrix: mat4(0, 1.6, 0) })
  const tiers = lod ? 3 : 5
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers
    const r = 2.6 * (1 - t * 0.78)
    const h = 3.4 * (1 - t * 0.35)
    const y = 1.8 + t * 8.2
    const g = lod ? new THREE.ConeGeometry(r, h, 7, 1, true) : lumpyCone(r, h, 9, i + 3)
    gb.add(g, {
      color: '#2d5a2e',
      matrix: mat4(0, y + h / 2, 0, 0, i * 0.7, 0),
      sway: 0.15 + t * 0.5,
      colorFn: (x, y2, z, c) => {
        const k = 0.75 + 0.5 * ((y2 - y) / h)
        return [c[0] * k, c[1] * k, c[2] * k]
      },
    })
  }
  return gb.build()
}

function lumpyCone(r, h, seg, seed) {
  const g = new THREE.ConeGeometry(r, h, seg, 3, true)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const a = Math.atan2(z, x)
    const k = 1 + 0.16 * Math.sin(a * 5 + seed) * (0.5 - y / h)
    p.setXYZ(i, x * k, y - (Math.abs(Math.sin(a * seg * 0.5)) * 0.35 * (0.5 - y / h)), z * k)
  }
  g.computeVertexNormals()
  return g
}

export function broadleaf(lod = 0, palette = ['#3f6f2a', '#5f8f35']) {
  const gb = new GeoBuilder()
  gb.add(tube([V(0, 0, 0), V(0.1, 2.2, 0), V(-0.1, 3.6, 0.1)], [0.26, 0.2, 0.14], lod ? 5 : 7), { color: '#5a4431' })
  const clumps = lod ? 3 : 6
  for (let i = 0; i < clumps; i++) {
    const a = i * 2.4
    const r = i === 0 ? 0 : 1.3
    const g = lumpy(1.6 - (i === 0 ? -0.3 : 0), lod ? 0 : 1, 0.28, i + 1, 0.85)
    gb.add(g, {
      color: palette[i % palette.length],
      matrix: mat4(Math.cos(a) * r, 4.3 + (i % 3) * 0.7, Math.sin(a) * r),
      sway: 0.35,
      colorFn: (x, y, z, c) => {
        const k = 0.7 + 0.08 * y
        return [c[0] * k, c[1] * k, c[2] * k]
      },
    })
  }
  return gb.build()
}

export function shrub(lod = 0, color = '#4b7a31') {
  const gb = new GeoBuilder()
  const n = lod ? 2 : 4
  for (let i = 0; i < n; i++) {
    const a = i * 2.1
    gb.add(lumpy(0.8, lod ? 0 : 1, 0.3, i + 9, 0.7), {
      color,
      matrix: mat4(Math.cos(a) * 0.55 * (i > 0), 0.45, Math.sin(a) * 0.55 * (i > 0), 0, a, 0, 1 - i * 0.12),
      sway: (x, y) => y * 0.15,
      colorFn: (x, y, z, c) => {
        const k = 0.65 + 0.45 * y
        return [c[0] * k, c[1] * k, c[2] * k]
      },
    })
  }
  return gb.build()
}

export function rock(lod = 0, color = '#8b8378') {
  const gb = new GeoBuilder()
  gb.add(lumpy(1, lod ? 0 : 2, 0.33, 4, 0.62), {
    color,
    matrix: mat4(0, 0.35, 0),
    colorFn: (x, y, z, c) => {
      const k = 0.72 + 0.32 * (y + 0.2)
      return [c[0] * k, c[1] * k, c[2] * k]
    },
  })
  return gb.build()
}

export function cactus(lod = 0) {
  const gb = new GeoBuilder()
  const c = '#4f7a3a'
  const seg = lod ? 6 : 10
  gb.add(new THREE.CapsuleGeometry(0.32, 4.2, 3, seg), { color: c, matrix: mat4(0, 2.4, 0) })
  gb.add(new THREE.CapsuleGeometry(0.22, 1.4, 3, seg), { color: c, matrix: mat4(0.62, 2.6, 0) })
  gb.add(new THREE.CapsuleGeometry(0.2, 0.6, 3, seg), { color: c, matrix: mat4(0.4, 1.9, 0, 0, 0, Math.PI / 2) })
  gb.add(new THREE.CapsuleGeometry(0.2, 1.1, 3, seg), { color: c, matrix: mat4(-0.58, 3.1, 0) })
  gb.add(new THREE.CapsuleGeometry(0.18, 0.55, 3, seg), { color: c, matrix: mat4(-0.38, 2.55, 0, 0, 0, Math.PI / 2) })
  return gb.build()
}

export function deadtree(lod = 0) {
  const gb = new GeoBuilder()
  const col = '#6b5a48'
  gb.add(tube([V(0, 0, 0), V(0.2, 2, 0), V(-0.1, 4, 0.2), V(0.3, 5.5, 0)], [0.25, 0.18, 0.12, 0.05], lod ? 4 : 6), { color: col })
  gb.add(tube([V(0.1, 2.5, 0), V(1.2, 3.6, 0.3), V(1.8, 4.6, 0.2)], [0.12, 0.07, 0.03], 5), { color: col })
  gb.add(tube([V(-0.05, 3.3, 0.1), V(-1.1, 4.3, -0.4), V(-1.4, 5.2, -0.3)], [0.1, 0.06, 0.02], 5), { color: col })
  return gb.build()
}

export function bamboo(lod = 0) {
  const gb = new GeoBuilder()
  const n = lod ? 3 : 6
  for (let i = 0; i < n; i++) {
    const a = i * 1.9
    const x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5
    const h = 7 + (i % 3)
    gb.add(tube([V(x, 0, z), V(x + 0.3, h * 0.5, z), V(x + 0.9, h, z + 0.2)], [0.07, 0.06, 0.04], 5), {
      color: '#7a9a3a', sway: (xx, y) => (y / h) * 0.7,
    })
    gb.add(lumpy(0.9, 0, 0.35, i, 1.4), { color: '#5d8a2e', matrix: mat4(x + 0.8, h - 0.4, z + 0.2), sway: 0.7 })
  }
  return gb.build()
}
