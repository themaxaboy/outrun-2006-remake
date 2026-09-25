// CarRig: the renderable car handed to the game. root is positioned by the game every frame;
// update() animates wheels (spin + steer), light emissive levels and a little body squat/dive.
import { applyPaintFinish } from './materials.js'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t

export class CarRig {
  /**
   * @param o.root            THREE.Group (added to the scene by the game)
   * @param o.body            THREE.Object3D holding the body meshes (pitched for squat/dive)
   * @param o.materials       every material used
   * @param o.paintMaterial   the body paint (MeshPhysicalMaterial)
   * @param o.headMaterials   materials whose emissiveIntensity follows the headlights
   * @param o.tailMaterials   materials whose emissiveIntensity follows the taillights/brakes
   * @param o.brakeMaterials  optional separate brake-light materials (0 unless braking)
   * @param o.wheels          driver with update(dt, speed, steerAngle)
   * @param o.dims            { length, width, height, wheelbase, track, wheelRadius }
   * @param o.geometries      geometries owned by this rig (disposed in dispose())
   */
  constructor(o) {
    this.root = o.root
    this.body = o.body || o.root
    this.materials = o.materials
    this.paintMaterial = o.paintMaterial || null
    this.headMaterials = o.headMaterials || []
    this.tailMaterials = o.tailMaterials || []
    this.brakeMaterials = o.brakeMaterials || []
    this.wheels = o.wheels || null
    this.dims = o.dims
    this.wheelPositions = o.wheelPositions || []
    this.geometries = o.geometries || []
    this.meshes = []
    this.root.traverse((c) => {
      if (c.isMesh) this.meshes.push(c)
    })
    this._pitch = 0
    this._lift = 0
    this.headIntensity = 0.4
    this.tailIntensity = 0.6
  }

  setPaint(hex, finish) {
    if (!this.paintMaterial) return
    const f = finish || this.paintMaterial.userData.finish || 'metallic'
    applyPaintFinish(this.paintMaterial, hex, f)
  }

  update(dt, s = {}) {
    const speed = s.speed || 0
    const steer = s.steerAngle || 0
    const brake = clamp(s.brake || 0, 0, 1)
    const throttle = clamp(s.throttle || 0, 0, 1)
    const lights = clamp(s.lights || 0, 0, 1)
    if (this.wheels) this.wheels.update(dt, s.crashed ? speed * 0.5 : speed, s.crashed ? 0 : steer)
    // lights: taillights 0.6 idle (a bit brighter at night) → 5 braking; headlights 0.4 day → 8 night
    const tailBase = 0.6 + 0.9 * lights
    this.tailIntensity = lerp(tailBase, 5, brake)
    this.headIntensity = lerp(0.4, 8, lights)
    for (const m of this.tailMaterials) m.emissiveIntensity = this.tailIntensity
    for (const m of this.headMaterials) m.emissiveIntensity = this.headIntensity
    for (const m of this.brakeMaterials) m.emissiveIntensity = lerp(0, 5, brake)
    // squat (throttle) / dive (brake): tiny pitch of the body relative to the wheels
    const k = clamp(Math.abs(speed) / 8, 0, 1)
    const pitchT = (throttle * 0.0055 - brake * 0.011) * k
    const a = dt > 0 ? 1 - Math.exp(-10 * dt) : 1
    this._pitch += (pitchT - this._pitch) * a
    this._lift += ((s.drift || 0) * 0.004 - this._lift) * a
    this.body.rotation.x = this._pitch
    this.body.position.y = -Math.abs(this._pitch) * 0.6 - this._lift
  }

  setShadow(castShadow) {
    for (const m of this.meshes) {
      m.castShadow = !!castShadow
      m.receiveShadow = false
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    if (this.root.parent) this.root.parent.remove(this.root)
  }
}
