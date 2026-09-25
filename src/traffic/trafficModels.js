// Stylised modern traffic vehicles built with the same loft toolkit as the player cars, at a
// much lower resolution. Each type is ONE merged, indexed BufferGeometry with attributes:
//   position, normal, color (linear RGB), aPaint (1 = per-instance paint), aLight (1 head, 2 tail)
// Front faces -Z, origin at ground centre, wheels baked in (static).
import * as THREE from 'three'
import { MeshAcc } from '../vehicle/model/meshkit.js'
import { BodyShape, Cabin } from '../vehicle/model/bodyGen.js'
import { archLiners, decals } from '../vehicle/model/parts.js'

export const TRAFFIC_TYPES = ['sedan', 'hatch', 'van', 'pickup', 'bus', 'semi']

const Q = {
  high: { ds: 0.26, endSteps: 3, archSteps: 5, ringUp: 7, ringDn: 3, cabDs: 0.26, cabSide: 2, cabTop: 4, seg: 8, wheelSeg: 12, detail: 0, decalStep: 0.2, decalMaxSide: 6, decalRingStep: 0.3, decalMaxRings: 2, decalGap: 2.5 },
  low: { ds: 0.4, endSteps: 2, archSteps: 3, ringUp: 5, ringDn: 2, cabDs: 0.4, cabSide: 1, cabTop: 3, seg: 6, wheelSeg: 8, detail: 0, decalStep: 0.35, decalMaxSide: 4, decalRingStep: 0.5, decalMaxRings: 1, decalGap: 3.5 },
}

const lin = (hex, k = 1) => {
  const c = new THREE.Color(hex)
  return [c.r * k, c.g * k, c.b * k]
}

// how each geometry group is coloured / flagged in the merged traffic mesh
const LOOK = {
  paint: { color: [1, 1, 1], paint: 1, light: 0 },
  white: { color: lin('#e4e5e2'), paint: 0, light: 0 },
  glass: { color: lin('#10161c'), paint: 0, light: 0 },
  trim: { color: lin('#17181a'), paint: 0, light: 0 },
  carbon: { color: lin('#1c1d20'), paint: 0, light: 0 },
  chrome: { color: lin('#b9bdc3'), paint: 0, light: 0 },
  rim: { color: lin('#a3a7ad'), paint: 0, light: 0 },
  tyre: { color: lin('#141415'), paint: 0, light: 0 },
  head: { color: lin('#fff4dc'), paint: 0, light: 1 },
  tail: { color: lin('#d01018'), paint: 0, light: 2 },
  amber: { color: lin('#ff9a1a'), paint: 0, light: 0 },
}

function mergeTraffic(acc) {
  const pos = [], nrm = [], col = [], pnt = [], lgt = [], idx = []
  for (const [name, g] of acc.groups) {
    if (!g.idx.length) continue
    const look = LOOK[name] || LOOK.trim
    const base = pos.length / 3
    const n = g.pos.length / 3
    for (let i = 0; i < n; i++) {
      pos.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2])
      nrm.push(g.nrm[i * 3], g.nrm[i * 3 + 1], g.nrm[i * 3 + 2])
      col.push(look.color[0], look.color[1], look.color[2])
      pnt.push(look.paint)
      lgt.push(look.light)
    }
    for (const k of g.idx) idx.push(k + base)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
  geo.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(pnt), 1))
  geo.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(lgt), 1))
  const count = pos.length / 3
  geo.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1))
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  return geo
}

/** Static wheel: closed cylinder tyre + hubcap disc on the outer face. */
function wheel(acc, x, y, z, r, w, seg, { hub = 'rim', hubR = 0.62 } = {}) {
  const t = new THREE.CylinderGeometry(r, r, w, seg, 1, false)
  t.rotateZ(Math.PI / 2)
  t.translate(x, y, z)
  acc.addGeometry('tyre', t)
  t.dispose()
  const c = new THREE.CircleGeometry(r * hubR, seg)
  c.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2)
  c.translate(x + Math.sign(x) * (w / 2 + 0.004), y, z)
  acc.addGeometry(hub, c)
  c.dispose()
}

function box(acc, group, cx, cy, cz, sx, sy, sz) {
  const b = new THREE.BoxGeometry(sx, sy, sz)
  b.translate(cx, cy, cz)
  acc.addGeometry(group, b)
  b.dispose()
}

/** Loft body (+ optional cabin) + arch liners + decals + wheels for one design. */
function buildVehicle(spec, q) {
  const acc = new MeshAcc()
  const body = new BodyShape(spec, q)
  const target = body.build(acc)
  if (spec.cabin) new Cabin(spec, body).build(acc, q)
  const w = spec.wheels
  const wx = spec.halfWidth - w.width / 2 - (w.inset ?? 0.03)
  const wheelsInfo = body.arches.map((A) => ({ x: wx, halfWidth: w.width / 2, z: A.z }))
  const ctx = { acc, body, target, q, spec, wheels: wheelsInfo }
  archLiners(ctx)
  decals(ctx, spec.decals || [])
  if (spec.extra) spec.extra(ctx)
  for (const A of body.arches) for (const s of [-1, 1]) wheel(acc, s * wx, w.radius, A.z, w.radius, w.width, q.wheelSeg)
  for (const z of spec.extraAxles || []) for (const s of [-1, 1]) wheel(acc, s * wx, w.radius, z, w.radius, w.width, q.wheelSeg)
  return acc
}

// ---------------------------------------------------------------------------------------------
// designs

function sedan() {
  const L = 2.4, W = 0.925, WB = 2.85, R = 0.33
  return {
    halfL: L, halfW: W, height: 1.45,
    spec: {
      wheelbase: WB, halfWidth: W,
      wheels: { radius: R, width: 0.22, archR: [R + 0.05, R + 0.05], inset: 0.03 },
      body: {
        zNose: -L, zTail: L,
        nose: { len: 0.2, m: 2.6, yc: 0.55 },
        tail: { len: 0.14, m: 3, yc: 0.6 },
        W: [[-L, 0.8], [-L + 0.3, 0.9], [-1.4, 0.92], [0, W], [1.5, 0.92], [L - 0.2, 0.89], [L, 0.84]],
        top: [[-L, 0.66], [-L + 0.25, 0.75], [-1.4, 0.84], [-0.95, 0.9], [0.9, 0.94], [1.6, 0.98], [L - 0.2, 1.0], [L, 0.98]],
        mid: [[-L, 0.52], [0, 0.62], [L, 0.66]],
        bot: [[-L, 0.26], [-L + 0.3, 0.18], [L - 0.35, 0.18], [L, 0.3]],
        nUp: 3.2, nDn: 4, tumble: 0.05, tuck: 0.04,
        crown: [[-1.5, 0.03], [-WB / 2, 0.05], [-0.8, 0.02], [0.9, 0.02], [WB / 2, 0.04]],
      },
      cabin: {
        z0: -1.02, zRoofF: -0.32, zRoofR: 0.75, zC: 1.0, z1: 1.5,
        roof: [[-1.02, 0.9], [-0.32, 1.42], [0.25, 1.45], [0.75, 1.42], [1.5, 1.0]],
        W: [[-1.02, 0.8], [0.25, 0.79], [1.5, 0.74]],
        tumble: 0.2, n: 3, tc: 0.3, pillar: 0.05,
        bPillar: { z: 0.28, w: 0.05 },
      },
      decals: [
        { frame: 'front', shape: ['rquad', [[0.42, 0.66], [0.78, 0.62], [0.8, 0.72], [0.46, 0.75]], 5], g: 'head', gap: 0.005, mirror: true },
        { frame: 'front', shape: ['rquad', [[-0.36, 0.52], [0.36, 0.52], [0.34, 0.66], [-0.34, 0.66]], 5], g: 'trim', gap: 0.004 },
        { frame: 'front', shape: ['rquad', [[-0.6, 0.3], [0.6, 0.3], [0.56, 0.4], [-0.56, 0.4]], 5], g: 'trim', gap: 0.004 },
        { frame: 'rear', shape: ['rquad', [[0.5, 0.84], [0.84, 0.83], [0.83, 0.93], [0.5, 0.94]], 5], g: 'tail', gap: 0.005, mirror: true },
        { frame: 'rear', shape: ['rquad', [[-0.7, 0.3], [0.7, 0.3], [0.7, 0.4], [-0.7, 0.4]], 6], g: 'trim', gap: 0.004 },
      ],
    },
  }
}

function hatch() {
  const L = 2.05, W = 0.89, WB = 2.6, R = 0.31
  return {
    halfL: L, halfW: W, height: 1.5,
    spec: {
      wheelbase: WB, halfWidth: W,
      wheels: { radius: R, width: 0.21, archR: [R + 0.05, R + 0.05], inset: 0.03 },
      body: {
        zNose: -L, zTail: L,
        nose: { len: 0.2, m: 2.6, yc: 0.55 },
        tail: { len: 0.1, m: 3, yc: 0.6 },
        W: [[-L, 0.78], [-L + 0.3, 0.86], [-1.0, 0.885], [0.5, W], [L - 0.2, 0.87], [L, 0.84]],
        top: [[-L, 0.66], [-L + 0.25, 0.76], [-1.2, 0.86], [-0.85, 0.92], [1.2, 0.98], [L - 0.15, 1.0], [L, 0.98]],
        mid: [[-L, 0.5], [0, 0.62], [L, 0.66]],
        bot: [[-L, 0.26], [-L + 0.3, 0.18], [L - 0.3, 0.18], [L, 0.32]],
        nUp: 3.2, nDn: 4, tumble: 0.05, tuck: 0.04,
        crown: [[-1.3, 0.03], [-WB / 2, 0.05], [-0.8, 0.02], [0.9, 0.02], [WB / 2, 0.05]],
      },
      cabin: {
        z0: -0.92, zRoofF: -0.2, zRoofR: 1.5, zC: 1.12, z1: 1.98,
        roof: [[-0.92, 0.92], [-0.2, 1.47], [0.6, 1.5], [1.5, 1.47], [1.98, 1.02]],
        W: [[-0.92, 0.78], [0.5, 0.77], [1.98, 0.72]],
        tumble: 0.18, n: 3.2, tc: 0.3, pillar: 0.05,
        bPillar: { z: 0.35, w: 0.05 },
      },
      decals: [
        { frame: 'front', shape: ['rquad', [[0.4, 0.66], [0.76, 0.62], [0.78, 0.73], [0.44, 0.76]], 5], g: 'head', gap: 0.005, mirror: true },
        { frame: 'front', shape: ['rquad', [[-0.4, 0.3], [0.4, 0.3], [0.36, 0.5], [-0.36, 0.5]], 5], g: 'trim', gap: 0.004 },
        { frame: 'rear', shape: ['rquad', [[0.56, 0.84], [0.82, 0.84], [0.8, 0.96], [0.58, 0.96]], 5], g: 'tail', gap: 0.005, mirror: true },
        { frame: 'rear', shape: ['rquad', [[-0.7, 0.3], [0.7, 0.3], [0.7, 0.4], [-0.7, 0.4]], 6], g: 'trim', gap: 0.004 },
      ],
    },
  }
}

function van() {
  const L = 2.6, W = 1.0, WB = 3.3, R = 0.36
  return {
    halfL: L, halfW: W, height: 2.3,
    spec: {
      wheelbase: WB, halfWidth: W,
      wheels: { radius: R, width: 0.23, archR: [R + 0.06, R + 0.06], inset: 0.04 },
      body: {
        zNose: -L, zTail: L,
        nose: { len: 0.18, m: 2.6, yc: 0.45 },
        tail: { len: 0.08, m: 4, yc: 0.5 },
        W: [[-L, 0.88], [-L + 0.35, 0.97], [-1.5, W], [L, 0.99]],
        top: [[-L, 0.78], [-L + 0.3, 0.98], [-1.95, 1.12], [-1.85, 1.2], [-1.25, 2.2], [-1.0, 2.28], [L - 0.2, 2.3], [L, 2.28]],
        mid: [[-L, 0.62], [-1.5, 1.05], [L, 1.15]],
        bot: [[-L, 0.3], [-L + 0.3, 0.24], [L - 0.2, 0.26], [L, 0.32]],
        nUp: [[-L, 3], [-1.9, 4], [-1.0, 6], [L, 7]],
        nDn: 6, tumble: 0.04, tuck: 0.03,
        crown: [[-2.2, 0.02], [-1.65, 0.04], [-1.4, 0.0]],
      },
      decals: [
        { frame: { d: [0, -0.62, 1], o: [0, 1.66, -1.55] }, shape: ['rquad', [[-0.8, -0.4], [0.8, -0.4], [0.72, 0.38], [-0.72, 0.38]], 8], g: 'glass', gap: 0.006 },
        { frame: 'side', shape: ['rquad', [[-1.62, 1.28], [-0.7, 1.28], [-0.7, 1.95], [-1.3, 1.95]], 6], g: 'glass', gap: 0.004, mirror: true },
        { frame: 'front', shape: ['rquad', [[0.5, 0.88], [0.9, 0.86], [0.9, 1.0], [0.55, 1.02]], 5], g: 'head', gap: 0.005, mirror: true },
        { frame: 'front', shape: ['rquad', [[-0.45, 0.7], [0.45, 0.7], [0.45, 0.95], [-0.45, 0.95]], 5], g: 'trim', gap: 0.004 },
        { frame: 'front', shape: ['rquad', [[-0.95, 0.3], [0.95, 0.3], [0.95, 0.5], [-0.95, 0.5]], 6], g: 'trim', gap: 0.004 },
        { frame: 'rear', shape: ['rquad', [[0.84, 0.75], [0.96, 0.75], [0.96, 1.45], [0.84, 1.45]], 5], g: 'tail', gap: 0.005, mirror: true },
        { frame: 'rear', shape: ['rquad', [[0.07, 1.34], [0.8, 1.34], [0.8, 2.02], [0.07, 2.02]], 5], g: 'glass', gap: 0.004, mirror: true },
        { frame: 'rear', shape: ['rquad', [[-0.98, 0.3], [0.98, 0.3], [0.98, 0.5], [-0.98, 0.5]], 6], g: 'trim', gap: 0.004 },
        { frame: 'side', shape: ['strip', [[-2.2, 0.36], [2.3, 0.36]], 0.07], g: 'trim', gap: 0.004, mirror: true },
      ],
    },
  }
}

function pickup() {
  const L = 2.7, W = 1.0, WB = 3.45, R = 0.4
  return {
    halfL: L, halfW: W, height: 1.88,
    spec: {
      wheelbase: WB, halfWidth: W,
      wheels: { radius: R, width: 0.27, archR: [R + 0.06, R + 0.06], inset: 0.03 },
      body: {
        zNose: -L, zTail: L,
        nose: { len: 0.14, m: 3.4, yc: 0.5 },
        tail: { len: 0.06, m: 4, yc: 0.5 },
        W: [[-L, 0.9], [-L + 0.3, 0.98], [-1.5, W], [L, 0.99]],
        top: [[-L, 1.0], [-L + 0.2, 1.16], [-1.35, 1.24], [0.4, 1.26], [L, 1.26]],
        mid: [[-L, 0.78], [0, 0.9], [L, 0.92]],
        bot: [[-L, 0.42], [-L + 0.3, 0.34], [L - 0.2, 0.36], [L, 0.44]],
        nUp: [[-L, 4], [0, 5], [L, 6]],
        nDn: 5, tumble: 0.03, tuck: 0.04,
        crown: [[-2.2, 0.02], [-WB / 2, 0.04], [-1.0, 0.0]],
        topFeatures: [{ z0: 0.62, z1: L - 0.1, x1: 0.86, h: -0.46, ez: 0.035, ex: 0.04 }],
      },
      cabin: {
        z0: -1.4, zRoofF: -0.72, zRoofR: 0.3, zC: 0.36, z1: 0.56,
        roof: [[-1.4, 1.2], [-0.72, 1.84], [0.3, 1.87], [0.46, 1.84], [0.56, 1.28]],
        W: [[-1.4, 0.86], [0, 0.84], [0.56, 0.84]],
        tumble: 0.12, n: 4, tc: 0.3, pillar: 0.05,
        bPillar: { z: -0.18, w: 0.05 },
        cPillarMat: 'paint',
      },
      decals: [
        { frame: 'front', shape: ['rquad', [[-0.62, 0.72], [0.62, 0.72], [0.62, 1.12], [-0.62, 1.12]], 6], g: 'chrome', gap: 0.004 },
        { frame: 'front', shape: ['rquad', [[-0.58, 0.75], [0.58, 0.75], [0.58, 1.09], [-0.58, 1.09]], 6], g: 'trim', gap: 0.006 },
        { frame: 'front', shape: ['rquad', [[0.66, 0.96], [0.94, 0.96], [0.94, 1.1], [0.66, 1.1]], 5], g: 'head', gap: 0.005, mirror: true },
        { frame: 'front', shape: ['rquad', [[-0.98, 0.42], [0.98, 0.42], [0.98, 0.62], [-0.98, 0.62]], 6], g: 'chrome', gap: 0.004 },
        { frame: 'rear', shape: ['rquad', [[0.86, 0.8], [0.97, 0.8], [0.97, 1.18], [0.86, 1.18]], 5], g: 'tail', gap: 0.005, mirror: true },
        { frame: 'rear', shape: ['rquad', [[-0.98, 0.42], [0.98, 0.42], [0.98, 0.58], [-0.98, 0.58]], 6], g: 'chrome', gap: 0.004 },
      ],
    },
  }
}

function bus() {
  const L = 6.0, W = 1.275, R = 0.52
  const zf = -3.55, zr = 2.75
  return {
    halfL: L, halfW: W, height: 3.2,
    spec: {
      halfWidth: W,
      arches: [{ z: zf, R: R + 0.07 }, { z: zr, R: R + 0.07 }],
      wheels: { radius: R, width: 0.3, inset: 0.05 },
      body: {
        zNose: -L, zTail: L,
        nose: { len: 0.13, m: 4, yc: 0.5 },
        tail: { len: 0.12, m: 4, yc: 0.5 },
        W: [[-L, 1.2], [-L + 0.4, 1.27], [0, W], [L, 1.27]],
        top: [[-L, 2.95], [-L + 0.35, 3.17], [-L + 0.8, 3.2], [L, 3.2]],
        mid: 1.7,
        bot: [[-L, 0.42], [-L + 0.4, 0.36], [L - 0.4, 0.36], [L, 0.45]],
        nUp: 9, nDn: 9, tumble: 0.02, tuck: 0.01,
      },
      decals: [
        { frame: 'front', shape: ['rquad', [[-1.1, 1.25], [1.1, 1.25], [1.06, 2.92], [-1.06, 2.92]], 10], g: 'glass', gap: 0.008 },
        { frame: 'side', shape: ['quad', [[-5.2, 1.98], [5.6, 1.98], [5.6, 2.86], [-5.2, 2.86]], 3, 12], g: 'glass', gap: 0.005, mirror: true },
        { frame: 'side', shape: ['strip', [[-5.9, 1.55], [5.9, 1.55]], 0.05, 2, 0.6], g: 'white', gap: 0.005, mirror: true },
        { frame: 'side', shape: ['rquad', [[-5.45, 0.42], [-4.55, 0.42], [-4.55, 2.9], [-5.45, 2.9]], 10], g: 'glass', gap: 0.008 },
        { frame: 'front', shape: ['rquad', [[0.7, 0.62], [1.18, 0.62], [1.18, 0.82], [0.72, 0.82]], 5], g: 'head', gap: 0.006, mirror: true },
        { frame: 'front', shape: ['rquad', [[-1.2, 0.4], [1.2, 0.4], [1.2, 0.56], [-1.2, 0.56]], 6], g: 'trim', gap: 0.005 },
        { frame: 'rear', shape: ['rquad', [[1.02, 0.7], [1.2, 0.7], [1.2, 1.5], [1.02, 1.5]], 5], g: 'tail', gap: 0.006, mirror: true },
        { frame: 'rear', shape: ['rquad', [[-0.95, 2.1], [0.95, 2.1], [0.95, 2.95], [-0.95, 2.95]], 8], g: 'glass', gap: 0.005 },
        { frame: 'rear', shape: ['rquad', [[-1.2, 0.42], [1.2, 0.42], [1.2, 0.6], [-1.2, 0.6]], 6], g: 'trim', gap: 0.005 },
      ],
    },
  }
}

function semiTractor(q) {
  // cab-over tractor: cab box with arches for the steer axle
  const W = 1.25, R = 0.5
  const zf = -6.95
  return {
    halfWidth: W,
    arches: [{ z: zf, R: R + 0.07 }],
    wheels: { radius: R, width: 0.3, inset: 0.05 },
    body: {
      zNose: -8.0, zTail: -5.75,
      nose: { len: 0.12, m: 4, yc: 0.5 },
      tail: { len: 0.06, m: 5, yc: 0.5 },
      W: [[-8.0, 1.18], [-7.7, 1.25], [-5.75, 1.25]],
      top: [[-8.0, 2.9], [-7.8, 3.08], [-7.4, 3.25], [-6.4, 3.9], [-5.75, 3.92]],
      mid: 1.8,
      bot: [[-8.0, 0.55], [-7.7, 0.45], [-5.75, 0.5]],
      nUp: 7, nDn: 8, tumble: 0.03, tuck: 0.01,
    },
    decals: [
      { frame: { d: [0, -0.15, 1], o: [0, 2.35, -8.0] }, shape: ['rquad', [[-1.06, -0.5], [1.06, -0.5], [1.02, 0.44], [-1.02, 0.44]], 10], g: 'glass', gap: 0.008 },
      { frame: 'side', shape: ['rquad', [[-7.65, 1.9], [-6.75, 1.9], [-6.75, 2.72], [-7.5, 2.72]], 6], g: 'glass', gap: 0.005, mirror: true },
      { frame: 'front', shape: ['rquad', [[-0.95, 0.95], [0.95, 0.95], [0.95, 1.7], [-0.95, 1.7]], 8], g: 'trim', gap: 0.006 },
      ...[1.1, 1.26, 1.42, 1.58].map((y) => ({ frame: 'front', shape: ['strip', [[-0.88, y], [0.88, y]], 0.025, 2, 0.4], g: 'chrome', gap: 0.009 })),
      { frame: 'front', shape: ['rquad', [[0.78, 0.62], [1.18, 0.62], [1.18, 0.8], [0.8, 0.8]], 5], g: 'head', gap: 0.006, mirror: true },
      { frame: 'front', shape: ['rquad', [[-1.22, 0.46], [1.22, 0.46], [1.22, 0.6], [-1.22, 0.6]], 6], g: 'trim', gap: 0.005 },
      { frame: 'front', shape: ['strip', [[-0.7, 3.55], [0.7, 3.55]], 0.03, 2, 0.3], g: 'amber', gap: 0.006 },
    ],
  }
}

function semiTrailer() {
  const W = 1.27
  return {
    halfWidth: W,
    arches: [],
    wheels: { radius: 0.5, width: 0.3 },
    body: {
      zNose: -5.35, zTail: 8.0,
      nose: { len: 0.06, m: 6, yc: 0.5 },
      tail: { len: 0.04, m: 6, yc: 0.5 },
      W: W,
      top: 3.9,
      mid: 2.55,
      bot: 1.25,
      nUp: 14, nDn: 14, tumble: 0, tuck: 0,
    },
    decals: [
      { frame: 'rear', shape: ['rquad', [[0.9, 1.3], [1.2, 1.3], [1.2, 1.45], [0.9, 1.45]], 5], g: 'tail', gap: 0.006, mirror: true },
      { frame: 'side', shape: ['strip', [[-5.2, 1.5], [7.9, 1.5]], 0.14, 2, 1.0], g: 'paint', gap: 0.005, mirror: true },
    ],
  }
}

const DESIGNS = { sedan, hatch, van, pickup, bus }

/**
 * @param {{quality?: 'high'|'low'}} opts
 * @returns {Map<string, {geometry: THREE.BufferGeometry, halfL: number, halfW: number, height: number}>}
 */
export function buildTrafficModels({ quality = 'high' } = {}) {
  const q = Q[quality] || Q.high
  const out = new Map()
  for (const type of TRAFFIC_TYPES) {
    let acc, halfL, halfW, height
    if (type === 'semi') {
      const qq = { ...q, ds: q.ds * 2.4, endSteps: q.endSteps + 2 }
      acc = semiBuild(qq)
      halfL = 8.0
      halfW = 1.275
      height = 3.92
    } else {
      const d = DESIGNS[type]()
      const qq = type === 'bus' ? { ...q, ds: q.ds * 2.2, endSteps: q.endSteps + 2 } : type === 'van' ? { ...q, endSteps: q.endSteps + 1 } : q
      acc = buildVehicle(d.spec, qq)
      halfL = d.halfL
      halfW = d.halfW
      height = d.height
    }
    const geometry = mergeTraffic(acc)
    geometry.name = `traffic_${type}`
    out.set(type, { geometry, halfL, halfW, height })
  }
  return out
}

function semiBuild(q) {
  // wrap semi() so the trailer's body can be recoloured: build tractor first, note paint size
  const acc = new MeshAcc()
  const R = 0.5, wx = 1.25 - 0.15 - 0.05
  const tSpec = semiTractor(q)
  const tBody = new BodyShape(tSpec, q)
  const tTarget = tBody.build(acc)
  archLiners({ acc, body: tBody, target: tTarget, q, spec: tSpec, wheels: [{ x: wx, halfWidth: 0.15, z: tBody.arches[0].z }] })
  decals({ acc, body: tBody, target: tTarget, q, spec: tSpec }, tSpec.decals)
  box(acc, 'trim', 0, 0.95, -3.1, 0.9, 0.3, 5.3)
  box(acc, 'trim', 0, 1.18, -2.6, 1.7, 0.08, 1.1)
  for (const s of [-1, 1]) {
    const t = new THREE.CylinderGeometry(0.3, 0.3, 1.2, q.wheelSeg, 1, false)
    t.rotateX(Math.PI / 2)
    t.translate(s * 0.86, 0.72, -4.85)
    acc.addGeometry('chrome', t)
    t.dispose()
  }
  for (const s of [-1, 1]) box(acc, 'trim', s * wx, 1.08, -2.62, 0.36, 0.05, 2.35)
  for (const z of [tBody.arches[0].z, -3.3, -1.95]) for (const s of [-1, 1]) wheel(acc, s * wx, R, z, R, 0.3, q.wheelSeg, { hubR: 0.5 })
  // trailer: build into a separate accumulator so its shell can be white, then append
  const rAcc = new MeshAcc()
  const rSpec = semiTrailer()
  const rBody = new BodyShape(rSpec, q)
  const rTarget = rBody.build(rAcc)
  decals({ acc: rAcc, body: rBody, target: rTarget, q, spec: rSpec }, rSpec.decals.slice(0, 1))
  // shell → white
  const shell = rAcc.groups.get('paint')
  rAcc.groups.delete('paint')
  const white = rAcc.group('white')
  appendGroup(white, shell)
  decals({ acc: rAcc, body: rBody, target: rTarget, q, spec: rSpec }, rSpec.decals.slice(1))
  box(rAcc, 'trim', 0, 1.1, 6.45, 1.6, 0.2, 2.6)
  for (const z of [5.8, 7.1]) for (const s of [-1, 1]) wheel(rAcc, s * wx, R, z, R, 0.3, q.wheelSeg, { hubR: 0.5 })
  for (const s of [-1, 1]) box(rAcc, 'trim', s * 0.7, 0.72, -1.3, 0.1, 1.0, 0.1)
  box(rAcc, 'trim', 0, 0.62, 7.9, 2.3, 0.1, 0.06)
  for (const [name, g] of rAcc.groups) appendGroup(acc.group(name), g)
  return acc
}

function appendGroup(to, from) {
  if (!from) return
  const base = to.pos.length / 3
  for (let i = 0; i < from.pos.length; i++) to.pos.push(from.pos[i])
  for (let i = 0; i < from.nrm.length; i++) to.nrm.push(from.nrm[i])
  for (let i = 0; i < from.uv.length; i++) to.uv.push(from.uv[i])
  for (const k of from.idx) to.idx.push(k + base)
}
