// Man-made props: houses, lamps, signs, temples, towers. aEmit marks parts that glow at night.
import * as THREE from 'three'
import { GeoBuilder, mat4, lumpy, tube } from './geo.js'
import { broadleaf } from './nature.js'

const V = (x, y, z) => new THREE.Vector3(x, y, z)
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)

function hipRoof(w, d, h) {
  // 4-sided pyramid-ish hip roof
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
  g.rotateY(Math.PI / 4)
  g.scale(w, h, d)
  return g
}

export function villa(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(box(9, 4.2, 7), { color: '#efe9dc', matrix: mat4(0, 2.1, 0) })
  gb.add(box(5, 3.2, 5), { color: '#f4efe4', matrix: mat4(3.5, 5.8, -0.5) })
  gb.add(hipRoof(10, 8, 2.2), { color: '#b4552d', matrix: mat4(0, 5.3, 0) })
  gb.add(hipRoof(5.8, 5.8, 1.8), { color: '#b4552d', matrix: mat4(3.5, 8.3, -0.5) })
  if (!lod) {
    for (let i = -1; i <= 1; i++) {
      gb.add(box(1.3, 1.6, 0.1), { color: '#27394a', matrix: mat4(i * 2.8, 2.2, 3.52), emit: 0.8 })
    }
    gb.add(box(9.5, 0.25, 2), { color: '#dcd6c8', matrix: mat4(0, 0.12, 4.4) })
  }
  return gb.build()
}

export function cabin(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(box(6, 3, 5), { color: '#6b4a2f', matrix: mat4(0, 1.5, 0) })
  const roof = new THREE.CylinderGeometry(0.01, 3.9, 2.4, 4, 1)
  roof.rotateY(Math.PI / 4)
  roof.scale(1.1, 1, 0.9)
  gb.add(roof, { color: '#3b3f44', matrix: mat4(0, 4.2, 0) })
  if (!lod) gb.add(box(1, 1, 0.1), { color: '#ffd28a', matrix: mat4(1.4, 1.6, 2.52), emit: 1 })
  gb.add(box(0.6, 2, 0.6), { color: '#6a6560', matrix: mat4(-2, 4.5, 0) })
  return gb.build()
}

export function chalet(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(box(8, 3, 7), { color: '#d9d3c6', matrix: mat4(0, 1.5, 0) })
  gb.add(box(8.2, 3, 7.2), { color: '#7a5231', matrix: mat4(0, 4.5, 0) })
  const roof = new THREE.CylinderGeometry(0.01, 6.2, 3, 4, 1)
  roof.rotateY(Math.PI / 4)
  roof.scale(1.1, 1, 0.85)
  gb.add(roof, { color: '#5b3b24', matrix: mat4(0, 7.4, 0) })
  if (!lod) {
    gb.add(box(8.6, 0.2, 1.4), { color: '#6b4428', matrix: mat4(0, 3.2, 4.2) })
    for (let i = -1; i <= 1; i += 2) gb.add(box(1.2, 1.3, 0.1), { color: '#2d2a26', matrix: mat4(i * 2.2, 4.6, 3.62), emit: 0.9 })
  }
  return gb.build()
}

export function lamp(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(new THREE.CylinderGeometry(0.08, 0.12, 8, lod ? 5 : 8), { color: '#6f7479', matrix: mat4(0, 4, 0) })
  gb.add(tube([V(0, 7.8, 0), V(-0.8, 8.5, 0), V(-2.2, 8.6, 0)], [0.06, 0.05, 0.05], 5), { color: '#6f7479' })
  gb.add(box(0.9, 0.18, 0.35), { color: '#fff1c8', matrix: mat4(-2.3, 8.5, 0), emit: 1 })
  return gb.build()
}

export function streetlight(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(new THREE.CylinderGeometry(0.1, 0.16, 10, lod ? 5 : 8), { color: '#3d4148', matrix: mat4(0, 5, 0) })
  gb.add(box(3.4, 0.12, 0.16), { color: '#3d4148', matrix: mat4(-1.6, 9.9, 0) })
  gb.add(box(1.1, 0.14, 0.42), { color: '#dff3ff', matrix: mat4(-3.1, 9.8, 0), emit: 1 })
  return gb.build()
}

export function sign(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), { color: '#8a8f94', matrix: mat4(-0.9, 1.5, 0) })
  gb.add(new THREE.CylinderGeometry(0.07, 0.07, 3, 6), { color: '#8a8f94', matrix: mat4(0.9, 1.5, 0) })
  gb.add(box(2.6, 1.4, 0.08), { color: '#1f6b3a', matrix: mat4(0, 2.7, 0) })
  gb.add(box(2.2, 0.12, 0.09), { color: '#e8e8e8', matrix: mat4(0, 2.9, 0.01) })
  return gb.build()
}

export function lantern(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(box(0.5, 0.25, 0.5), { color: '#8b8579', matrix: mat4(0, 0.12, 0) })
  gb.add(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6), { color: '#8b8579', matrix: mat4(0, 0.8, 0) })
  gb.add(box(0.55, 0.5, 0.55), { color: '#ffcf7a', matrix: mat4(0, 1.6, 0), emit: 1 })
  const roof = new THREE.ConeGeometry(0.62, 0.45, 4)
  roof.rotateY(Math.PI / 4)
  gb.add(roof, { color: '#6f6a60', matrix: mat4(0, 2.07, 0) })
  return gb.build()
}

export function pagoda(lod = 0) {
  const gb = new GeoBuilder()
  const tiers = lod ? 3 : 5
  let y = 0
  for (let i = 0; i < tiers; i++) {
    const w = 8 - i * 1.2
    gb.add(box(w * 0.7, 2.6, w * 0.7), { color: '#e8dcc4', matrix: mat4(0, y + 1.3, 0) })
    if (!lod) gb.add(box(w * 0.72, 1.2, w * 0.72), { color: '#8c2a1c', matrix: mat4(0, y + 1.1, 0) })
    const roof = new THREE.ConeGeometry(w * 0.82, 1.4, 4, 1, true)
    roof.rotateY(Math.PI / 4)
    gb.add(roof, { color: '#3b3b3f', matrix: mat4(0, y + 3.2, 0) })
    y += 3.1
  }
  gb.add(new THREE.CylinderGeometry(0.08, 0.12, 4, 6), { color: '#b08a3a', matrix: mat4(0, y + 2, 0) })
  return gb.build()
}

export function torii(lod = 0) {
  // spans the road; width scaled per placement (default 36 m)
  const gb = new GeoBuilder()
  const red = '#b3261e'
  const W = 18
  for (const sx of [-1, 1]) gb.add(new THREE.CylinderGeometry(0.45, 0.55, 11, 10), { color: red, matrix: mat4(sx * W, 5.5, 0) })
  gb.add(box(W * 2 + 5, 0.9, 1.1), { color: '#1e1e1e', matrix: mat4(0, 11.3, 0) })
  gb.add(box(W * 2 + 2, 0.7, 0.8), { color: red, matrix: mat4(0, 9.3, 0) })
  gb.add(box(1.4, 2.2, 0.3), { color: '#1e1e1e', matrix: mat4(0, 10.3, 0.4) })
  return gb.build()
}

export function tower(lod = 0, variant = 0) {
  const gb = new GeoBuilder()
  const h = 30 + (variant % 5) * 12
  const w = 12 + (variant % 3) * 4
  const glass = ['#27374d', '#34495e', '#2c3e50', '#3b4d61'][variant % 4]
  gb.add(box(w, h, w), {
    color: glass,
    matrix: mat4(0, h / 2, 0),
    emit: 0.55,
    colorFn: (x, y, z, c) => {
      // window grid: bright/dark rows baked in vertex colour won't show on a box — keep subtle vertical gradient
      const k = 0.75 + 0.35 * (y / h)
      return [c[0] * k, c[1] * k, c[2] * k]
    },
  })
  if (!lod) {
    gb.add(box(w * 0.7, 4, w * 0.7), { color: '#9aa3ad', matrix: mat4(0, h + 2, 0) })
    gb.add(new THREE.CylinderGeometry(0.15, 0.15, 8, 5), { color: '#c9ced4', matrix: mat4(0, h + 8, 0) })
    gb.add(box(0.5, 0.5, 0.5), { color: '#ff3040', matrix: mat4(0, h + 12, 0), emit: 1 })
  }
  return gb.build()
}

export function billboard(lod = 0) {
  const gb = new GeoBuilder()
  gb.add(new THREE.CylinderGeometry(0.35, 0.4, 10, 8), { color: '#555a60', matrix: mat4(0, 5, 0) })
  gb.add(box(12, 5, 0.4), { color: '#1b1b1f', matrix: mat4(0, 12, 0) })
  gb.add(box(11.4, 4.4, 0.1), {
    color: '#ff4fa3', matrix: mat4(0, 12, 0.25), emit: 1,
    colorFn: (x, y) => (x > 0 ? [0.1, 0.55, 1.0] : [1.0, 0.25, 0.55]),
  })
  return gb.build()
}

export function blossom(lod = 0) {
  return broadleaf(lod, ['#f2b8cf', '#f7d2df', '#e79ab8'])
}

export function maple(lod = 0) {
  return broadleaf(lod, ['#c8452d', '#e0762f', '#b8322a'])
}

export function arch(lod = 0) {
  // generic gantry base (the checkpoint arch has its own textured build)
  const gb = new GeoBuilder()
  gb.add(box(1, 8, 1), { color: '#d0d4da', matrix: mat4(-16, 4, 0) })
  gb.add(box(1, 8, 1), { color: '#d0d4da', matrix: mat4(16, 4, 0) })
  gb.add(box(34, 1.6, 1.2), { color: '#d0d4da', matrix: mat4(0, 8.4, 0) })
  return gb.build()
}

export function rockPile(lod = 0) {
  const gb = new GeoBuilder()
  for (let i = 0; i < 3; i++) gb.add(lumpy(1, lod ? 0 : 1, 0.3, i + 5, 0.7), { color: '#8b8378', matrix: mat4(i * 0.9 - 0.9, 0.4, (i % 2) * 0.6, 0, i, 0, 1 - i * 0.2) })
  return gb.build()
}

export function sailboat(lod = 0) {
  const gb = new GeoBuilder()
  const hull = new THREE.CylinderGeometry(0.9, 0.35, 7, lod ? 6 : 10, 1)
  hull.rotateX(Math.PI / 2)
  hull.scale(1, 0.55, 1)
  gb.add(hull, { color: '#f4f4f0', matrix: mat4(0, 0.35, 0) })
  gb.add(new THREE.CylinderGeometry(0.06, 0.08, 9, 5), { color: '#c9c9c9', matrix: mat4(0, 4.8, -0.4) })
  const sail = new THREE.BufferGeometry()
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, -0.3, 0, 9, -0.35, 0, 1.2, 3.2], 3))
  sail.setIndex([0, 1, 2])
  sail.computeVertexNormals()
  gb.add(sail, { color: '#ffffff', sway: 0.15 })
  const jib = new THREE.BufferGeometry()
  jib.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.3, -0.6, 0, 8, -0.5, 0, 1.3, -3.3], 3))
  jib.setIndex([0, 2, 1])
  jib.computeVertexNormals()
  gb.add(jib, { color: '#ff6a3a', sway: 0.15 })
  return gb.build()
}

export function balloon(lod = 0) {
  const gb = new GeoBuilder()
  const env = new THREE.SphereGeometry(7, lod ? 10 : 18, lod ? 8 : 14)
  const p = env.attributes.position
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    const k = y < 0 ? 1 - Math.pow(-y / 7, 1.6) * 0.62 : 1
    p.setXYZ(i, p.getX(i) * k, y * 1.15, p.getZ(i) * k)
  }
  env.computeVertexNormals()
  const palettes = [['#ff3b30', '#ffd60a'], ['#0a84ff', '#ffffff'], ['#34c759', '#ff9f0a'], ['#bf5af2', '#ff375f']]
  const [c1, c2] = palettes[Math.floor(Math.random() * palettes.length)]
  const A = toLin(c1), B = toLin(c2)
  gb.add(env, {
    matrix: mat4(0, 14, 0),
    colorFn: (x, y, z) => ((Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 6)) % 2) ? A : B),
    sway: 0.2,
  })
  gb.add(new THREE.CylinderGeometry(0.9, 0.75, 1.1, 8), { color: '#8b5a2b', matrix: mat4(0, 4.2, 0), sway: 0.2 })
  for (const [x, z] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    gb.add(new THREE.CylinderGeometry(0.03, 0.03, 3.6, 3), { color: '#3a2a1a', matrix: mat4(x * 1.1, 6.4, z * 1.1), sway: 0.2 })
  }
  return gb.build()
}

function toLin(hex) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
}
