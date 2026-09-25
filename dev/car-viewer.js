// Dev-only turntable viewer for the procedural cars and the traffic set.
// Served by the vite dev server at /dev/car-viewer.html.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCar, CAR_IDS } from '../src/vehicle/model/CarBuilder.js'

const P = new URLSearchParams(location.search)
const num = (k, d) => (P.has(k) ? parseFloat(P.get(k)) : d)
const VIEWS = { front34: [-35, 14], rear34: [145, 16], side: [90, 4], front: [0, 6], rear: [180, 8], top: [60, 62], low34: [-30, 3] }

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
renderer.setSize(innerWidth, innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = num('exposure', 1.0)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = num('env', 0.9)
scene.background = new THREE.Color(P.get('bg') || '#2a2d33')

const sun = new THREE.DirectionalLight('#fff4e6', num('sun', 2.2))
sun.position.set(-6, 10, -4)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = sun.shadow.camera.bottom = -8
sun.shadow.camera.right = sun.shadow.camera.top = 8
sun.shadow.camera.near = 1
sun.shadow.camera.far = 40
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.02
scene.add(sun)
scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3530', 0.35))

const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: '#5d6066', roughness: 0.85, metalness: 0 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const camera = new THREE.PerspectiveCamera(num('fov', 32), innerWidth / innerHeight, 0.1, 200)
const target = new THREE.Vector3(0, 0.55, 0)
let az = 0, el = 12, dist = num('dist', 9.5)
let spin = P.get('spin') !== '0' && !P.has('view')
const view = VIEWS[P.get('view')] || VIEWS.front34
az = num('az', view[0])
el = num('el', view[1])

const info = document.getElementById('info')
let rigs = []
let label = ''

function placeCamera() {
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el)
  // az = 0 looks at the car's front (car faces -Z)
  camera.position.set(target.x - Math.sin(a) * Math.cos(e) * dist, target.y + Math.sin(e) * dist, target.z - Math.cos(a) * Math.cos(e) * dist)
  camera.lookAt(target)
}

function countTris(root) {
  let tris = 0, draws = 0
  root.traverse((o) => {
    if (!o.isMesh) return
    draws++
    const g = o.geometry
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3
    tris += n * (o.isInstancedMesh ? o.count : 1)
  })
  return { tris, draws }
}

// ?glbtest=1: build a tiny car with the GLB naming conventions, export it with GLTFExporter and
// load it back through loadGlbCar() — exercises the future-asset hook end to end.
async function glbTest() {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const { loadGlbCar } = await import('../src/vehicle/model/GlbCarLoader.js')
  const src = new THREE.Group()
  const paint = new THREE.MeshStandardMaterial({ name: 'Paint', color: '#888888' })
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.4), paint)
  body.position.set(0, 0.62, 0)
  src.add(body)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.8), new THREE.MeshStandardMaterial({ name: 'Glass', color: '#111111' }))
  cabin.position.set(0, 1.1, -0.2)
  src.add(cabin)
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 20).rotateZ(Math.PI / 2)
  const tyreMat = new THREE.MeshStandardMaterial({ name: 'Tyre', color: '#222222' })
  const spokeMat = new THREE.MeshStandardMaterial({ name: 'Rim', color: '#dddddd' })
  for (const [n, x, z] of [['Wheel_FL', -0.85, 1.35], ['Wheel_FR', 0.85, 1.35], ['Wheel_RL', -0.85, -1.35], ['Wheel_RR', 0.85, -1.35]]) {
    // glTF convention: front toward +Z
    const w = new THREE.Group()
    w.name = n
    w.position.set(x, 0.34, z)
    w.add(new THREE.Mesh(tyre, tyreMat))
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.5, 0.06), spokeMat)
    w.add(spoke)
    src.add(w)
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.02), new THREE.MeshStandardMaterial({ name: 'Head', color: '#ffffff' }))
  head.name = 'Light_Head'
  head.position.set(0, 0.75, 2.21)
  src.add(head)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.02), new THREE.MeshStandardMaterial({ name: 'Tail', color: '#550000' }))
  tail.name = 'Light_Tail'
  tail.position.set(0, 0.8, -2.21)
  src.add(tail)
  const glb = await new GLTFExporter().parseAsync(src, { binary: true })
  const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
  const rig = await loadGlbCar(url, { color: P.get('color') || '#1f5fbf', finish: 'metallic' })
  rig.setShadow(true)
  scene.add(rig.root)
  rigs = [rig]
  const { tris, draws } = countTris(rig.root)
  label = `GLB hook test (exported → loadGlbCar)\n${draws} meshes, ${Math.round(tris)} tris, wheels ${rig.wheels ? rig.wheels.nodes.length : 0}, paint ${rig.paintMaterial ? rig.paintMaterial.type : 'none'}\n` +
    `dims ${rig.dims.length.toFixed(2)} × ${rig.dims.width.toFixed(2)} × ${rig.dims.height.toFixed(2)} wb ${rig.dims.wheelbase.toFixed(2)} r ${rig.dims.wheelRadius.toFixed(2)}\n`
  window.__rig = rig
}

async function load() {
  if (P.get('glbtest')) return glbTest()
  if (P.get('traffic')) {
    const { buildTrafficModels } = await import('../src/traffic/trafficModels.js')
    const models = buildTrafficModels({ quality: P.get('quality') || 'high' })
    const colors = ['#9c1c24', '#1f4f8f', '#d8d8d4', '#2f6a44', '#e3a21a', '#5a5f66']
    let x = 0
    const group = new THREE.Group()
    const list = [...models.entries()]
    const gap = 1.1
    const totalW = list.reduce((s, [, m]) => s + m.halfW * 2 + gap, -gap)
    x = -totalW / 2
    let i = 0
    let tris = 0
    for (const [type, m] of list) {
      const mat = trafficPreviewMaterial(colors[i % colors.length])
      const mesh = new THREE.Mesh(m.geometry, mat)
      mesh.castShadow = true
      x += m.halfW
      mesh.position.set(x, 0, 0)
      x += m.halfW + gap
      group.add(mesh)
      tris += m.geometry.index.count / 3
      label += `${type}: ${m.geometry.index.count / 3} tris  ${(2 * m.halfL).toFixed(2)}×${(2 * m.halfW).toFixed(2)}×${m.height.toFixed(2)} m\n`
      i++
    }
    scene.add(group)
    target.set(0, 1.2, 0)
    dist = num('dist', 30)
    label = `traffic set — ${Math.round(tris)} tris total\n` + label
    rigs = []
  } else {
    const id = CAR_IDS.includes(P.get('car')) ? P.get('car') : 'aurora'
    const t0 = performance.now()
    const rig = buildCar(id, { color: P.get('color') || '#c8102e', finish: P.get('finish') || 'metallic', quality: P.get('quality') || 'high' })
    const ms = performance.now() - t0
    rig.setShadow(true)
    scene.add(rig.root)
    if (P.get('debug') === 'backface') addBackfaceProbe(rig.root)
    rigs = [rig]
    const { tris, draws } = countTris(rig.root)
    const d = rig.dims
    label = `${id}  build ${ms.toFixed(0)} ms\ncar: ${draws} draw objects, ${Math.round(tris)} tris\n${d.length.toFixed(2)} × ${d.width.toFixed(2)} × ${d.height.toFixed(2)} m  wb ${d.wheelbase}  track ${d.track.toFixed(2)}\n`
    window.__rig = rig
  }
}

let last = performance.now()
let frames = 0
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (spin) az += dt * 18
  placeCamera()
  for (const rig of rigs) {
    rig.update(dt, { speed: num('speed', 0), steerAngle: num('steer', 0), brake: num('brake', 0), throttle: 0, lights: num('lights', 0) })
  }
  renderer.render(scene, camera)
  const r = renderer.info.render
  info.textContent = label + `frame: ${r.calls} draw calls (incl. shadow pass), ${r.triangles} tris`
  frames++
  window.__frames = frames
  if (frames === 3) window.__viewerReady = true
  requestAnimationFrame(frame)
}

// Debug: magenta back-face copies drawn slightly behind; any magenta visible = hole or inverted normal.
function addBackfaceProbe(root) {
  const red = new THREE.MeshBasicMaterial({ color: '#ff00ff', side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })
  const list = []
  root.traverse((o) => o.isMesh && list.push(o))
  for (const o of list) {
    if (o.material.side === THREE.DoubleSide) continue
    const c = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, red, o.count) : new THREE.Mesh(o.geometry, red)
    if (o.isInstancedMesh) c.instanceMatrix = o.instanceMatrix
    c.frustumCulled = false
    o.parent.add(c)
    c.position.copy(o.position)
    c.quaternion.copy(o.quaternion)
  }
}

function trafficPreviewMaterial(paint) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 })
  const uPaint = { value: new THREE.Color(paint) }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaint = uPaint
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPaint;\nattribute float aLight;\nvarying float vPaint;\nvarying float vLight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint;\nvLight = aLight;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPaint;\nvarying float vPaint;\nvarying float vLight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uPaint, vPaint);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * step(0.5, vLight) * 1.5;')
  }
  return m
}

window.__setView = (a, e, d) => {
  spin = false
  az = a
  el = e
  if (d) dist = d
}
window.__setPaint = (hex, finish) => rigs.forEach((r) => r.setPaint(hex, finish))
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
})
window.__loadError = null
load()
  .then(() => requestAnimationFrame(frame))
  .catch((e) => {
    window.__loadError = String(e && e.stack ? e.stack : e)
    info.textContent = 'ERROR: ' + window.__loadError
    console.error(e)
  })
