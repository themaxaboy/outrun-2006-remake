// Car-select showroom: studio IBL (RoomEnvironment), glossy floor, turntable camera.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export class Showroom {
  constructor(renderer, makeRig) {
    this.renderer = renderer
    this.makeRig = makeRig
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0b1026)
    const pm = new THREE.PMREMGenerator(renderer)
    this.env = pm.fromScene(new RoomEnvironment(), 0.03).texture
    pm.dispose()
    this.scene.environment = this.env
    this.scene.environmentIntensity = 0.75
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200)
    // floor with a soft radial gradient
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(256, 256, 20, 256, 256, 256)
    grd.addColorStop(0, '#3a4a7a')
    grd.addColorStop(0.45, '#1a2244')
    grd.addColorStop(1, '#0b1026')
    g.fillStyle = grd
    g.fillRect(0, 0, 512, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0, envMapIntensity: 0.4 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.75, 96), new THREE.MeshBasicMaterial({ color: 0xff7a1a }))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.01
    this.scene.add(ring)
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(4, 7, 3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.bias = -0.0008
    key.shadow.normalBias = 0.04
    const sc = key.shadow.camera
    sc.left = sc.bottom = -4; sc.right = sc.top = 4; sc.near = 1; sc.far = 20
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0xffb070, 1.4)
    rim.position.set(-5, 3, -6)
    this.scene.add(rim)
    this.rig = null
    this.angle = 0.6
    this.t = 0
    this.look = { exposure: 1.05, sat: 1.05, contrast: 1.04, temp: 0, lift: 0, bloom: 0.5 }
  }

  async setCar(def, color, finish) {
    const key = `${def.id}|${color}|${finish}`
    if (this.key === key) return
    if (this.rig && this.rigDef === def.id) {
      this.rig.setPaint?.(color, finish)
      this.key = key
      return
    }
    if (this.rig) {
      this.scene.remove(this.rig.root)
      this.rig.dispose?.()
    }
    this.key = key
    this.rigDef = def.id
    this.rig = await this.makeRig(def, color, finish)
    this.rig.setShadow?.(true)
    this.scene.add(this.rig.root)
  }

  update(dt) {
    this.t += dt
    this.angle += dt * 0.25
    const r = 8.6
    this.camera.position.set(Math.cos(this.angle) * r, 2.5 + Math.sin(this.t * 0.4) * 0.15, Math.sin(this.angle) * r)
    // aim below the car so it sits in the upper half, clear of the info panel
    this.camera.lookAt(0, -0.85, 0)
    this.rig?.update(dt, { speed: 0, steerAngle: Math.sin(this.t * 0.5) * 0.3, brake: 0.2, throttle: 0, lights: 1, drift: 0 })
  }

  resize(w, h) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
}
