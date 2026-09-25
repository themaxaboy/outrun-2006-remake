// Add-on parts for the procedural cars: arch liners, splitter, side skirts, diffuser, wings,
// mirrors, exhaust tips and ray-projected "decal" details (lights, intakes, vents).
import * as THREE from 'three'
import { gridNormals, emitGrid, lathe, projectDecal, frameFrom, shapeEllipse, shapeQuad, shapeStrip } from './meshkit.js'

const FRAMES = {
  front: { a: [1, 0, 0], b: [0, 1, 0], d: [0, 0, 1] },
  rear: { a: [1, 0, 0], b: [0, 1, 0], d: [0, 0, -1] },
  side: { a: [0, 0, 1], b: [0, 1, 0], d: [-1, 0, 0] },
  top: { a: [1, 0, 0], b: [0, 0, 1], d: [0, -1, 0] },
}

function frameOf(f) {
  if (typeof f === 'string') return FRAMES[f]
  return frameFrom(f.d, f.up || [0, 1, 0], f.o || [0, 0, 0])
}

function shapeOf(s, q) {
  const [kind, ...a] = s
  const hi = q.detail > 0
  const step = q.decalStep ?? (hi ? 0.022 : 0.06)
  const maxSide = q.decalMaxSide ?? 24
  const ringStep = q.decalRingStep ?? (hi ? 0.035 : 0.1)
  const maxRings = q.decalMaxRings ?? 10
  const minSide = hi ? 8 : q.decalStep ? 2 : 4
  switch (kind) {
    case 'ellipse': {
      const [cx, cy, rx, ry, o = {}] = a
      const per = 2 * Math.PI * Math.max(rx, ry)
      const segs = 4 * Math.round(Math.min(maxSide, Math.max(minSide * 0.6, per / 4 / step)))
      const rings = Math.round(Math.min(maxRings, Math.max(hi ? 3 : 1, Math.max(rx, ry) / ringStep)))
      return shapeEllipse(cx, cy, rx, ry, { segs, rings, ...o })
    }
    case 'rquad': {
      // rounded quad: corners [bl, br, tr, tl], superellipse exponent n; tessellation follows size
      const [quad, n = 6] = a
      let per = 0, span = 0
      for (let i = 0; i < 4; i++) {
        const p = quad[i], r = quad[(i + 1) % 4]
        per += Math.hypot(r[0] - p[0], r[1] - p[1])
        span = Math.max(span, Math.hypot(quad[(i + 2) % 4][0] - p[0], quad[(i + 2) % 4][1] - p[1]))
      }
      const segs = 4 * Math.round(Math.min(maxSide, Math.max(minSide, per / 4 / step)))
      const rings = Math.round(Math.min(maxRings, Math.max(hi ? 3 : 1, span / 2 / ringStep)))
      return shapeEllipse(0, 0, 1, 1, { n, quad, segs, rings })
    }
    case 'quad': {
      const [quad, rows = 3, cols = 6] = a
      return shapeQuad(quad, hi ? rows : 2, hi ? cols : Math.max(2, Math.ceil(cols / 2)))
    }
    case 'strip': {
      const [line, hw, cols = 2, stp] = a
      return shapeStrip(line, hw, cols, stp ?? (q.decalStep ? q.decalStep * 2 : hi ? 0.03 : 0.08))
    }
    default:
      throw new Error('unknown decal shape ' + kind)
  }
}

/** Decals: [{ frame, shape, g, gap, extrude, mirror }] projected onto the body. */
export function decals(ctx, list) {
  const { acc, target, q } = ctx
  for (const d of list) {
    if (d.minDetail !== undefined && q.detail < d.minDetail) continue
    const m = acc.mark()
    projectDecal(acc, target, frameOf(d.frame), shapeOf(d.shape, q), {
      group: d.g,
      gap: (d.gap ?? 0.004) * (q.decalGap ?? 1),
      extrude: q.detail > 0 ? d.extrude ?? 0 : 0,
      uvScale: 1,
    })
    if (d.mirror) acc.mirrorX(m)
  }
}

/** Dark wheel-arch tunnels + inner walls so the body is never see-through around the wheels. */
export function archLiners(ctx) {
  const { acc, body, q, wheels } = ctx
  const K = q.archSteps * 2
  body.arches.forEach((A, ai) => {
    const m = acc.mark()
    const g = acc.group('trim')
    const w = wheels[ai]
    const xIn = w.x - w.halfWidth - 0.045
    const Rl = A.R - 0.007
    let prev = null
    for (let s = 0; s <= K; s++) {
      const th = (Math.PI * s) / K
      const z = A.z - Rl * Math.cos(th), y = A.yc + Rl * Math.sin(th)
      const xo = Math.max(xIn + 0.03, body.lipX(ai, z) - 0.006)
      const nz = Math.cos(th), ny = -Math.sin(th)
      const a = acc.vert(g, xIn, y, z, 0, ny, nz, 0, s / K)
      const b = acc.vert(g, xo, y, z, 0, ny, nz, 1, s / K)
      if (prev) {
        acc.tri(g, prev[0], prev[1], a)
        acc.tri(g, prev[1], b, a)
      }
      prev = [a, b]
    }
    // inner wall (down to just below the sill)
    const yBot = Math.max(0.03, Math.min(body.fBot(A.z - A.R), body.fBot(A.z + A.R)) - 0.012)
    prev = null
    for (let s = 0; s <= K; s++) {
      const z = A.z - A.R * Math.cos((Math.PI * s) / K)
      const dz = z - A.z
      const yt = Math.abs(dz) < Rl ? A.yc + Math.sqrt(Rl * Rl - dz * dz) : A.yc
      const a = acc.vert(g, xIn, yBot, z, 1, 0, 0, 0, 0)
      const b = acc.vert(g, xIn, yt + 0.01, z, 1, 0, 0, 0, 1)
      if (prev) {
        acc.tri(g, prev[0], prev[1], a)
        acc.tri(g, prev[1], b, a)
      }
      prev = [a, b]
    }
    acc.mirrorX(m)
  })
}

/** Grid from explicit rows of points (open), smooth normals, single group. flip reverses facing. */
export function gridPart(acc, group, rowsPts, { closed = false, flip = false, uvScale = 1, flat = false } = {}) {
  const rows = rowsPts.length, cols = rowsPts[0].length
  const P = new Float64Array(rows * cols * 3)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const src = flip ? rowsPts[i][cols - 1 - j] : rowsPts[i][j]
      P[(i * cols + j) * 3] = src[0]
      P[(i * cols + j) * 3 + 1] = src[1]
      P[(i * cols + j) * 3 + 2] = src[2]
    }
  }
  const N = gridNormals(P, rows, cols, closed)
  emitGrid(acc, P, N, rows, cols, {
    closed,
    classify: () => (flat ? { g: group, flat: true } : group),
    uv: (i, j) => {
      const k = (i * cols + (j % cols)) * 3
      return [P[k + 2] * uvScale, (P[k] + P[k + 1]) * uvScale]
    },
  })
}

/** Flat fan cap for a planar-ish loop of points, facing `nrm`. */
export function capLoop(acc, group, loop, nrm) {
  const g = acc.group(group)
  let cx = 0, cy = 0, cz = 0
  for (const p of loop) {
    cx += p[0]; cy += p[1]; cz += p[2]
  }
  cx /= loop.length; cy /= loop.length; cz /= loop.length
  const c = acc.vert(g, cx, cy, cz, ...nrm, 0, 0)
  const ids = loop.map((p) => acc.vert(g, p[0], p[1], p[2], ...nrm, p[0], p[1]))
  for (let i = 0; i < loop.length; i++) {
    const a = ids[i], b = ids[(i + 1) % loop.length]
    const p = loop[i], q = loop[(i + 1) % loop.length]
    const e1 = [p[0] - cx, p[1] - cy, p[2] - cz], e2 = [q[0] - cx, q[1] - cy, q[2] - cz]
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
    if (n[0] * nrm[0] + n[1] * nrm[1] + n[2] * nrm[2] >= 0) acc.tri(g, c, a, b)
    else acc.tri(g, c, b, a)
  }
}

/** Slab from a right-side plan outline [[x, z], ...] (mirrored to the left). */
function planSlab(acc, group, outline, y0, y1, { uvScale = 1 } = {}) {
  const g = acc.group(group)
  const n = outline.length
  for (const [y, up] of [[y1, true], [y0, false]]) {
    const L = [], R = []
    for (const [x, z] of outline) {
      L.push(acc.vert(g, -x, y, z, 0, up ? 1 : -1, 0, -x * uvScale, z * uvScale))
      R.push(acc.vert(g, x, y, z, 0, up ? 1 : -1, 0, x * uvScale, z * uvScale))
    }
    for (let i = 0; i < n - 1; i++) {
      if (up) {
        acc.tri(g, L[i], L[i + 1], R[i])
        acc.tri(g, R[i], L[i + 1], R[i + 1])
      } else {
        acc.tri(g, L[i], R[i], L[i + 1])
        acc.tri(g, R[i], R[i + 1], L[i + 1])
      }
    }
  }
  // edge band (right side then mirrored)
  const m = acc.mark()
  const rows = outline.map(([x, z]) => [[x, y0, z], [x, y1, z]])
  gridPart(acc, group, rows, { flip: false, uvScale })
  acc.mirrorX(m)
  // close the rear end
  const [xe, ze] = outline[n - 1]
  const a = acc.vert(g, -xe, y0, ze, 0, 0, 1, 0, 0), b = acc.vert(g, xe, y0, ze, 0, 0, 1, 1, 0)
  const c = acc.vert(g, -xe, y1, ze, 0, 0, 1, 0, 1), d = acc.vert(g, xe, y1, ze, 0, 0, 1, 1, 1)
  acc.tri(g, a, b, c)
  acc.tri(g, b, d, c)
}

export function splitter(ctx, f) {
  const { acc, body, q } = ctx
  const A = body.arches[0]
  const zEnd = f.zEnd ?? A.z - A.R - 0.03
  const K = q.detail ? 28 : 12
  const pts = []
  for (let s = 0; s <= K; s++) {
    const t = s / K
    const z = body.zNose + (zEnd - body.zNose) * (1 - Math.cos((t * Math.PI) / 2))
    pts.push([body.planHalfWidth(z, f.probe ?? f.y + 0.14) * (f.inset ?? 1), z])
  }
  while (pts.length > 2 && pts[1][0] < 1e-3) pts.shift()
  pts[0][0] = 0
  const off = f.off ?? 0.03
  const out = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    let tx = b[0] - a[0], tz = b[1] - a[1]
    const l = Math.hypot(tx, tz) || 1
    tx /= l
    tz /= l
    return [i === 0 ? 0 : p[0] + tz * off, p[1] - tx * off]
  })
  out[0][1] = pts[0][1] - off
  planSlab(acc, f.g || 'carbon', out, f.y, f.y + (f.thick ?? 0.016), { uvScale: 1 })
}

/** Side skirt blade between the arches. */
export function skirts(ctx, f) {
  const { acc, body, q } = ctx
  const [FA, RA] = body.arches
  const z0 = FA.z + FA.R + (f.gap ?? 0.02), z1 = RA.z - RA.R - (f.gap ?? 0.02)
  const K = q.detail ? 16 : 6
  const y = f.y, h = f.h ?? 0.07, out = f.out ?? 0.03
  const rows = []
  for (let s = 0; s <= K; s++) {
    const z = z0 + ((z1 - z0) * s) / K
    const xs = body.xAt(z, y + h * 0.5)
    const taper = Math.min(1, Math.min(s, K - s) / 1.5 + 0.35)
    const o = out * taper
    rows.push([
      [xs - 0.05, y - 0.004, z],
      [xs + o - 0.012, y - 0.006, z],
      [xs + o, y + 0.006, z],
      [xs + o * 0.35, y + h * 0.55, z],
      [xs - 0.03, y + h, z],
    ])
  }
  const m = acc.mark()
  gridPart(acc, f.g || 'carbon', rows, { closed: true })
  capLoop(acc, f.g || 'carbon', rows[0], [0, 0, -1])
  capLoop(acc, f.g || 'carbon', rows[rows.length - 1], [0, 0, 1])
  acc.mirrorX(m)
}

export function extrudeX(acc, group, pts2 /* [[z, y]] */, x0, thick, { boxUV = 1 } = {}) {
  const shape = new THREE.Shape(pts2.map(([z, y]) => new THREE.Vector2(z, y)))
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 6 })
  // shape x → car z, shape y → car y, extrusion z → car -x
  const mtx = new THREE.Matrix4().makeRotationY(-Math.PI / 2)
  mtx.premultiply(new THREE.Matrix4().makeTranslation(x0 + thick, 0, 0))
  acc.addGeometry(group, geo, { matrix: mtx, boxUV })
  geo.dispose()
}

/** Rear diffuser: a carbon ceiling 6 mm under the body's rising bottom profile, with strakes. */
export function diffuser(ctx, f) {
  const { acc, body, q } = ctx
  const g = f.g || 'carbon'
  const z0 = f.z0, z1 = body.zTail - body.tail.len * 0.35
  const hw = f.halfW
  const KZ = q.detail ? 10 : 4, KX = 2
  const ceil = (z) => body.fBot(z) - 0.006
  const rows = []
  for (let i = 0; i <= KZ; i++) {
    const z = z0 + ((z1 - z0) * i) / KZ
    const row = []
    for (let j = 0; j <= KX; j++) row.push([-hw + (2 * hw * j) / KX, ceil(z), z])
    rows.push(row)
  }
  const mk = acc.mark()
  gridPart(acc, g, rows)
  acc.backfaces(mk, g)
  const n = q.detail ? f.fins ?? 5 : Math.min(3, f.fins ?? 5)
  const t = 0.012
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -hw * 0.88 + (hw * 1.76 * i) / (n - 1)
    const za = z0 + 0.12, zb = z1, h = f.finH ?? 0.06
    const top = [], bot = []
    for (let k = 0; k <= 4; k++) {
      const z = za + ((zb - za) * k) / 4
      const y = ceil(z) + 0.004
      top.push([z, y])
      bot.push([z, Math.max(f.yLow ?? 0.1, y - h * (0.3 + 0.7 * (k / 4)))])
    }
    extrudeX(acc, g, [...top, ...bot.reverse()], x - t / 2, t)
  }
}

/** Big rear wing with endplates and pylons (or swan necks). */
export function wing(ctx, f) {
  const { acc, target, q } = ctx
  const g = f.g || 'carbon'
  const chord = f.chord, span = f.span, aoa = ((f.aoa ?? 8) * Math.PI) / 180
  // inverted cambered airfoil: loop TE → lower → LE → upper → TE (local z along chord, y up)
  const NP = q.detail ? 10 : 5
  const foil = []
  const thick = f.thick ?? 0.11, camber = f.camber ?? 0.05
  const surf = (xc, upper) => {
    const yt = 5 * thick * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4)
    const yc = -camber * 4 * xc * (1 - xc)
    return yc + (upper ? yt : -yt)
  }
  for (let i = 0; i <= NP; i++) {
    const xc = 1 - (1 - Math.cos((Math.PI * i) / NP)) / 2
    foil.push([xc, surf(xc, false)])
  }
  for (let i = 1; i < NP; i++) {
    const xc = (1 - Math.cos((Math.PI * i) / NP)) / 2
    foil.push([xc, surf(xc, true)])
  }
  const ca = Math.cos(aoa), sa = Math.sin(aoa)
  const toCar = ([xc, yl], x) => {
    // rotate about the leading edge so the trailing edge rises (downforce angle of attack)
    const zz = xc * chord, yy = yl * chord
    const rz = zz * ca - yy * sa, ry = zz * sa + yy * ca
    return [x, f.y + ry + (f.dihedral ?? 0) * Math.abs(x), f.z + rz]
  }
  const K = q.detail ? 12 : 4
  const rows = []
  for (let s = 0; s <= K; s++) {
    const x = -span + (2 * span * s) / K
    rows.push(foil.map((p) => toCar(p, x)))
  }
  gridPart(acc, g, rows, { closed: true })
  // tips
  capLoop(acc, g, rows[0], [-1, 0, 0])
  capLoop(acc, g, rows[rows.length - 1], [1, 0, 0])
  // endplates
  if (f.endplate) {
    const e = f.endplate
    const m = acc.mark()
    const yb = f.y - e.below, yt = f.y + e.above
    extrudeX(acc, e.g || g, [[f.z - e.front, yb + 0.03], [f.z + chord + e.back, yb], [f.z + chord + e.back, yt], [f.z - e.front + 0.05, yt - 0.02]], span, 0.012)
    acc.mirrorX(m)
  }
  // pylons
  for (const p of f.pylons || []) {
    const m = acc.mark()
    const hit = target.cast([p.x, 3, p.z], [0, -1, 0])
    const yb = hit ? hit.p[1] - 0.03 : f.y - 0.3
    const yTop = toCar([0.45, 0], p.x)[1] - 0.005
    const zt = f.z + chord * 0.3
    const pts = p.swan
      ? [[p.z - 0.06, yb], [p.z + 0.1, yb], [zt + 0.12, yTop - 0.12], [zt + 0.14, yTop + 0.03], [zt - 0.02, yTop + 0.03], [zt, yTop - 0.1]]
      : [[p.z - 0.09, yb], [p.z + 0.12, yb], [zt + 0.1, yTop], [zt - 0.08, yTop]]
    extrudeX(acc, p.g || g, pts, p.x - 0.009, 0.018)
    acc.mirrorX(m)
  }
}

/** Small ducktail lip blade across the rear deck. */
export function lip(ctx, f) {
  const { acc, target, q } = ctx
  const K = q.detail ? 16 : 6
  const rows = []
  for (let s = 0; s <= K; s++) {
    const x = -f.span + (2 * f.span * s) / K
    const hit = target.cast([x, 3, f.z], [0, -1, 0])
    const y = hit ? hit.p[1] : f.y
    const e = Math.abs(x) / f.span
    const h = f.h * (1 - Math.pow(e, 6) * 0.7)
    rows.push([
      [x, y - 0.01, f.z - f.len],
      [x, y + h * 0.35, f.z - f.len * 0.3],
      [x, y + h, f.z + f.len * 0.15],
      [x, y + h * 0.8, f.z + f.len * 0.3],
      [x, y - 0.03, f.z + f.len * 0.1],
    ])
  }
  gridPart(acc, f.g || 'carbon', rows)
  capLoop(acc, f.g || 'carbon', rows[0], [-1, 0, 0])
  capLoop(acc, f.g || 'carbon', rows[rows.length - 1], [1, 0, 0])
}

/** Door mirrors (right side, mirrored): rounded-box paint housing on a blade arm, chrome glass. */
export function mirrors(ctx, f) {
  const { acc, q } = ctx
  const m = acc.mark()
  const seg = q.detail ? 20 : 10
  const L = f.len ?? 0.2, H = f.h ?? 0.08, D = f.d ?? 0.11
  const hs = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7))
  const p = hs.attributes.position
  const se = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e)
  for (let i = 0; i < p.count; i++) {
    let x = se(p.getX(i), 0.45), y = se(p.getY(i), 0.55), z = p.getZ(i)
    // teardrop in plan: round front (-z), flat back (+z) face
    z = z > 0 ? se(z, 0.25) * 0.42 : z * (1.0 + 0.2 * x)
    y *= 1 - 0.18 * Math.max(0, -x)
    p.setXYZ(i, x * (L / 2), y * (H / 2), z * (D / 2))
  }
  hs.computeVertexNormals()
  const cx = f.x - L / 2
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.12, -0.08))
  acc.addGeometry(f.g || 'paint', hs, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(cx, f.y, f.z), tilt, new THREE.Vector3(1, 1, 1)) })
  hs.dispose()
  const glass = new THREE.CircleGeometry(1, seg)
  const gm = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, (D / 2) * 0.42 + 0.002), new THREE.Quaternion(), new THREE.Vector3((L / 2) * 0.84, (H / 2) * 0.74, 1))
  gm.premultiply(new THREE.Matrix4().compose(new THREE.Vector3(cx, f.y, f.z), tilt, new THREE.Vector3(1, 1, 1)))
  acc.addGeometry('chrome', glass, { matrix: gm })
  glass.dispose()
  // blade arm from the door shoulder to the housing underside
  const sx0 = f.stalkX, sy0 = f.stalkY, sx1 = cx - L * 0.1, sy1 = f.y - H * 0.3
  const st = new THREE.BoxGeometry(1, 1, 1)
  const sm = new THREE.Matrix4().compose(
    new THREE.Vector3((sx0 + sx1) / 2, (sy0 + sy1) / 2, f.z + 0.015),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(sy1 - sy0, sx1 - sx0))),
    new THREE.Vector3(Math.hypot(sx1 - sx0, sy1 - sy0) + 0.03, 0.028, 0.075),
  )
  acc.addGeometry(f.stalkG || 'paint', st, { matrix: sm })
  st.dispose()
  acc.mirrorX(m)
}

/** Exhaust tips poking out of the rear face. pts: right-side [x, y] (mirrored). */
export function exhausts(ctx, f) {
  const { acc, target, q } = ctx
  const seg = q.detail ? 22 : 10
  const m = acc.mark()
  for (const [x, y] of f.pts) {
    const hit = target.cast([x, y, 5], [0, 0, -1])
    const zt = (hit ? hit.p[2] : ctx.body.zTail) + (f.out ?? 0.025)
    const r = f.r
    const mtx = new THREE.Matrix4().makeRotationY(-Math.PI / 2)
    mtx.premultiply(new THREE.Matrix4().makeScale(f.sx ?? 1, f.sy ?? 1, 1))
    mtx.premultiply(new THREE.Matrix4().makeTranslation(x, y, zt))
    lathe(acc, 'chrome', [[[-0.14, r], [-0.01, r], [0, r - 0.002], [0.001, r - 0.006], [-0.004, r - 0.01]]], seg, { matrix: mtx })
    lathe(acc, 'trim', [[[-0.004, r - 0.01], [-0.06, r - 0.012], [-0.07, 0.001]]], seg, { matrix: mtx })
  }
  if (f.mirror !== false) acc.mirrorX(m)
}

/** Superellipsoid blob (rounded box when e < 1): size = full extents, e = [ex, ey, ez] shape exponents. */
export function blob(acc, group, center, size, { rot = [0, 0, 0], e = [0.5, 0.5, 0.5], seg = 16 } = {}) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7)))
  const p = g.attributes.position
  const se = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k)
  for (let i = 0; i < p.count; i++) p.setXYZ(i, se(p.getX(i), e[0]) * size[0] / 2, se(p.getY(i), e[1]) * size[1] / 2, se(p.getZ(i), e[2]) * size[2] / 2)
  g.computeVertexNormals()
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1))
  acc.addGeometry(group, g, { matrix: m })
  g.dispose()
}

/** Open-cockpit extras: bucket seats, steering wheel, dash cowl. */
export function cockpit(ctx, f) {
  const { acc, q } = ctx
  const seg = q.detail ? 16 : 8
  for (const sx of [-1, 1]) {
    const x = sx * f.seatX
    // backrest + bolsters, cushion
    blob(acc, 'trim', [x, f.seatY + 0.24, f.seatZ + 0.04], [0.46, 0.5, 0.13], { rot: [-0.3, 0, 0], e: [0.35, 0.5, 0.6], seg })
    for (const b of [-1, 1]) blob(acc, 'trim', [x + b * 0.2, f.seatY + 0.2, f.seatZ - 0.01], [0.08, 0.36, 0.16], { rot: [-0.3, 0, 0], e: [0.6, 0.5, 0.6], seg: Math.max(8, seg >> 1) })
    blob(acc, 'trim', [x, f.seatY + 0.02, f.seatZ - 0.24], [0.46, 0.1, 0.44], { e: [0.35, 0.6, 0.4], seg })
  }
  const sw = new THREE.TorusGeometry(0.17, 0.017, 6, seg * 2)
  const d = f.driverX ?? -f.seatX
  acc.addGeometry('trim', sw, { matrix: new THREE.Matrix4().compose(new THREE.Vector3(d, f.wheelY, f.wheelZ), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), new THREE.Vector3(1, 1, 1)) })
  sw.dispose()
  // dashboard cowl under the windscreen
  if (f.dash) blob(acc, 'trim', f.dash.c, f.dash.size, { e: [0.3, 0.6, 0.5], seg })
}
