// Streams 200 m road chunks around the player along the route (current stage, the fork
// branches ahead, the stage behind). Geometry buffers and instanced meshes are pooled, so a
// chunk swap never reallocates GPU buffers. Build work is capped per frame.
import * as THREE from 'three'
import {
  CHUNK_LEN, ROAD_ROWS, ROAD_COLS, TER_ROWS, TER_COLS, TER_VERTS, BAR_MAX_VERTS, BAR_MAX_INDEX,
  chunkCount, chunkOrigin, gridIndex, terrainIndex, buildRoad, buildTerrain, buildBarriers, placeProps,
} from '../track/chunkBuild.js'
import { terrainContext } from './terrain.js'
import { getPropLibrary } from './propmodels/index.js'

const BEHIND = 260
const PROP_CAP = 640
const LOD_NEAR = 240

function makeRoadGeometry() {
  const g = new THREE.BufferGeometry()
  const n = ROAD_ROWS * ROAD_COLS
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('aRoad', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(new THREE.BufferAttribute(gridIndex(ROAD_ROWS, ROAD_COLS), 1))
  return g
}

function makeTerrainGeometry() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TER_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(TER_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TER_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array((TER_ROWS - 1) * (TER_COLS - 1) * 12), 1).setUsage(THREE.DynamicDrawUsage))
  return g
}

function makeBarrierGeometry() {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BAR_MAX_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(BAR_MAX_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BAR_MAX_VERTS * 3), 3).setUsage(THREE.DynamicDrawUsage))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(BAR_MAX_INDEX), 1).setUsage(THREE.DynamicDrawUsage))
  return g
}

function touch(geo) {
  for (const k in geo.attributes) geo.attributes[k].needsUpdate = true
  if (geo.index) geo.index.needsUpdate = true
}

export class ChunkManager {
  constructor(scene, { roadMat, terrainMat, barrierMat, propMat }, opts = {}) {
    this.scene = scene
    this.roadMat = roadMat
    this.terrainMat = terrainMat
    this.barrierMat = barrierMat
    this.propMat = propMat
    this.seed = opts.seed || 'or2r'
    this.viewDist = opts.viewDist || 1400
    this.density = opts.density ?? 1
    this.shadows = !!opts.shadows
    this.chunks = new Map()
    this.ctx = new WeakMap()
    this.pools = { road: [], terrain: [], barrier: [], props: new Map() }
    this.lib = getPropLibrary()
    this.group = new THREE.Group()
    this.group.name = 'chunks'
    scene.add(this.group)
    this._desired = []
    this._keys = new Set()
    this._tmpV = new THREE.Vector3()
    this._colliders = []
    this.buildMsLast = 0
    this.stats = { built: 0, released: 0 }
  }

  setQuality({ viewDist, density, shadows }) {
    const densityChanged = density !== undefined && density !== this.density
    if (viewDist) this.viewDist = viewDist
    if (density !== undefined) this.density = density
    if (shadows !== undefined) this.shadows = shadows
    if (densityChanged) this.clear()
  }

  terrainCtx(course) {
    let c = this.ctx.get(course)
    if (!c) {
      c = terrainContext(course, this.seed)
      if (course.parent) {
        c.parent = this.terrainCtx(course.parent)
        c.blend = 0
      }
      this.ctx.set(course, c)
    }
    return c
  }

  /** Compute the desired chunk list (sorted nearest-first). */
  _computeDesired(route, s) {
    const out = this._desired
    out.length = 0
    const cur = route.current
    const view = this.viewDist
    const add = (course, k, dist) => out.push({ course, k, dist, key: course.uid + ':' + k })
    const K = chunkCount(cur)
    for (let k = Math.max(0, Math.floor((s - BEHIND) / CHUNK_LEN)); k < K && k * CHUNK_LEN < s + view; k++) {
      add(cur, k, Math.max(0, k * CHUNK_LEN - s))
    }
    if (route.previous && s < BEHIND) {
      const p = route.previous
      const kp = chunkCount(p) - 1
      add(p, kp, BEHIND - s)
    }
    if (cur.sibling && s < 1200) {
      for (let k = 0; k < 6 && k * CHUNK_LEN < s + view * 0.8; k++) {
        if ((k + 1) * CHUNK_LEN < s - BEHIND) continue
        add(cur.sibling, k, Math.abs(k * CHUNK_LEN - s) + 50)
      }
    }
    if (!cur.goal && s + view > cur.length) {
      const kids = route.ensureChildren(cur)
      for (const kid of kids) {
        for (let k = 0; k < 6 && cur.length + k * CHUNK_LEN < s + view; k++) {
          add(kid, k, cur.length + k * CHUNK_LEN - s)
        }
      }
    }
    out.sort((a, b) => a.dist - b.dist)
    return out
  }

  /**
   * @param route   Route
   * @param s       player s on route.current
   * @param camPos  THREE.Vector3 (for LOD)
   * @param maxBuilds  chunk builds allowed this frame (Infinity for synchronous warm-up)
   */
  update(route, s, camPos, maxBuilds = 1) {
    const t0 = performance.now()
    const desired = this._computeDesired(route, s)
    const keys = this._keys
    keys.clear()
    for (const d of desired) keys.add(d.key)
    // release
    for (const [key, ch] of this.chunks) {
      if (!keys.has(key)) this._release(key, ch)
    }
    // build missing
    let built = 0
    for (const d of desired) {
      if (this.chunks.has(d.key)) continue
      if (built >= maxBuilds) break
      this._build(d.course, d.k, d.key)
      built++
    }
    // LOD
    for (const ch of this.chunks.values()) {
      const dist = ch.center.distanceTo(camPos)
      const near = dist < LOD_NEAR + 140
      if (near !== ch.near) {
        ch.near = near
        for (const pm of ch.props) {
          pm.geometry = near ? this.lib.get(pm.userData.kind).lod0 : this.lib.get(pm.userData.kind).lod1
        }
      }
    }
    this.buildMsLast = performance.now() - t0
    return built
  }

  /** true when every desired chunk is built */
  get complete() {
    for (const d of this._desired) if (!this.chunks.has(d.key)) return false
    return true
  }

  _acquire(type, factory, mat) {
    const pool = this.pools[type]
    let m = pool.pop()
    if (!m) {
      m = new THREE.Mesh(factory(), mat)
      m.matrixAutoUpdate = false
      m.frustumCulled = true
    }
    return m
  }

  _acquireProps(kind) {
    let pool = this.pools.props.get(kind)
    if (!pool) this.pools.props.set(kind, (pool = []))
    let m = pool.pop()
    if (!m) {
      const lib = this.lib.get(kind)
      m = new THREE.InstancedMesh(lib.lod1, this.propMat, PROP_CAP)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      m.userData.kind = kind
      m.matrixAutoUpdate = false
      m.setColorAt(0, new THREE.Color(1, 1, 1))
    }
    return m
  }

  _build(course, k, key) {
    const o = chunkOrigin(course, k)
    const origin = new THREE.Vector3(o.x, o.y, o.z)
    const ctx = this.terrainCtx(course)

    const road = this._acquire('road', makeRoadGeometry, this.roadMat)
    const rg = road.geometry
    const rows = buildRoad(course, k, o, {
      pos: rg.attributes.position.array, nrm: rg.attributes.normal.array, uv: rg.attributes.uv.array, road: rg.attributes.aRoad.array,
    })
    rg.setDrawRange(0, (rows - 1) * (ROAD_COLS - 1) * 6)
    touch(rg)
    road.receiveShadow = this.shadows

    const ter = this._acquire('terrain', makeTerrainGeometry, this.terrainMat)
    const tg = ter.geometry
    const trows = buildTerrain(course, k, o, ctx, {
      pos: tg.attributes.position.array, nrm: tg.attributes.normal.array, col: tg.attributes.color.array,
    })
    const icount = terrainIndex(trows, tg.index.array)
    tg.setDrawRange(0, icount)
    touch(tg)
    ter.receiveShadow = this.shadows

    const bar = this._acquire('barrier', makeBarrierGeometry, this.barrierMat)
    const bg = bar.geometry
    const b = buildBarriers(course, k, o, ctx.biome.barrier, {
      pos: bg.attributes.position.array, nrm: bg.attributes.normal.array, col: bg.attributes.color.array, index: bg.index.array,
    })
    bg.setDrawRange(0, b.indices)
    touch(bg)
    bar.visible = b.indices > 0
    bar.receiveShadow = this.shadows

    const mid = course.sample(Math.min(course.length, (k + 0.5) * CHUNK_LEN))
    const localMid = new THREE.Vector3(mid.x - o.x, mid.y - o.y, mid.z - o.z)
    for (const m of [road, ter, bar]) {
      m.position.copy(origin)
      m.updateMatrix()
      m.geometry.boundingSphere = new THREE.Sphere(localMid.clone(), 135)
    }
    ter.geometry.boundingSphere = new THREE.Sphere(localMid.clone(), 560)
    this.group.add(road, ter, bar)

    // props
    const placed = placeProps(course, k, o, ctx, { density: this.density, seed: this.seed })
    const props = []
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const sc = new THREE.Vector3()
    const col = new THREE.Color()
    for (const [kind, arr] of placed.instances) {
      if (!this.lib.has(kind)) continue
      const im = this._acquireProps(kind)
      const n = Math.min(PROP_CAP, arr.length / 6)
      for (let i = 0; i < n; i++) {
        const j = i * 6
        p.set(arr[j], arr[j + 1], arr[j + 2])
        e.set(0, arr[j + 3], 0)
        q.setFromEuler(e)
        const s = arr[j + 4]
        sc.set(s, s, s)
        m4.compose(p, q, sc)
        im.setMatrixAt(i, m4)
        const t = arr[j + 5]
        col.setRGB(0.82 + t * 0.36, 0.86 + t * 0.26, 0.82 + t * 0.3)
        im.setColorAt(i, col)
      }
      im.count = n
      im.instanceMatrix.needsUpdate = true
      if (im.instanceColor) im.instanceColor.needsUpdate = true
      im.position.copy(origin)
      im.updateMatrix()
      im.computeBoundingSphere()
      im.castShadow = false
      im.receiveShadow = false
      this.group.add(im)
      props.push(im)
    }

    const center = new THREE.Vector3(mid.x, mid.y, mid.z)
    const ch = { key, course, k, road, ter, bar, props, colliders: placed.colliders, center, near: null }
    this.chunks.set(key, ch)
    this.stats.built++
    return ch
  }

  _release(key, ch) {
    this.group.remove(ch.road, ch.ter, ch.bar)
    this.pools.road.push(ch.road)
    this.pools.terrain.push(ch.ter)
    this.pools.barrier.push(ch.bar)
    for (const pm of ch.props) {
      this.group.remove(pm)
      this.pools.props.get(pm.userData.kind).push(pm)
    }
    this.chunks.delete(key)
    this.stats.released++
  }

  clear() {
    for (const [key, ch] of this.chunks) this._release(key, ch)
  }

  /** Solid prop colliders near s on `course` (reused array). */
  collidersNear(course, s) {
    const out = this._colliders
    out.length = 0
    const k = Math.floor(s / CHUNK_LEN)
    for (let kk = k - 1; kk <= k + 1; kk++) {
      const ch = this.chunks.get(course.uid + ':' + kk)
      if (!ch) continue
      for (const c of ch.colliders) if (Math.abs(c.s - s) < 12) out.push(c)
    }
    return out
  }

  get count() { return this.chunks.size }
}
