// Minimal stand-in with the CarRig interface (used until/if the procedural car fails to build).
import * as THREE from 'three'

export function buildPlaceholderCar(def, color = '#c8102e') {
  const root = new THREE.Group()
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 })
  const dark = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.6 })
  const tail = new THREE.MeshStandardMaterial({ color: '#300', emissive: '#ff1010', emissiveIntensity: 0.6 })
  const L = def.halfLength * 2, W = def.halfWidth * 2
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.55, L), paint)
  body.position.y = 0.55
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.75, 0.4, L * 0.4), dark)
  cabin.position.set(0, 0.98, 0.1)
  const tl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.1, 0.05), tail)
  tl.position.set(0, 0.7, L / 2 + 0.01)
  root.add(body, cabin, tl)
  const wheels = []
  const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 16)
  wg.rotateZ(Math.PI / 2)
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(wg, dark)
    w.position.set(x * (W / 2 - 0.1), 0.34, z * def.wheelbase / 2)
    root.add(w)
    wheels.push(w)
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true })
  let spin = 0
  return {
    root,
    materials: [paint, dark, tail],
    paintMaterial: paint,
    dims: { length: L, width: W, height: 1.2, wheelbase: def.wheelbase, track: W - 0.2, wheelRadius: 0.34 },
    setPaint(hex) { paint.color.set(hex) },
    update(dt, { speed = 0, steerAngle = 0, brake = 0 } = {}) {
      spin += (speed / 0.34) * dt
      wheels.forEach((w, i) => { w.rotation.set(-spin, i < 2 ? -steerAngle : 0, 0, 'YXZ') })
      tail.emissiveIntensity = 0.6 + brake * 5
    },
    setShadow(v) { root.traverse((o) => { if (o.isMesh) o.castShadow = v }) },
    dispose() {},
  }
}
