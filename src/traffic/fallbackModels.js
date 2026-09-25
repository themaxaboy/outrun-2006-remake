// Simple box vehicles with the traffic attribute layout (aPaint, aLight) — used only if the
// detailed procedural traffic models are unavailable.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function part(w, h, d, x, y, z, color, paint, light) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  g.deleteAttribute('uv')
  const n = g.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set(color, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(n).fill(paint), 1))
  g.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(n).fill(light), 1))
  return g
}

function vehicle(L, W, H, cabin = 0.55) {
  const parts = [
    part(W, H * 0.45, L, 0, H * 0.35, 0, [1, 1, 1], 1, 0),
    part(W * 0.86, H * 0.42, L * cabin, 0, H * 0.78, L * 0.05, [0.05, 0.06, 0.08], 0, 0),
    part(W * 0.8, 0.12, 0.05, 0, H * 0.45, L / 2 + 0.01, [0.4, 0.02, 0.02], 0, 2),
    part(W * 0.8, 0.12, 0.05, 0, H * 0.4, -L / 2 - 0.01, [0.9, 0.9, 0.85], 0, 1),
  ]
  for (const z of [-L * 0.33, L * 0.33]) for (const x of [-W / 2, W / 2]) parts.push(part(0.25, 0.64, 0.64, x, 0.32, z, [0.03, 0.03, 0.03], 0, 0))
  const g = mergeGeometries(parts)
  g.computeBoundingSphere()
  return { geometry: g, halfL: L / 2, halfW: W / 2, height: H }
}

export function buildFallbackTrafficModels() {
  return new Map([
    ['sedan', vehicle(4.8, 1.85, 1.45)],
    ['hatch', vehicle(4.1, 1.78, 1.5, 0.6)],
    ['van', vehicle(5.2, 2.0, 2.3, 0.8)],
    ['pickup', vehicle(5.4, 2.0, 1.85, 0.35)],
    ['bus', vehicle(12, 2.55, 3.2, 0.95)],
    ['semi', vehicle(16, 2.55, 3.9, 0.9)],
  ])
}
