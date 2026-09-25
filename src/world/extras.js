// Everything in the world that isn't chunk geometry: water, far ground, backdrop silhouettes,
// gantries, particles (smoke/dust/sparks), precipitation and the night headlight pool.
import * as THREE from 'three'
import { Backdrop } from './backdrop.js'
import { Gantries } from './gantries.js'
import { SpritePool, Precipitation } from './particles.js'
import { SkidMarks } from './skids.js'
import { hexLin } from './color.js'
import { terrainContext } from './terrain.js'
import { lerp, clamp } from '../core/math.js'
import { FSM, SURFACE } from '../vehicle/sim.js'

const waterVert = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const waterFrag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uAFogSun;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uTime;
uniform sampler2D uNoise;
uniform float uAFogDensity;
uniform vec2 uAFarFade;
varying vec3 vW;
float hgt(vec2 p) {
  vec2 a = p * 0.0105 + vec2(uTime * 0.011, uTime * 0.006);
  vec2 b = p * 0.033 - vec2(uTime * 0.017, -uTime * 0.012);
  vec2 c = p * 0.11 + vec2(-uTime * 0.03, uTime * 0.021);
  return texture2D(uNoise, a).r + 0.45 * texture2D(uNoise, b).r + 0.18 * texture2D(uNoise, c).r;
}
void main() {
  vec3 toCam = cameraPosition - vW;
  float dist = length(toCam);
  vec3 v = toCam / dist;
  float e = 0.35;
  float h0 = hgt(vW.xz);
  float hx = hgt(vW.xz + vec2(e, 0.0));
  float hz = hgt(vW.xz + vec2(0.0, e));
  float strength = mix(3.2, 0.6, smoothstep(40.0, 900.0, dist));
  vec3 n = normalize(vec3((h0 - hx) * strength, 1.0, (h0 - hz) * strength));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  r.y = abs(r.y);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.42));
  float mu = max(dot(r, uSunDir), 0.0);
  sky = mix(sky, uAFogSun, pow(mu, 6.0) * exp(-r.y * 6.0) * 0.85);
  vec3 spec = uSunColor * (pow(mu, 700.0) * 9.0 + pow(mu, 60.0) * 0.18) * step(0.0, uSunDir.y);
  float amb = dot(uHorizon, vec3(0.3, 0.5, 0.2));
  vec3 deep = uDeep * (0.3 + 0.7 * amb) * (0.55 + 0.45 * max(uSunDir.y, 0.0));
  vec3 shallow = uShallow * (0.3 + 0.7 * amb) * (0.55 + 0.45 * max(uSunDir.y, 0.0));
  vec3 body = mix(shallow, deep, smoothstep(30.0, 500.0, dist));
  // subsurface-ish brightening on wave crests facing the sun
  body += shallow * 0.25 * max(0.0, h0 - 0.9) * max(uSunDir.y, 0.0);
  vec3 col = mix(body, sky * mix(vec3(1.0), uShallow * 2.5, 0.15), fres * 0.8) + spec;
  float famt = 1.0 - exp(-dist * uAFogDensity * 0.7);
  famt = max(famt, smoothstep(uAFarFade.y * 1.2, uAFarFade.y * 2.4, dist));
  col = mix(col, mix(uHorizon, uAFogSun, pow(max(dot(-v, uSunDir), 0.0), 6.0) * 0.85), famt);
  gl_FragColor = vec4(clamp(col, 0.0, 48.0), 1.0);
}`

export class WorldExtras {
  constructor(scene, atmo, tex) {
    this.scene = scene
    this.atmo = atmo
    const u = atmo.u

    // water
    this.waterUniforms = {
      uSunDir: u.uSunDir, uSunColor: u.uSunColor, uZenith: u.uZenith, uHorizon: u.uHorizon, uAFogSun: u.uFogSunColor,
      uAFogDensity: u.uFogDensity, uAFarFade: u.uFarFade, uTime: u.uTime,
      uDeep: { value: new THREE.Vector3(0.02, 0.12, 0.2) }, uShallow: { value: new THREE.Vector3(0.05, 0.4, 0.45) }, uNoise: { value: atmo.cloudTex },
    }
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(14000, 14000, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: this.waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag }),
    )
    this.water.frustumCulled = false
    this.water.renderOrder = -2
    this.water.visible = false
    this.water.name = 'water'
    scene.add(this.water)
    this.waterLevel = -1000
    this.waterTarget = -1000

    // far ground under everything
    this.groundMat = atmo.applyFog(new THREE.MeshStandardMaterial({ color: 0x556644, roughness: 1 }))
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000).rotateX(-Math.PI / 2), this.groundMat)
    this.ground.frustumCulled = false
    this.ground.renderOrder = -3
    this.ground.name = 'ground'
    scene.add(this.ground)
    this.groundLevel = 0
    this.groundTarget = 0
    this.groundColor = new THREE.Color()
    this.groundColorTarget = new THREE.Color()

    this.backdrop = new Backdrop(atmo)
    scene.add(this.backdrop.group)
    this.gantries = new Gantries(scene, atmo)

    this.smoke = new SpritePool(420, { atmo, scale: 520 })
    this.sparkPool = new SpritePool(220, { additive: true, atmo, scale: 260 })
    scene.add(this.smoke.points, this.sparkPool.points)
    this.skids = new SkidMarks(scene, atmo)
    this._wl = new THREE.Vector3()
    this._wr = new THREE.Vector3()
    this._right = new THREE.Vector3()
    this.precip = new Precipitation(1800)
    scene.add(this.precip.lines, this.precip.points)

    // headlight pool (night)
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 26),
      new THREE.MeshBasicMaterial({ map: tex.radial, color: 0xfff1d6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.pool.renderOrder = 2
    scene.add(this.pool)

    this._v = new THREE.Vector3()
    this._carVel = new THREE.Vector3()
    this._lastPos = new THREE.Vector3()
    this.smokeAcc = 0
    this.ctxCache = new WeakMap()
    this.route = null
  }

  ctx(course) {
    let c = this.ctxCache.get(course)
    if (!c) { c = terrainContext(course); this.ctxCache.set(course, c) }
    return c
  }

  reset(route) {
    this.route = route
    this.skids.clear()
    this.gantries.clear()
    const c = this.ctx(route.current)
    this.backdrop.current = null
    for (const l of this.backdrop.layers) l.dying = true
    this.backdrop.setBiome(c.biome, 3, false)
    this._setStageTargets(route.current, true)
  }

  onStage(course) {
    const c = this.ctx(course)
    this.backdrop.setBiome(c.biome, course.uid * 7 + 3, true)
    this._setStageTargets(course, false)
  }

  _setStageTargets(course, snap) {
    const c = this.ctx(course)
    this.waterTarget = c.waterLevel
    if (c.biome.water) {
      const d = hexLin(c.biome.water.color)
      const sh = hexLin(c.biome.water.shallow)
      this.waterUniforms.uDeep.value.set(d[0], d[1], d[2])
      this.waterUniforms.uShallow.value.set(sh[0], sh[1], sh[2])
    }
    this.groundTarget = c.farLevel
    const g = c.biome.palette[c.kind === 'canyon' ? 'sand' : c.kind === 'city' ? 'pavement' : 'grass']
    this.groundColorTarget.setRGB(g[0] * 0.8, g[1] * 0.8, g[2] * 0.8)
    if (snap) {
      this.waterLevel = this.waterTarget
      this.groundLevel = this.groundTarget
      this.groundColor.copy(this.groundColorTarget)
    }
  }

  sparks(pos, side, amount = 1) {
    const n = Math.round(14 * amount)
    for (let i = 0; i < n; i++) {
      this.sparkPool.emit(pos.x + (Math.random() - 0.5), pos.y + 0.4, pos.z + (Math.random() - 0.5),
        (Math.random() - 0.5) * 8 + this._carVel.x * 0.8, 2 + Math.random() * 4, (Math.random() - 0.5) * 8 + this._carVel.z * 0.8,
        { life: 0.35 + Math.random() * 0.3, size0: 0.25, size1: 0.05, alpha: 1, color: [1, 0.55, 0.15], drag: 1.2, grav: 12 })
    }
  }

  update(dt, camera, poser, car, course, look) {
    if (this.route) this.gantries.sync(this.route)
    // car velocity (for particles/precip)
    if (dt > 0) this._carVel.subVectors(poser.position, this._lastPos).divideScalar(dt)
    if (this._carVel.lengthSq() > 200 * 200) this._carVel.set(0, 0, 0)
    this._lastPos.copy(poser.position)

    // water / ground levels ease toward the stage targets
    const k = 1 - Math.exp(-dt * 0.6)
    this.waterLevel = this.waterTarget < -999 ? lerp(this.waterLevel, -60, k * 0.5) : lerp(this.waterLevel, this.waterTarget, k)
    this.water.visible = this.waterLevel > -50
    this.water.position.set(camera.position.x, this.waterLevel, camera.position.z)
    this.groundLevel = lerp(this.groundLevel, this.groundTarget, k)
    this.ground.position.set(camera.position.x, this.groundLevel - 0.5, camera.position.z)
    this.groundColor.lerp(this.groundColorTarget, k)
    this.groundMat.color.copy(this.groundColor)
    this.backdrop.update(dt, camera, this.groundLevel, look.night)

    // tyre smoke & dust
    const drifting = car.fsm === FSM.DRIFT || car.fsm === FSM.ENTRY
    const off = car.surface === SURFACE.OFFROAD && car.v > 8
    const spin = car.fsm === FSM.SPIN
    let rate = 0
    if (drifting) rate = 40 * clamp(Math.abs(car.beta) / 0.5, 0.3, 1) * clamp(car.v / 40, 0.3, 1)
    if (off) rate = Math.max(rate, 50 * clamp(car.v / 30, 0.3, 1))
    if (spin) rate = 60
    this.smokeAcc += rate * dt
    const q = poser.quaternion
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1
      const side = Math.random() < 0.5 ? -1 : 1
      this._v.set(side * 0.8, 0.3, 1.25).applyQuaternion(q).add(poser.position)
      const dust = off && !drifting
      const col = dust ? [0.62, 0.52, 0.4] : [0.85, 0.86, 0.88]
      this.smoke.emit(this._v.x, this._v.y, this._v.z,
        this._carVel.x * 0.35 + (Math.random() - 0.5) * 2, 0.6 + Math.random(), this._carVel.z * 0.35 + (Math.random() - 0.5) * 2,
        { life: dust ? 1.4 : 1.8, size0: 1.2, size1: dust ? 6 : 7.5, alpha: dust ? 0.4 : 0.32, color: col, drag: 1.8 })
    }
    // skid marks from the rear tyres while sliding on tarmac
    const sliding = (drifting && Math.abs(car.beta) > 0.12) || spin || (car.brake > 0.8 && car.v > 25)
    const onTarmac = car.surface !== SURFACE.OFFROAD && car.yOff < 0.05
    const roadY = fr0 => fr0.y + fr0.ny * car.x + 0.015
    const fr0 = poser.frame
    this._wl.set(-0.8, 0, 1.3).applyQuaternion(q).add(poser.position)
    this._wr.set(0.8, 0, 1.3).applyQuaternion(q).add(poser.position)
    this._wl.y = roadY(fr0) + (this._wl.y - poser.position.y) * 0
    this._wr.y = this._wl.y
    this._right.set(fr0.nx, 0, fr0.nz)
    this.skids.update([this._wl, this._wr], this._right, sliding && onTarmac, drifting ? Math.min(1, Math.abs(car.beta) * 2.5) : 0.7)

    const L = look.sunColor
    const amb = look.horizon
    this.smoke.uniforms.uLight.value.set(amb.x * 0.9 + L.x * 0.25, amb.y * 0.9 + L.y * 0.25, amb.z * 0.9 + L.z * 0.25)
    this.smoke.update(dt)
    this.sparkPool.update(dt)
    this.precip.update(dt, camera.position, this._carVel, look.precip, look.precip ? look.precipAmt ?? 1 : 0)

    // headlight pool at night
    const night = look.night
    const fr = poser.frame
    this._v.set(0, 0, -12).applyQuaternion(q).add(poser.position)
    this.pool.position.set(this._v.x, fr.y + fr.ny * car.x + 0.06, this._v.z)
    this.pool.rotation.set(-Math.PI / 2, 0, -poser.bodyYaw, 'YXZ')
    this.pool.material.opacity = clamp((night - 0.3) * 1.2, 0, 0.75)
    this.pool.visible = this.pool.material.opacity > 0.01
  }
}
