import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildCar, CAR_IDS } from '../../src/vehicle/model/CarBuilder.js'
import { buildTrafficModels, TRAFFIC_TYPES } from '../../src/traffic/trafficModels.js'
import { getCar } from '../../src/vehicle/carDefs.js'

function meshStats(root) {
  let tris = 0
  let draws = 0
  let bad = 0
  const box = new THREE.Box3()
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    if (!o.isMesh) return
    draws++
    const g = o.geometry
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3
    tris += n * (o.isInstancedMesh ? o.count : 1)
    for (const name of ['position', 'normal']) {
      const a = g.attributes[name].array
      for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++
    }
    const n2 = g.attributes.normal.array
    for (let i = 0; i < n2.length; i += 3) {
      const l = Math.hypot(n2[i], n2[i + 1], n2[i + 2])
      if (l < 0.5 || l > 1.5) bad++
    }
    box.union(new THREE.Box3().setFromObject(o))
  })
  return { tris, draws, bad, box }
}

const LIMITS = { high: 100000, low: 35000 }

describe.each(CAR_IDS)('procedural car: %s', (id) => {
  const def = getCar(id)
  for (const quality of ['high', 'low']) {
    describe(quality, () => {
      const rig = buildCar(id, { quality, color: '#3366aa', finish: 'pearl' })
      const s = meshStats(rig.root)

      it('builds with at most 10 draw objects', () => {
        expect(rig.root).toBeInstanceOf(THREE.Group)
        expect(s.draws).toBeGreaterThan(3)
        expect(s.draws).toBeLessThanOrEqual(10)
      })

      it('stays within the triangle budget', () => {
        expect(s.tris).toBeLessThanOrEqual(LIMITS[quality])
        expect(s.tris).toBeGreaterThan(quality === 'high' ? 15000 : 5000)
      })

      it('has no NaN positions/normals', () => {
        expect(s.bad).toBe(0)
      })

      it('matches the carDefs dims', () => {
        const size = s.box.getSize(new THREE.Vector3())
        const L = 2 * def.halfLength, W = 2 * def.halfWidth
        expect(Math.abs(size.z - L) / L).toBeLessThan(0.15)
        expect(Math.abs(size.x - W) / W).toBeLessThan(0.15)
        expect(s.box.min.y).toBeGreaterThan(-0.02)
        expect(s.box.min.y).toBeLessThan(0.02) // tyres touch the road
        expect(size.y).toBeGreaterThan(0.9)
        expect(size.y).toBeLessThan(1.45)
        expect(Math.abs(s.box.getCenter(new THREE.Vector3()).x)).toBeLessThan(0.02)
        expect(rig.dims.wheelbase).toBeCloseTo(def.wheelbase, 5)
        expect(Math.abs(rig.dims.length - L) / L).toBeLessThan(0.15)
      })

      it('puts the wheels at ±wheelbase/2', () => {
        const tyres = rig.root.children.find((c) => c.isInstancedMesh && c.name === 'Tyres')
        expect(tyres.count).toBe(4)
        const m = new THREE.Matrix4(), p = new THREE.Vector3()
        const zs = []
        for (let i = 0; i < 4; i++) {
          tyres.getMatrixAt(i, m)
          p.setFromMatrixPosition(m)
          zs.push(p.z)
          expect(p.y).toBeCloseTo(rig.dims.wheelRadius, 5)
          expect(Math.abs(p.x)).toBeGreaterThan(0.6)
        }
        expect(zs.filter((z) => Math.abs(z + def.wheelbase / 2) < 1e-4).length).toBe(2)
        expect(zs.filter((z) => Math.abs(z - def.wheelbase / 2) < 1e-4).length).toBe(2)
        for (const w of rig.wheelPositions) expect(Math.abs(Math.abs(w.z) - def.wheelbase / 2)).toBeLessThan(1e-6)
      })
    })
  }

  it('animates wheels, steering and lights through update()', () => {
    const rig = buildCar(id, { quality: 'low' })
    const tyres = rig.root.children.find((c) => c.name === 'Tyres')
    const brakes = rig.root.children.find((c) => c.name === 'Brakes')
    const m0 = new THREE.Matrix4(), m1 = new THREE.Matrix4(), b0 = new THREE.Matrix4(), b1 = new THREE.Matrix4()
    tyres.getMatrixAt(1, m0)
    brakes.getMatrixAt(1, b0)
    rig.update(0.05, { speed: 20, steerAngle: 0 })
    tyres.getMatrixAt(1, m1)
    brakes.getMatrixAt(1, b1)
    expect(m1.equals(m0)).toBe(false) // wheel spins
    expect(b1.equals(b0)).toBe(true) // calipers do not spin

    // positive steer turns the fronts right (+X when heading -Z); rears stay straight
    rig.update(0.016, { speed: 10, steerAngle: 0.3 })
    const fwd = (mesh, i) => {
      const m = new THREE.Matrix4()
      mesh.getMatrixAt(i, m)
      const q = new THREE.Quaternion().setFromRotationMatrix(m.extractRotation(m))
      return new THREE.Vector3(0, 0, -1).applyQuaternion(q)
    }
    for (const i of [0, 1]) {
      const f = fwd(brakes, i)
      expect(f.x).toBeGreaterThan(0.25)
      expect(f.z).toBeLessThan(0)
    }
    for (const i of [2, 3]) expect(Math.abs(fwd(brakes, i).x)).toBeLessThan(1e-6)

    // lights: brake → tail 5, night → head 8, idle → 0.6 / 0.4
    rig.update(0.016, { speed: 10, brake: 1, lights: 1 })
    const tail = rig.materials.find((mm) => mm.name === 'Taillight')
    const head = rig.materials.find((mm) => mm.name === 'Headlight')
    expect(tail.emissiveIntensity).toBeCloseTo(5)
    expect(head.emissiveIntensity).toBeCloseTo(8)
    rig.update(0.016, { speed: 10, brake: 0, lights: 0 })
    expect(tail.emissiveIntensity).toBeCloseTo(0.6)
    expect(head.emissiveIntensity).toBeCloseTo(0.4)
  })

  it('repaints and exposes every material', () => {
    const rig = buildCar(id, { quality: 'low', finish: 'metallic' })
    rig.setPaint('#ffcc00', 'matte')
    expect(rig.paintMaterial.clearcoat).toBe(0)
    rig.setPaint('#112233', 'pearl')
    expect(rig.paintMaterial.iridescence).toBeGreaterThan(0.3)
    expect(rig.paintMaterial.clearcoat).toBe(1)
    const used = new Set()
    rig.root.traverse((o) => o.isMesh && used.add(o.material))
    for (const m of used) expect(rig.materials).toContain(m)
    rig.setShadow(true)
    rig.root.traverse((o) => o.isMesh && expect(o.castShadow).toBe(true))
    rig.dispose()
  })
})

describe('traffic models', () => {
  const SIZES = {
    sedan: [4.8, 1.85, 1.45],
    hatch: [4.1, 1.78, 1.5],
    van: [5.2, 2.0, 2.3],
    pickup: [5.4, 2.0, 1.85],
    bus: [12, 2.55, 3.2],
    semi: [16, 2.55, 3.9],
  }
  for (const quality of ['high', 'low']) {
    const models = buildTrafficModels({ quality })
    it(`builds every type (${quality})`, () => {
      expect([...models.keys()].sort()).toEqual([...TRAFFIC_TYPES].sort())
    })
    for (const type of TRAFFIC_TYPES) {
      it(`${type} (${quality}) is a single indexed geometry within budget and size`, () => {
        const m = models.get(type)
        const g = m.geometry
        expect(g.index).toBeTruthy()
        for (const a of ['position', 'normal', 'color', 'aPaint', 'aLight']) expect(g.attributes[a]).toBeTruthy()
        expect(g.attributes.color.itemSize).toBe(3)
        expect(g.attributes.aPaint.itemSize).toBe(1)
        expect(g.attributes.aLight.itemSize).toBe(1)
        const tris = g.index.count / 3
        expect(tris).toBeLessThanOrEqual(type === 'bus' || type === 'semi' ? 5000 : 3000)
        for (const a of ['position', 'normal', 'color']) for (const v of g.attributes[a].array) expect(Number.isFinite(v)).toBe(true)
        const paint = new Set(g.attributes.aPaint.array), light = new Set(g.attributes.aLight.array)
        for (const v of paint) expect([0, 1]).toContain(v)
        for (const v of light) expect([0, 1, 2]).toContain(v)
        expect(paint.has(1)).toBe(true)
        expect(light.has(1)).toBe(true)
        expect(light.has(2)).toBe(true)
        g.computeBoundingBox()
        const b = g.boundingBox
        const [L, W, H] = SIZES[type]
        expect(Math.abs(b.max.z - b.min.z - L) / L).toBeLessThan(0.15)
        expect(Math.abs(b.max.x - b.min.x - W) / W).toBeLessThan(0.15)
        expect(Math.abs(b.max.y - H) / H).toBeLessThan(0.15)
        expect(Math.abs(b.min.y)).toBeLessThan(0.03)
        expect(Math.abs(b.max.z + b.min.z) / 2).toBeLessThan(0.1) // centred
        expect(m.halfL * 2).toBeCloseTo(b.max.z - b.min.z, 0)
        expect(m.halfW * 2).toBeCloseTo(b.max.x - b.min.x, 0)
        // headlights at the front (-Z), taillights at the rear (+Z)
        const pos = g.attributes.position, al = g.attributes.aLight
        let hz = 0, hn = 0, tz = 0, tn = 0
        for (let i = 0; i < al.count; i++) {
          if (al.getX(i) === 1) (hz += pos.getZ(i)), hn++
          if (al.getX(i) === 2) (tz += pos.getZ(i)), tn++
        }
        expect(hz / hn).toBeLessThan(0)
        expect(tz / tn).toBeGreaterThan(0)
      })
    }
  }
})
