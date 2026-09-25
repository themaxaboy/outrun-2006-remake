// Lofted car body: stations along the length × superellipse cross-sections whose heights,
// half-width, exponents and fender crown come from smooth per-car profile curves.
// Also builds the greenhouse (cabin glass + roof) and the arch cut-outs with dark liners.
//
// Car space: y up (y = 0 road), front toward -Z, +X right, origin between the axles.
import { curve, clamp, lerp, smoothstep, band } from './curves.js'
import { gridNormals, emitGrid, RayTarget } from './meshkit.js'

export const QUALITY = {
  high: { ds: 0.04, endSteps: 10, archSteps: 18, ringUp: 26, ringDn: 10, cabDs: 0.045, cabSide: 7, cabTop: 16, seg: 32, wheelSeg: 56, detail: 1 },
  low: { ds: 0.1, endSteps: 5, archSteps: 8, ringUp: 12, ringDn: 5, cabDs: 0.12, cabSide: 3, cabTop: 7, seg: 14, wheelSeg: 24, detail: 0 },
}

export class BodyShape {
  constructor(spec, q) {
    const b = spec.body
    this.spec = spec
    this.q = q
    this.fW = curve(b.W)
    this.fTop = curve(b.top)
    this.fBot = curve(b.bot)
    this.fMid = curve(b.mid)
    this.fNUp = curve(b.nUp)
    this.fNDn = curve(b.nDn)
    this.fCrown = curve(b.crown ?? 0)
    this.fTumble = curve(b.tumble ?? 0)
    this.fTuck = curve(b.tuck ?? 0)
    this.crownAt = b.crownAt ?? 0.8
    this.crownW = b.crownW ?? 0.2
    this.zNose = b.zNose
    this.zTail = b.zTail
    this.nose = b.nose
    this.tail = b.tail
    this.scoops = b.scoops || []
    this.topFeatures = b.topFeatures || []
    const w = spec.wheels
    this.arches = spec.arches
      ? spec.arches.map((a) => ({ z: a.z, R: a.R, yc: a.yc ?? w.radius + (w.archLift ?? 0.012) }))
      : [-1, 1].map((s, i) => ({
          z: (s * spec.wheelbase) / 2,
          R: w.archR[i] ?? w.archR,
          yc: w.radius + (w.archLift ?? 0.012),
        }))
    this.Nd = q.ringDn
    this.Nu = q.ringUp
    this.Nh = this.Nd + this.Nu
    this.N = 2 * this.Nh
    this.phis = new Float64Array(this.Nh + 1)
    for (let j = 0; j <= this.Nh; j++) {
      this.phis[j] = j <= this.Nd ? -Math.PI / 2 + (j / this.Nd) * (Math.PI / 2) : ((j - this.Nd) / this.Nu) * (Math.PI / 2)
    }
    this._R = this.makeRing()
  }

  makeRing() {
    const N = this.N
    return { X: new Float64Array(N), Y: new Float64Array(N), CL: new Uint8Array(N), DN: new Float64Array(N), lip: 0 }
  }

  prof(z) {
    return { W: this.fW(z), top: this.fTop(z), bot: this.fBot(z), mid: this.fMid(z), nUp: this.fNUp(z), nDn: this.fNDn(z), crown: this.fCrown(z), tumble: this.fTumble(z), tuck: this.fTuck(z) }
  }

  bump(u) {
    if (u <= 0 || u >= 1) return 0
    const t = (u - this.crownAt) / this.crownW
    return Math.exp(-t * t) * (1 - Math.pow(u, 16))
  }

  endScale(z, pr) {
    const n = this.nose, t = this.tail
    if (z < this.zNose + n.len) {
      const d = clamp((this.zNose + n.len - z) / n.len, 0, 1)
      return { k: Math.pow(Math.max(0, 1 - Math.pow(d, n.m)), 1 / n.m), yc: lerp(pr.bot, pr.top, n.yc) }
    }
    if (z > this.zTail - t.len) {
      const d = clamp((z - (this.zTail - t.len)) / t.len, 0, 1)
      return { k: Math.pow(Math.max(0, 1 - Math.pow(d, t.m)), 1 / t.m), yc: lerp(pr.bot, pr.top, t.yc) }
    }
    return { k: 1, yc: 0 }
  }

  topDeform(z, x) {
    let d = 0
    const ax = Math.abs(x)
    for (const f of this.topFeatures) {
      if (f.fn) d += f.fn(z, ax)
      else d += f.h * band(z, f.z0, f.z1, f.ez) * band(ax, f.x0 ?? -1, f.x1, f.ex)
    }
    return d
  }

  scoopAt(z, y) {
    let d = 0
    for (const s of this.scoops) {
      const zz = z - (s.slant ?? 0) * (y - s.y0)
      d += s.depth * band(zz, s.z0, s.z1, s.ez ?? 0.06) * band(y, s.y0, s.y1, s.ey ?? 0.05) * (s.ramp ? smoothstep(s.z0 - (s.ez ?? 0.06), s.z1, zz) * 0.6 + 0.4 : 1)
    }
    return d
  }

  /** Upper surface height at (z, x) from the unclamped ring (used to seat the cabin). */
  topAt(z, x) {
    if (this._topZ !== z) {
      this._topR = this.ring(z, -1, this._topR || this.makeRing())
      this._topZ = z
    }
    const { X, Y } = this._topR
    const ax = Math.abs(x)
    for (let j = this.Nh; j > this.Nd; j--) {
      const x0 = X[j], x1 = X[j - 1]
      if (ax >= x0 && ax <= x1) return Y[j] + ((Y[j - 1] - Y[j]) * (ax - x0)) / (x1 - x0 || 1)
    }
    return Y[this.Nd]
  }

  /**
   * Cross-section ring at z. archIdx ≥ 0 cuts the wheel arch: every point below the arch
   * circle is pulled up onto it (a thin fender shell over the wheel).
   * Ring: j = 0 bottom centre → right side → j = Nh top centre → left side (mirrored).
   */
  ring(z, archIdx = -1, R = this._R) {
    const pr = this.prof(z)
    const { k, yc } = this.endScale(z, pr)
    const { X, Y, CL, DN } = R
    const Nh = this.Nh, Nd = this.Nd, N = this.N
    const hasTop = this.topFeatures.length > 0
    const hasScoop = this.scoops.length > 0
    for (let j = 0; j <= Nh; j++) {
      const phi = this.phis[j]
      const c = Math.abs(Math.cos(phi)), s = Math.sin(phi)
      let x, y, dn = 0
      if (j >= Nd) {
        const u = Math.pow(c, 2 / pr.nUp)
        const yn = Math.pow(Math.max(0, s), 2 / pr.nUp)
        x = pr.W * u * (1 - pr.tumble * yn)
        y = pr.mid + (pr.top - pr.mid) * yn + pr.crown * this.bump(u)
        if (hasTop) {
          const td = this.topDeform(z, x) * smoothstep(0.15, 0.55, yn)
          y += td
          if (td < 0) dn = -td
        }
      } else {
        const u = Math.pow(c, 2 / pr.nDn)
        const yd = Math.pow(Math.max(0, -s), 2 / pr.nDn)
        x = pr.W * u * (1 - pr.tuck * yd * yd)
        y = pr.mid - (pr.mid - pr.bot) * yd
      }
      if (k < 1) {
        x *= k
        y = yc + (y - yc) * k
      }
      if (hasScoop) x -= this.scoopAt(z, y) * smoothstep(0.55, 0.9, x / pr.W)
      X[j] = x
      Y[j] = y
      CL[j] = 0
      DN[j] = dn
    }
    R.lip = 0
    if (archIdx >= 0) this.clampArch(z, archIdx, R)
    for (let j = Nh + 1; j < N; j++) {
      const m = N - j
      X[j] = -X[m]
      Y[j] = Y[m]
      CL[j] = CL[m]
      DN[j] = DN[m]
    }
    return R
  }

  clampArch(z, ai, R) {
    const A = this.arches[ai]
    const { X, Y, CL } = R
    const Nh = this.Nh
    const dz = z - A.z
    let ay = A.yc + Math.sqrt(Math.max(0, A.R * A.R - dz * dz))
    if (Y[0] >= ay) return
    let top = -Infinity
    for (let j = 0; j <= Nh; j++) top = Math.max(top, Y[j])
    ay = Math.min(ay, top - 0.03)
    let jc = -1
    for (let j = 0; j < Nh; j++) {
      if (Y[j] < ay && Y[j + 1] >= ay) {
        jc = j
        break
      }
    }
    if (jc < 0) return
    const t = (ay - Y[jc]) / (Y[jc + 1] - Y[jc])
    const xl = X[jc] + (X[jc + 1] - X[jc]) * t
    R.lip = xl
    // upper-surface lookup (x decreasing from jc+1 to Nh)
    const topAtX = (x) => {
      for (let j = Nh; j > jc + 1; j--) {
        const x0 = X[j], x1 = X[j - 1]
        if (x >= Math.min(x0, x1) && x <= Math.max(x0, x1)) {
          const f = (x - x0) / (x1 - x0 || 1)
          return Y[j] + (Y[j - 1] - Y[j]) * f
        }
      }
      return ay + 0.05
    }
    for (let j = 0; j <= jc; j++) {
      const nx = Math.min(X[j], xl)
      X[j] = nx
      Y[j] = Math.min(ay, topAtX(nx) - 0.025)
      CL[j] = 1
    }
  }

  /** Outer x of the (unclamped) section at height y, right side. */
  xAt(z, y) {
    const R = this.ring(z, -1, this.makeRing())
    const { X, Y } = R
    for (let j = 0; j < this.Nh; j++) {
      if ((Y[j] <= y && Y[j + 1] >= y) || (Y[j] >= y && Y[j + 1] <= y)) {
        const f = (y - Y[j]) / (Y[j + 1] - Y[j] || 1)
        return X[j] + (X[j + 1] - X[j]) * f
      }
    }
    return 0
  }

  /** Max half-width of the section (plan outline), optionally only below height yMax. */
  planHalfWidth(z, yMax = Infinity) {
    const R = this.ring(z, -1, this.makeRing())
    let m = 0
    for (let j = 0; j < this.Nh; j++) {
      const y0 = R.Y[j], y1 = R.Y[j + 1]
      if (y0 <= yMax) m = Math.max(m, R.X[j])
      if ((y0 - yMax) * (y1 - yMax) < 0) m = Math.max(m, R.X[j] + ((R.X[j + 1] - R.X[j]) * (yMax - y0)) / (y1 - y0))
    }
    return m
  }

  lipX(ai, z) {
    const R = this.ring(z, ai, this.makeRing())
    return R.lip || this.planHalfWidth(z)
  }

  stations() {
    const q = this.q
    const out = []
    const n = this.nose, t = this.tail
    const M = q.endSteps
    for (let i = 0; i < M; i++) {
      const a = (Math.PI / 2) * (1 - i / M)
      const d = Math.pow(Math.sin(a), 2 / n.m)
      out.push({ z: this.zNose + n.len * (1 - d), arch: -1, clamp: false })
    }
    const z0 = this.zNose + n.len, z1 = this.zTail - t.len
    const cnt = Math.max(2, Math.round((z1 - z0) / q.ds))
    const margin = q.ds * 0.35
    let ai = 0
    for (let i = 0; i <= cnt; i++) {
      const z = z0 + ((z1 - z0) * i) / cnt
      while (ai < this.arches.length && z > this.arches[ai].z - this.arches[ai].R - margin) {
        const A = this.arches[ai]
        const K = q.archSteps
        out.push({ z: A.z - A.R, arch: ai, clamp: false })
        for (let s = 0; s <= K; s++) out.push({ z: A.z - A.R * Math.cos((Math.PI * s) / K), arch: ai, clamp: true })
        out.push({ z: A.z + A.R, arch: ai, clamp: false })
        ai++
      }
      if (this.arches.some((A) => z > A.z - A.R - margin && z < A.z + A.R + margin)) continue
      out.push({ z, arch: -1, clamp: false })
    }
    for (let i = 1; i <= M; i++) {
      const a = (Math.PI / 2) * (i / M)
      const d = Math.pow(Math.sin(a), 2 / t.m)
      out.push({ z: z1 + t.len * d, arch: -1, clamp: false })
    }
    return out
  }

  /** Tessellate the body into acc ('paint', arch walls → 'trim'). Returns a RayTarget of the paint. */
  build(acc) {
    const st = this.stations()
    const rows = st.length, N = this.N, Nh = this.Nh
    const P = new Float64Array(rows * N * 3)
    const CL = new Uint8Array(rows * N)
    const DN = new Float32Array(rows * N)
    const V = new Float64Array(rows * N)
    const R = this.makeRing()
    for (let i = 0; i < rows; i++) {
      this.ring(st[i].z, st[i].clamp ? st[i].arch : -1, R)
      for (let j = 0; j < N; j++) {
        const k = i * N + j
        P[k * 3] = R.X[j]
        P[k * 3 + 1] = R.Y[j]
        P[k * 3 + 2] = st[i].z
        CL[k] = R.CL[j]
        DN[k] = R.DN[j]
      }
      // arc length from the top centre (v > 0 right side, < 0 left side)
      let acc2 = 0
      V[i * N + Nh] = 0
      for (let j = Nh - 1; j >= 0; j--) {
        acc2 += Math.hypot(R.X[j + 1] - R.X[j], R.Y[j + 1] - R.Y[j])
        V[i * N + j] = acc2
      }
      for (let j = Nh + 1; j < N; j++) V[i * N + j] = -V[i * N + (N - j)]
    }
    const dup = (i) => i + 1 < rows && st[i].z === st[i + 1].z
    const Nrm = gridNormals(P, rows, N, true, (i) => !dup(i))
    const same = (a, b) => Math.abs(P[a * 3] - P[b * 3]) + Math.abs(P[a * 3 + 1] - P[b * 3 + 1]) < 1e-7
    for (let i = 0; i < rows - 1; i++) {
      if (!dup(i)) continue
      for (let j = 0; j < N; j++) {
        const a = i * N + j, b = (i + 1) * N + j
        if (!same(a, b)) continue
        let x = Nrm[a * 3] + Nrm[b * 3], y = Nrm[a * 3 + 1] + Nrm[b * 3 + 1], z = Nrm[a * 3 + 2] + Nrm[b * 3 + 2]
        const l = Math.hypot(x, y, z) || 1
        Nrm[a * 3] = Nrm[b * 3] = x / l
        Nrm[a * 3 + 1] = Nrm[b * 3 + 1] = y / l
        Nrm[a * 3 + 2] = Nrm[b * 3 + 2] = z / l
      }
    }
    const WALL = { g: 'trim', flat: true }
    const interior = this.spec.body.interiorGroup || 'trim'
    emitGrid(acc, P, Nrm, rows, N, {
      closed: true,
      classify: (i, j) => {
        const j1 = (j + 1) % N
        const a = i * N + j, b = i * N + j1, c = (i + 1) * N + j, d = (i + 1) * N + j1
        if (dup(i)) return same(a, c) && same(b, d) ? null : WALL
        if (CL[a] && CL[b] && CL[c] && CL[d]) return 'trim'
        if (DN[a] > 0.035 && DN[b] > 0.035 && DN[c] > 0.035 && DN[d] > 0.035) return interior
        return 'paint'
      },
      uv: (i, j) => [st[i].z, j === N ? -V[i * N] : V[i * N + j]],
    })
    this.stationList = st
    return new RayTarget([acc.group('paint')])
  }
}

/**
 * Greenhouse: lofted from the windshield base to the rear deck. Section = superellipse arch
 * seated on the body top, with tumblehome. Quads are routed to glass / paint / trim by region
 * so the roof, pillars and C-pillars are painted while windows are glass.
 */
export class Cabin {
  constructor(spec, body) {
    const c = spec.cabin
    this.c = c
    this.body = body
    this.fRoof = curve(c.roof)
    this.fW = curve(c.W)
    this.fTumble = curve(c.tumble ?? 0.2)
    this.fN = curve(c.n ?? 2.6)
    this.embed = c.embed ?? 0.02
  }

  base(z) {
    if (this._bz === z) return this._bv
    const W = this.fW(z)
    let m = Infinity
    for (let k = 0; k <= 8; k++) m = Math.min(m, this.body.topAt(z, (W * k) / 8))
    this._bz = z
    this._bv = m
    return m
  }

  point(z, t) {
    const W = this.fW(z)
    const base = this.base(z)
    const H = Math.max(0, this.fRoof(z) - base)
    const n = this.fN(z)
    const psi = t * Math.PI
    const c = Math.cos(psi), s = Math.max(0, Math.sin(psi))
    const xn = Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const yn = Math.pow(s, 2 / n)
    const tb = this.fTumble(z)
    return [W * xn * (1 - tb * yn), base - this.embed + (H + this.embed) * yn]
  }

  build(acc, q) {
    const c = this.c
    // stations
    const zs = new Set()
    const cnt = Math.max(3, Math.round((c.z1 - c.z0) / q.cabDs))
    for (let i = 0; i <= cnt; i++) zs.add(+(c.z0 + ((c.z1 - c.z0) * i) / cnt).toFixed(4))
    const keys = [c.zRoofF, c.zRoofR, c.zC]
    if (c.bPillar) keys.push(c.bPillar.z - c.bPillar.w, c.bPillar.z + c.bPillar.w)
    for (const k of keys) if (k !== undefined && k > c.z0 && k < c.z1) zs.add(+k.toFixed(4))
    let Z = [...zs].sort((a, b) => a - b)
    const isKey = (z) => keys.some((k) => k !== undefined && Math.abs(k - z) < 1e-4)
    Z = Z.filter((z, i) => i === 0 || isKey(z) || (z - Z[i - 1] > Math.min(0.03, q.cabDs * 0.4) && !(i + 1 < Z.length && isKey(Z[i + 1]) && Z[i + 1] - z < Math.min(0.03, q.cabDs * 0.4))))
    // t samples
    const tc = c.tc ?? 0.3, dl = c.pillar ?? 0.05
    const T = []
    for (let i = 0; i <= q.cabSide; i++) T.push(((tc - dl) * i) / q.cabSide)
    T.push(tc)
    for (let i = 1; i <= q.cabTop; i++) T.push(tc + ((1 - 2 * tc) * i) / q.cabTop)
    T.push(1 - tc + dl)
    for (let i = q.cabSide - 1; i >= 0; i--) T.push(1 - ((tc - dl) * i) / q.cabSide)
    const rows = Z.length, cols = T.length
    const P = new Float64Array(rows * cols * 3)
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const [x, y] = this.point(Z[i], T[j])
        const k = (i * cols + j) * 3
        P[k] = x
        P[k + 1] = y
        P[k + 2] = Z[i]
      }
    }
    const Nrm = gridNormals(P, rows, cols, false)
    const roofMat = c.roofMat || 'paint'
    const pillarMat = c.pillarMat || 'paint'
    const cMat = c.cPillarMat || 'paint'
    const rearMat = c.rearMat || 'glass'
    const screen = c.type === 'screen'
    const classify = (i, j) => {
      const zc = (Z[i] + Z[i + 1]) / 2, tm = (T[j] + T[j + 1]) / 2
      const side = tm < tc - dl || tm > 1 - tc + dl
      const pillar = !side && (tm < tc || tm > 1 - tc)
      if (screen) {
        if (zc > c.z1 - (c.header ?? 0.035)) return c.headerMat || 'trim'
        if (pillar) return pillarMat
        return 'glass'
      }
      const zoneW = zc < c.zRoofF, zoneR = zc > c.zRoofR
      if (!side && !pillar) return zoneW ? 'glass' : zoneR ? rearMat : roofMat
      if (pillar) return zoneW ? pillarMat : zoneR ? cMat : c.railMat || roofMat
      if (c.bPillar && Math.abs(zc - c.bPillar.z) < c.bPillar.w) return c.bPillar.g || 'trim'
      return zc < (c.zC ?? c.z1) ? 'glass' : cMat
    }
    const m = acc.mark()
    emitGrid(acc, P, Nrm, rows, cols, { classify, uv: (i, j) => [Z[i], (T[j] - 0.5) * 2] })
    if (screen) for (const g of ['glass', c.headerMat || 'trim', pillarMat]) if (g !== 'trim') acc.backfaces(m, g)
    this.Z = Z
    this.T = T
  }
}
