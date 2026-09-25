// buildCar(id, opts) → CarRig: assembles the lofted body, greenhouse, parts, decals and
// wheels for one of the four original cars. Geometry is merged per material, so the whole
// car is ≤ 10 draw calls (paint, glass, trim, carbon, chrome, head, tail + 3 wheel instancers).
import * as THREE from 'three'
import { getCar } from '../carDefs.js'
import { MeshAcc } from './meshkit.js'
import { BodyShape, Cabin, QUALITY } from './bodyGen.js'
import { archLiners, splitter, skirts, diffuser, wing, lip, mirrors, exhausts, cockpit, decals } from './parts.js'
import { buildWheelGeometries, WheelSet } from './wheels.js'
import { createCarMaterials } from './materials.js'
import { CarRig } from './CarRig.js'
import { DESIGNS } from './carDesigns.js'

export const CAR_IDS = ['aurora', 'vento', 'stradale', 'nebula']
const GROUP_ORDER = ['paint', 'glass', 'trim', 'carbon', 'chrome', 'head', 'tail']

/**
 * Cheap baked "ambient occlusion" in vertex colours: darker toward the road, on downward faces
 * and around the wheel arches. Multiplies the base colour, so it also dims reflections there.
 */
function bakeAO(geo, body, wheelInfo, strength = 1) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal
  const col = new Float32Array(pos.count * 3)
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    let ao = 0.62 + 0.38 * sm(0.05, 0.42, y)
    const ny = nrm.getY(i)
    if (ny < -0.2) ao *= 1 - 0.3 * sm(-0.2, -0.8, ny)
    body.arches.forEach((A, k) => {
      const d = Math.hypot(z - A.z, y - A.yc)
      if (Math.abs(x) > wheelInfo[k].x - wheelInfo[k].halfWidth - 0.1) ao *= 0.6 + 0.4 * sm(A.R - 0.01, A.R + 0.12, d)
    })
    ao = 1 - (1 - ao) * strength
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

/** Build the body geometry groups for a design (exported for tests / tools). */
export function buildBodyGeometry(spec, quality = 'high') {
  const q = QUALITY[quality] || QUALITY.high
  const acc = new MeshAcc()
  const body = new BodyShape(spec, q)
  const target = body.build(acc)
  const cabin = new Cabin(spec, body)
  cabin.build(acc, q)
  const w = spec.wheels
  const inset = w.inset ?? 0.02
  const wheelInfo = [0, 1].map((i) => {
    const ws = i === 0 ? 1 : w.rearWidthScale ?? 1
    const halfWidth = (w.width * ws) / 2
    return { x: spec.halfWidth - halfWidth - inset, halfWidth, z: body.arches[i].z, widthScale: ws }
  })
  const ctx = { acc, body, cabin, target, q, spec, wheels: wheelInfo }
  archLiners(ctx)
  const p = spec.parts || {}
  if (p.splitter) splitter(ctx, p.splitter)
  if (p.skirts) skirts(ctx, p.skirts)
  if (p.diffuser) diffuser(ctx, p.diffuser)
  if (p.mirrors) mirrors(ctx, p.mirrors)
  if (p.lip) lip(ctx, p.lip)
  if (p.wing) wing(ctx, p.wing)
  if (p.exhausts) exhausts(ctx, p.exhausts)
  if (p.cockpit) cockpit(ctx, p.cockpit)
  if (spec.custom) spec.custom(ctx)
  decals(ctx, spec.decals || [])
  const groups = acc.build()
  if (groups.has('paint')) bakeAO(groups.get('paint'), body, wheelInfo, spec.ao ?? 1)
  return { groups, wheelInfo, body }
}

/**
 * @param {string} id  'aurora' | 'vento' | 'stradale' | 'nebula' (unknown → aurora)
 * @param {{color?: string, finish?: 'metallic'|'pearl'|'matte'|'solid', quality?: 'high'|'low'}} opts
 * @returns {CarRig}
 */
export function buildCar(id, { color = '#c8102e', finish = 'metallic', quality = 'high' } = {}) {
  const def = getCar(id)
  const design = DESIGNS[def.id] || DESIGNS.aurora
  const spec = design(def)
  const q = QUALITY[quality] || QUALITY.high
  const { groups, wheelInfo } = buildBodyGeometry(spec, quality)
  const w = spec.wheels
  const mats = createCarMaterials({ color, finish, rimColor: '#ffffff', transparentGlass: !!spec.transparentGlass })
  mats.paint.vertexColors = true

  const root = new THREE.Group()
  root.name = `Car_${def.id}`
  const body = new THREE.Group()
  body.name = 'Body'
  root.add(body)
  const used = []
  const geometries = []
  for (const name of GROUP_ORDER) {
    const geo = groups.get(name)
    if (!geo) continue
    const mesh = new THREE.Mesh(geo, mats[name])
    mesh.name = name
    if (name === 'glass' && spec.transparentGlass) mesh.renderOrder = 2
    body.add(mesh)
    used.push(mats[name])
    geometries.push(geo)
  }

  // wheels
  const wg = buildWheelGeometries(w, q)
  geometries.push(wg.tyre, wg.rim, wg.brake)
  const positions = []
  for (const [i, front] of [[0, true], [1, false]]) {
    const wi = wheelInfo[i]
    for (const s of [-1, 1]) positions.push({ x: s * wi.x, y: w.radius, z: wi.z, front, widthScale: wi.widthScale })
  }
  // order: FL, FR, RL, RR
  const wheels = new WheelSet({ geos: wg, materials: mats, positions, radius: w.radius })
  for (const m of wheels.meshes) root.add(m)
  used.push(mats.rubber, mats.rim, mats.brake)

  const box = new THREE.Box3()
  for (const g of groups.values()) box.union(g.boundingBox)
  const size = box.getSize(new THREE.Vector3())
  const dims = {
    length: size.z,
    width: 2 * def.halfWidth,
    height: size.y,
    wheelbase: spec.wheelbase,
    track: 2 * wheelInfo[0].x,
    trackRear: 2 * wheelInfo[1].x,
    wheelRadius: w.radius,
  }
  const rig = new CarRig({
    root,
    body,
    materials: used,
    paintMaterial: mats.paint,
    headMaterials: used.includes(mats.head) ? [mats.head] : [],
    tailMaterials: used.includes(mats.tail) ? [mats.tail] : [],
    wheels,
    dims,
    geometries,
    wheelPositions: positions.map((p, i) => ({ name: ['FL', 'FR', 'RL', 'RR'][i], x: p.x, y: p.y, z: p.z, front: p.front })),
  })
  rig.id = def.id
  rig.update(0, {})
  return rig
}
