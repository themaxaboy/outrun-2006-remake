// Future hook: load an authored glTF/GLB car and wrap it in the same CarRig interface as the
// procedural cars. Conventions expected in the file:
//   nodes  Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR  (pivot at the wheel centre, axle along local X)
//          Light_Head, Light_Tail, optional Light_Brake (meshes, or groups of meshes)
//   material named "Paint" (recoloured by setPaint)
// glTF assets face +Z by convention; the loader turns them to face -Z like the game's cars
// (pass { frontPlusZ: false } for files already modelled facing -Z).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CarRig } from './CarRig.js'
import { applyPaintFinish } from './materials.js'

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const _qs = new THREE.Quaternion()
const _qr = new THREE.Quaternion()

class NodeWheels {
  constructor(nodes, radius, forwardSign) {
    this.nodes = nodes // [{ node, front, rest: Quaternion }]
    this.radius = radius
    this.forwardSign = forwardSign // -1: model faces -Z, +1: model faces +Z (in its own space)
    this.spin = 0
  }

  update(dt, speed, steerAngle) {
    this.spin = (this.spin + (speed * dt) / this.radius) % (Math.PI * 2)
    for (const w of this.nodes) {
      _qs.setFromAxisAngle(Y, w.front ? -steerAngle : 0)
      _qr.setFromAxisAngle(X, this.forwardSign * this.spin)
      w.node.quaternion.copy(_qs).multiply(_qr).multiply(w.rest)
    }
  }
}

function materialsOf(obj) {
  const out = new Set()
  obj?.traverse((o) => {
    if (!o.isMesh) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) out.add(m)
  })
  return [...out]
}

/** Give every mesh under `node` its own clone of its material (so emissive can be driven). */
function ownLightMaterials(node, emissive) {
  const out = []
  node?.traverse((o) => {
    if (!o.isMesh) return
    const src = Array.isArray(o.material) ? o.material : [o.material]
    const cl = src.map((m) => {
      const c = m.clone()
      if (c.emissive && c.emissive.getHex() === 0) c.emissive.set(emissive)
      out.push(c)
      return c
    })
    o.material = Array.isArray(o.material) ? cl : cl[0]
  })
  return out
}

/**
 * @param {string} url
 * @param {{ color?: string, finish?: string, frontPlusZ?: boolean, loader?: GLTFLoader }} opts
 * @returns {Promise<CarRig>}
 */
export async function loadGlbCar(url, { color = null, finish = 'metallic', frontPlusZ = true, loader = null } = {}) {
  const gltf = await (loader || new GLTFLoader()).loadAsync(url)
  const model = gltf.scene
  const root = new THREE.Group()
  root.name = 'Car_glb'
  const body = new THREE.Group()
  body.name = 'Body'
  if (frontPlusZ) model.rotation.y = Math.PI
  body.add(model)
  root.add(body)
  model.updateMatrixWorld(true)

  const head = ownLightMaterials(model.getObjectByName('Light_Head'), '#f4f8ff')
  const tail = ownLightMaterials(model.getObjectByName('Light_Tail'), '#ff1408')
  const brake = ownLightMaterials(model.getObjectByName('Light_Brake'), '#ff1408')
  const all = materialsOf(model)
  let paint = all.find((m) => m.name === 'Paint') || null
  if (paint && color) {
    if (!paint.isMeshPhysicalMaterial) {
      // upgrade to the clearcoat paint so finishes work; swap it on every mesh that uses it
      const up = new THREE.MeshPhysicalMaterial({ name: 'Paint', map: paint.map || null })
      model.traverse((o) => {
        if (!o.isMesh) return
        if (Array.isArray(o.material)) o.material = o.material.map((m) => (m === paint ? up : m))
        else if (o.material === paint) o.material = up
      })
      paint.dispose()
      paint = up
    }
    applyPaintFinish(paint, color, finish)
  }

  // wheels: pivots are the named nodes; radius from the front-left wheel's bounds
  const names = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']
  const nodes = []
  let radius = 0.34
  for (const n of names) {
    const node = model.getObjectByName(n)
    if (!node) continue
    nodes.push({ node, front: n.includes('_F'), rest: node.quaternion.clone() })
    if (n === 'Wheel_FL') {
      const b = new THREE.Box3().setFromObject(node)
      if (!b.isEmpty()) radius = Math.max(0.1, (b.max.y - b.min.y) / 2)
    }
  }
  const wheels = nodes.length ? new NodeWheels(nodes, radius, frontPlusZ ? 1 : -1) : null

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const wp = nodes.map(({ node }) => node.getWorldPosition(new THREE.Vector3()))
  const zs = wp.map((p) => p.z)
  const xs = wp.map((p) => Math.abs(p.x))
  const geometries = []
  model.traverse((o) => {
    if (o.isMesh && o.geometry) geometries.push(o.geometry)
  })
  const rig = new CarRig({
    root,
    body,
    materials: materialsOf(model),
    paintMaterial: paint,
    headMaterials: head,
    tailMaterials: tail,
    brakeMaterials: brake,
    wheels,
    geometries,
    dims: {
      length: size.z,
      width: size.x,
      height: box.max.y,
      wheelbase: zs.length ? Math.max(...zs) - Math.min(...zs) : size.z * 0.6,
      track: xs.length ? 2 * Math.max(...xs) : size.x * 0.85,
      wheelRadius: radius,
    },
    wheelPositions: nodes.map(({ node }, i) => ({ name: node.name, x: wp[i].x, y: wp[i].y, z: wp[i].z, front: node.name.includes('_F') })),
  })
  rig.update(0, {})
  return rig
}
