// Wheels: lathed low-profile tyres (sidewall bulge + tread grooves + tread normal map),
// multi-spoke concave rims (styles: 'twin5', 'ten', 'y5', 'turbine', 'mesh7') and brake
// disc + accent-coloured calipers. Drawn as three InstancedMeshes (4 instances each):
//   tyres + rims spin and steer, brakes (disc is rotationally symmetric) only steer.
//
// Wheel local space: axle = X, outer face toward +X, centre at the origin. Left-side wheels
// use a 180° roll about Z so their face points outward and calipers stay at the rear.
import * as THREE from 'three'
import { MeshAcc, lathe, gridNormals, emitGrid } from './meshkit.js'
import { capLoop } from './parts.js'

const lin = (hex, k = 1) => {
  const c = new THREE.Color(hex)
  return [c.r * k, c.g * k, c.b * k]
}

function spokeBeam(acc, pts /* [[py, pz]] */, hwFn, faceFn, depthFn, ch = 0.0035) {
  const n = pts.length
  // cross-section strips: [left side], [left chamfer], [face], [right chamfer], [right side]
  const sec = (i) => {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    let ty = b[0] - a[0], tz = b[1] - a[1]
    const l = Math.hypot(ty, tz) || 1
    ty /= l
    tz /= l
    const ny = tz, nz = -ty // lateral direction (face normal comes out +x)
    const r = Math.hypot(p[0], p[1])
    const t = i / (n - 1)
    const hw = hwFn(t, r), fx = faceFn(t, r), dp = depthFn(t, r)
    const P = (x, s) => [x, p[0] + ny * s, p[1] + nz * s]
    return [P(fx - dp, -hw * 1.12), P(fx - ch, -hw), P(fx, -hw + ch), P(fx, hw - ch), P(fx - ch, hw), P(fx - dp, hw * 1.12)]
  }
  const S = pts.map((_, i) => sec(i))
  for (let s = 0; s < 5; s++) {
    const P = new Float64Array(n * 2 * 3)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 2; j++) {
        const v = S[i][s + j]
        P[(i * 2 + j) * 3] = v[0]
        P[(i * 2 + j) * 3 + 1] = v[1]
        P[(i * 2 + j) * 3 + 2] = v[2]
      }
    }
    const N = gridNormals(P, n, 2, false)
    emitGrid(acc, P, N, n, 2, { classify: () => 'rim', uv: () => [0, 0] })
  }
}

function polarPath(r0, r1, th0, th1, steps, curve = 1) {
  const out = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const r = r0 + (r1 - r0) * t
    const th = th0 + (th1 - th0) * Math.pow(t, curve)
    out.push([r * Math.cos(th), r * Math.sin(th)])
  }
  return out
}

/** Geometries for one wheel (shared by the 4 instances). */
export function buildWheelGeometries(ws, q) {
  const R = ws.radius, w = ws.width, hw = w / 2, rr = ws.rimRadius
  const seg = q.wheelSeg
  const hi = q.detail > 0
  // ---- tyre
  const tAcc = new MeshAcc()
  const sh = R - rr
  const tread = []
  const grooves = hi ? [-0.26, 0, 0.26] : []
  const xs = [-hw + 0.034]
  for (const g of grooves) xs.push(g * w - 0.008, g * w - 0.006, g * w + 0.006, g * w + 0.008)
  xs.push(hw - 0.034)
  for (let i = 0; i < xs.length; i++) {
    const k = (i - 1) % 4
    const inGroove = grooves.length && i > 0 && i < xs.length - 1 && (k === 1 || k === 2)
    tread.push([xs[i], inGroove ? R - 0.008 : R])
  }
  const side = hi
    ? [[0.014, -0.004], [0.004, 0.004], [-0.002, sh * 0.3], [-0.005, sh * 0.55], [-0.002, sh * 0.8], [0.006, sh - 0.016], [0.018, sh - 0.004]]
    : [[0.014, -0.004], [-0.003, sh * 0.4], [-0.002, sh * 0.8], [0.018, sh - 0.004]]
  const left = side.map(([dx, dr]) => [-hw + dx, rr + dr])
  const right = side.map(([dx, dr]) => [hw - dx, rr + dr]).reverse()
  const tyreProf = [...left, ...tread, ...right]
  lathe(tAcc, 'tyre', [tyreProf], seg, {
    uv: (p, i, f) => [p[1] >= R - 0.009 ? 0.12 + (0.76 * (p[0] + hw)) / w : 0.03, f * 24],
  })
  const tyre = tAcc.build().get('tyre')

  // ---- rim
  const rAcc = new MeshAcc({ color: 3 })
  const cSpoke = lin(ws.rimColor)
  const cLip = lin(ws.lipColor ?? ws.rimColor)
  const cBarrel = lin('#3a3c40', 0.8)
  rAcc.set({ color: cLip })
  lathe(rAcc, 'rim', [[[hw - 0.006, rr + 0.012], [hw + 0.004, rr + 0.012], [hw + 0.008, rr + 0.002], [hw + 0.007, rr - 0.012], [hw + 0.002, rr - 0.02], [hw - 0.012, rr - 0.026]]], seg)
  rAcc.set({ color: cBarrel })
  lathe(rAcc, 'rim', [[[hw - 0.012, rr - 0.026], [hw - 0.03, rr - 0.03], [-hw + 0.03, rr - 0.03], [-hw + 0.01, rr - 0.02], [-hw + 0.005, rr + 0.01]]], seg)
  rAcc.set({ color: cSpoke })
  const hubR = ws.hubR ?? 0.075
  const r0 = hubR - 0.012, r1 = rr - 0.02
  const dish = ws.dish ?? 0.035
  const xLip = hw - 0.004
  const faceFn = (t, r) => xLip - dish * Math.pow(1 - Math.min(1, Math.max(0, (r - r0) / (r1 - r0))), 1.3)
  const depthFn = (t, r) => 0.032 - 0.014 * ((r - r0) / (r1 - r0))
  const steps = hi ? 6 : 3
  const style = ws.style || 'ten'
  const n = ws.spokes || (style === 'ten' ? 10 : style === 'mesh7' || style === 'turbine' ? 7 : 5)
  const ph = Math.PI / 2 // put a spoke at the top
  for (let k = 0; k < n; k++) {
    const th = ph + (k / n) * Math.PI * 2
    switch (style) {
      case 'twin5': {
        for (const s of [-1, 1]) {
          const path = polarPath(r0, r1, th + s * 0.07, th + s * 0.17, steps)
          spokeBeam(rAcc, path, (t) => 0.0115 - 0.002 * t, faceFn, depthFn)
        }
        break
      }
      case 'y5': {
        const rs = r0 + (r1 - r0) * 0.5
        spokeBeam(rAcc, polarPath(r0, rs + 0.012, th, th, steps), (t) => 0.02 - 0.003 * t, faceFn, depthFn)
        for (const s of [-1, 1]) spokeBeam(rAcc, polarPath(rs, r1, th, th + s * 0.2, steps, 0.8), (t) => 0.0115 - 0.002 * t, faceFn, depthFn)
        break
      }
      case 'turbine': {
        spokeBeam(rAcc, polarPath(r0, r1, th, th + 0.55, steps + 2, 1.2), (t) => 0.017 - 0.006 * t, faceFn, depthFn)
        break
      }
      case 'mesh7': {
        spokeBeam(rAcc, polarPath(r0, r1, th, th, steps), (t) => 0.016 - 0.004 * t, faceFn, depthFn)
        for (const s of [-1, 1]) spokeBeam(rAcc, polarPath(r0 + (r1 - r0) * 0.42, r1, th, th + s * 0.24, steps), () => 0.006, faceFn, (t, r) => depthFn(t, r) * 0.7)
        break
      }
      default: {
        // ten: alternating slightly wider/narrower spokes
        const wide = k % 2 === 0
        spokeBeam(rAcc, polarPath(r0, r1, th, th, steps), (t) => (wide ? 0.0145 : 0.0115) - 0.003 * t, faceFn, depthFn)
      }
    }
  }
  // hub cap + nuts
  const xh = faceFn(0, r0)
  rAcc.set({ color: lin(ws.hubColor ?? ws.rimColor, 0.85) })
  lathe(rAcc, 'rim', [[[xh - 0.03, hubR], [xh - 0.004, hubR], [xh + 0.004, hubR * 0.86], [xh + 0.008, hubR * 0.4], [xh + 0.009, 0]]], hi ? 28 : 12)
  if (ws.centerLock) {
    rAcc.set({ color: lin(ws.caliperColor) })
    const nut = new THREE.CylinderGeometry(0.034, 0.038, 0.03, 6)
    rAcc.addGeometry('rim', nut, { matrix: new THREE.Matrix4().makeRotationZ(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(xh + 0.018, 0, 0)) })
    nut.dispose()
  } else if (hi) {
    rAcc.set({ color: cLip })
    const nut = new THREE.CylinderGeometry(0.0085, 0.0095, 0.016, 6)
    for (let k = 0; k < 5; k++) {
      const a = ph + Math.PI / 5 + (k / 5) * Math.PI * 2
      const m = new THREE.Matrix4().makeRotationZ(-Math.PI / 2)
      m.premultiply(new THREE.Matrix4().makeTranslation(xh + 0.01, Math.cos(a) * hubR * 0.6, Math.sin(a) * hubR * 0.6))
      rAcc.addGeometry('rim', nut, { matrix: m })
    }
    nut.dispose()
  }
  const rim = rAcc.build().get('rim')

  // ---- brakes: disc + hat + caliper
  const bAcc = new MeshAcc({ color: 3 })
  const discR = ws.discR ?? rr - 0.05
  const xd = xh - 0.045
  const th = 0.032
  bAcc.set({ color: lin('#8b8e92') })
  const dseg = hi ? 40 : 16
  const ringsFace = hi ? [[xd, discR], [xd, discR - 0.004], [xd - 0.001, discR - 0.006], [xd, discR - 0.008], [xd, 0.11]] : [[xd, discR], [xd, 0.11]]
  lathe(bAcc, 'brake', [[[xd - th, discR], [xd, discR]], ringsFace], dseg)
  bAcc.set({ color: lin('#4a4c50') })
  lathe(bAcc, 'brake', [[[xd, 0.11], [xd + 0.022, 0.1], [xd + 0.024, 0.0]]], hi ? 20 : 10)
  // caliper: partial lathe centred on +Z (rear), at axle height
  bAcc.set({ color: lin(ws.caliperColor) })
  const arc = 1.05, phase = Math.PI / 2 - arc / 2
  const ci = discR - 0.052, co = Math.min(discR + 0.012, rr - 0.036)
  const cx0 = xd - th - 0.022, cx1 = xd + 0.028
  const cseg = hi ? 10 : 4
  const runs = [
    [[cx1, co], [cx1 + 0.004, co - 0.01], [cx1 + 0.004, ci + 0.01], [cx1, ci]],
    [[cx1, ci], [cx0, ci]],
    [[cx0, ci], [cx0, co]],
    [[cx0, co], [cx1, co]],
  ]
  lathe(bAcc, 'brake', runs, cseg, { arc, phase })
  const loopAt = (a) => {
    const c = Math.cos(a), s = Math.sin(a)
    return [[cx1, co * c, co * s], [cx1, ci * c, ci * s], [cx0, ci * c, ci * s], [cx0, co * c, co * s]]
  }
  capLoop(bAcc, 'brake', loopAt(phase), [0, Math.sin(phase), -Math.cos(phase)])
  capLoop(bAcc, 'brake', loopAt(phase + arc), [0, -Math.sin(phase + arc), Math.cos(phase + arc)])
  const brake = bAcc.build().get('brake')
  return { tyre, rim, brake }
}

const _q = new THREE.Quaternion()
const _qs = new THREE.Quaternion()
const _qf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
const _qr = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _m = new THREE.Matrix4()
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)

/** Four wheels as three InstancedMeshes. positions: [{ x, y, z, front, widthScale }] */
export class WheelSet {
  constructor({ geos, materials, positions, radius }) {
    this.positions = positions
    this.radius = radius
    this.tyres = new THREE.InstancedMesh(geos.tyre, materials.rubber, 4)
    this.rims = new THREE.InstancedMesh(geos.rim, materials.rim, 4)
    this.brakes = new THREE.InstancedMesh(geos.brake, materials.brake, 4)
    this.tyres.name = 'Tyres'
    this.rims.name = 'Rims'
    this.brakes.name = 'Brakes'
    this.meshes = [this.tyres, this.rims, this.brakes]
    for (const m of this.meshes) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.spin = 0
    this.steer = 0
    this.update(0, 0, 0)
    for (const m of this.meshes) {
      m.computeBoundingSphere()
      m.boundingSphere.radius += 0.05
    }
  }

  /** speed m/s (forward), steerAngle rad (+ = fronts turn right). */
  update(dt, speed, steerAngle) {
    this.spin = (this.spin + (speed * dt) / this.radius) % (Math.PI * 2)
    this.steer = steerAngle
    for (let i = 0; i < 4; i++) {
      const w = this.positions[i]
      const left = w.x < 0
      _qs.setFromAxisAngle(Y, w.front ? -steerAngle : 0)
      if (left) _qs.multiply(_qf)
      _p.set(w.x, w.y, w.z)
      _s.set(w.widthScale || 1, 1, 1)
      _m.compose(_p, _qs, _s)
      this.brakes.setMatrixAt(i, _m)
      _qr.setFromAxisAngle(X, left ? this.spin : -this.spin)
      _q.copy(_qs).multiply(_qr)
      _m.compose(_p, _q, _s)
      this.tyres.setMatrixAt(i, _m)
      this.rims.setMatrixAt(i, _m)
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true
  }
}
