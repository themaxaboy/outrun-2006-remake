// Tyre skid marks: a ring buffer of quads laid on the road behind each rear wheel while the car
// slides. One draw call; old marks fade out as they're overwritten.
import * as THREE from 'three'

const MAX = 1400 // quads
const W = 0.26

export class SkidMarks {
  constructor(scene, atmo) {
    this.pos = new Float32Array(MAX * 4 * 3)
    this.alpha = new Float32Array(MAX * 4)
    const idx = new Uint32Array(MAX * 6)
    for (let i = 0; i < MAX; i++) {
      const b = i * 4
      idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6)
    }
    const g = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.aPos)
    g.setAttribute('aAlpha', this.aAlpha)
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() { gl_FragColor = vec4(0.015, 0.015, 0.017, vA * 0.55); }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.name = 'skids'
    scene.add(this.mesh)
    this.head = 0
    this.last = [null, null]
    this.dirty = false
  }

  clear() {
    this.alpha.fill(0)
    this.last = [null, null]
    this.aAlpha.needsUpdate = true
  }

  /** p0/p1 world points for the left/right rear wheel contact; active = sliding on tarmac. */
  update(wheels, right, active, strength) {
    for (let w = 0; w < 2; w++) {
      const p = wheels[w]
      if (!active) { this.last[w] = null; continue }
      const prev = this.last[w]
      if (prev && prev.distanceToSquared(p) > 0.36 && prev.distanceToSquared(p) < 36) {
        const i = this.head
        this.head = (this.head + 1) % MAX
        const b = i * 12
        const rx = right.x * W, rz = right.z * W
        this.pos.set([prev.x - rx, prev.y, prev.z - rz, prev.x + rx, prev.y, prev.z + rz, p.x - rx, p.y, p.z - rz, p.x + rx, p.y, p.z + rz], b)
        const a = Math.min(1, strength)
        this.alpha.set([a, a, a, a], i * 4)
        this.dirty = true
        prev.copy(p)
      } else if (!prev || prev.distanceToSquared(p) >= 36) {
        this.last[w] = p.clone()
      }
    }
    if (this.dirty) {
      this.aPos.needsUpdate = true
      this.aAlpha.needsUpdate = true
      this.dirty = false
    }
  }
}
