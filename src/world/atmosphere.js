// Lighting + atmosphere controller: interpolates between stage "looks" (time of day + weather),
// drives sun/hemi lights, the sky dome, the IBL bake and a custom height/sun-inscatter fog that
// is injected into every world material (applyFog). The far fade hides the streaming edge.
import * as THREE from 'three'
import { getTOD } from './timeOfDay.js'
import { hexLin } from './color.js'
import { SkyDome, makeCloudTexture } from './sky.js'
import { DEG, lerp, clamp } from '../core/math.js'

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2])

export function makeLook(stage, heading0 = 0) {
  const t = getTOD(stage.tod)
  const el = t.sunEl * DEG
  const az = heading0 + t.sunAz * DEG
  // heading 0 = -Z; azimuth measured like heading
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
  const lit = (hex, k = 1) => V3(hexLin(hex)).multiplyScalar(k)
  const look = {
    sunDir,
    sunColor: lit(t.sun, t.sunI),
    zenith: lit(t.zenith),
    horizon: lit(t.horizon),
    ground: lit(t.ground),
    hemiI: t.hemiI,
    fog: lit(t.horizon), // fog = sky horizon so distant terrain melts into the sky exactly
    fogSun: lit(t.fogSun),
    fogDensity: t.fogDensity,
    exposure: t.exposure,
    cloud: t.cloud,
    cloudColor: lit(t.cloudColor),
    stars: t.stars,
    night: t.night,
    moon: t.moon ? 1 : 0,
    envI: t.envI,
    sat: t.grade.sat, temp: t.grade.temp, contrast: t.grade.contrast, lift: t.grade.lift,
    bloom: t.bloom,
    wet: 0,
    precip: 0, // 1 rain, 2 snow
    wind: 1,
  }
  if (stage.weather === 'rain') {
    look.fogDensity *= 2.1; look.cloud = 0.97; look.sat *= 0.9; look.wet = 1; look.precip = 1; look.stars = 0
  } else if (stage.weather === 'snow') {
    look.fogDensity *= 1.8; look.cloud = 1; look.precip = 2; look.sat *= 0.92
  } else if (stage.weather === 'mist') {
    look.fogDensity *= 2.6; look.cloud = Math.max(look.cloud, 0.6)
  }
  return look
}

export function lerpLook(a, b, t, out) {
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize()
  for (const k of ['sunColor', 'zenith', 'horizon', 'ground', 'fog', 'fogSun', 'cloudColor']) out[k].copy(a[k]).lerp(b[k], t)
  for (const k of ['hemiI', 'fogDensity', 'exposure', 'cloud', 'stars', 'night', 'moon', 'envI', 'sat', 'temp', 'contrast', 'lift', 'bloom', 'wet', 'wind']) {
    out[k] = lerp(a[k], b[k], t)
  }
  out.precip = t < 0.5 ? a.precip : b.precip
  out.precipAmt = a.precip === b.precip ? 1 : t < 0.5 ? 1 - t * 2 : t * 2 - 1
  return out
}

function cloneLook(l) {
  const o = {}
  for (const k in l) o[k] = l[k] && l[k].isVector3 ? l[k].clone() : l[k]
  return o
}

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene
    this.renderer = renderer
    this.u = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Vector3(1, 1, 1) },
      uZenith: { value: new THREE.Vector3() },
      uHorizon: { value: new THREE.Vector3() },
      uGround: { value: new THREE.Vector3() },
      uFogColor: { value: new THREE.Vector3() },
      uFogSunColor: { value: new THREE.Vector3() },
      uFogDensity: { value: 0.0004 },
      uFogHeight: { value: 0.012 },
      uFogBaseY: { value: 0 },
      uFarFade: { value: new THREE.Vector2(1100, 1500) },
      uCloudColor: { value: new THREE.Vector3(1, 1, 1) },
      uCloud: { value: 0.3 },
      uStars: { value: 0 },
      uMoon: { value: 0 },
      uTime: { value: 0 },
    }
    this.cloudTex = makeCloudTexture(256)
    this.sky = new SkyDome(this.u, this.cloudTex)
    scene.add(this.sky.mesh)

    this.sun = new THREE.DirectionalLight(0xffffff, 3)
    this.sun.name = 'sun'
    this.sun.castShadow = false
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    scene.add(this.sun, this.sun.target)
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5)
    scene.add(this.hemi)

    this.look = null
    this.lookA = null
    this.lookB = null
    this.blend = 1
    this.envTarget = null
    this.pmrem = new THREE.PMREMGenerator(renderer)
    this.envScene = new THREE.Scene()
    this.envSky = new SkyDome(this.u, this.cloudTex)
    this.envSky.uniforms.uEnvBake.value = 1
    this.envScene.add(this.envSky.mesh)
    this.envDirty = true
    this._lastEnvBlend = -1
    this.shadowSize = 70
  }

  setShadows(enabled, mapSize = 2048) {
    this.sun.castShadow = enabled
    if (enabled) {
      this.sun.shadow.mapSize.set(mapSize, mapSize)
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null }
      const s = this.shadowSize / 2
      const c = this.sun.shadow.camera
      c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 400
      c.updateProjectionMatrix()
    }
  }

  /** Jump straight to a stage's look. */
  setStage(stage, heading0) {
    this.lookB = makeLook(stage, heading0)
    this.lookA = this.lookB
    this.look = cloneLook(this.lookB)
    this.blend = 1
    this._apply()
    this.envDirty = true
  }

  /** Start a blend toward another stage (progress driven by setBlend). */
  beginBlend(stage, heading0) {
    this.lookA = cloneLook(this.look)
    this.lookB = makeLook(stage, heading0)
    this.blend = 0
    this._lastEnvBlend = 0
  }

  setBlend(t) {
    t = clamp(t, 0, 1)
    if (!this.lookA || !this.lookB) return
    this.blend = t
    lerpLook(this.lookA, this.lookB, t, this.look)
    this._apply()
    // re-bake IBL in a few discrete steps during the blend
    if (Math.abs(t - this._lastEnvBlend) >= 0.25 || (t === 1 && this._lastEnvBlend !== 1)) {
      this._lastEnvBlend = t
      this.envDirty = true
    }
  }

  _apply() {
    const L = this.look
    const u = this.u
    u.uSunDir.value.copy(L.sunDir)
    u.uSunColor.value.copy(L.sunColor)
    u.uZenith.value.copy(L.zenith)
    u.uHorizon.value.copy(L.horizon)
    u.uGround.value.copy(L.ground)
    u.uFogColor.value.copy(L.fog)
    u.uFogSunColor.value.copy(L.fogSun)
    u.uFogDensity.value = L.fogDensity
    u.uCloudColor.value.copy(L.cloudColor)
    u.uCloud.value = L.cloud
    u.uStars.value = L.stars
    u.uMoon.value = L.moon
    const sc = L.sunColor
    const I = Math.max(sc.x, sc.y, sc.z)
    this.sun.color.setRGB(sc.x / I, sc.y / I, sc.z / I)
    // below the horizon the "sun" light fades out (dusk/twilight use the moon/sky only)
    this.sun.intensity = I * clamp((L.sunDir.y + 0.03) * 12, 0, 1)
    this.hemi.color.setRGB(L.zenith.x, L.zenith.y, L.zenith.z).lerp(new THREE.Color(L.horizon.x, L.horizon.y, L.horizon.z), 0.5)
    const hc = this.hemi.color
    const hm = Math.max(hc.r, hc.g, hc.b) || 1
    hc.multiplyScalar(1 / hm)
    this.hemi.groundColor.setRGB(L.ground.x, L.ground.y, L.ground.z)
    this.hemi.intensity = L.hemiI
    this.scene.environmentIntensity = L.envI
  }

  bakeEnvironment() {
    const old = this.envTarget
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 6000, { size: 128 })
    this.scene.environment = this.envTarget.texture
    if (old) old.dispose()
    this.envDirty = false
  }

  update(dt, camera, focus) {
    this.u.uTime.value += dt
    this.sky.mesh.position.copy(camera.position)
    if (this.envDirty) this.bakeEnvironment()
    // sun light follows the focus point; snap to texels to avoid shimmering
    const d = this.look.sunDir
    const lightDir = d.y > 0.02 ? d : new THREE.Vector3(-d.x, 0.35, -d.z).normalize()
    const s = this.shadowSize
    const texel = s / (this.sun.shadow.mapSize.x || 2048)
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, focus.y, fz)
    this.sun.position.set(fx + lightDir.x * 150, focus.y + lightDir.y * 150, fz + lightDir.z * 150)
    this.sun.target.updateMatrixWorld()
  }

  setFarFade(near, far) { this.u.uFarFade.value.set(near, far) }

  /** Inject the custom fog into a (built-in) material. Chains existing onBeforeCompile. */
  applyFog(material) {
    const prev = material.onBeforeCompile
    const u = this.u
    material.onBeforeCompile = (shader, r) => {
      if (prev) prev(shader, r)
      shader.uniforms.uSunDir = u.uSunDir
      shader.uniforms.uAFogColor = u.uFogColor
      shader.uniforms.uAFogSun = u.uFogSunColor
      shader.uniforms.uAFogDensity = u.uFogDensity
      shader.uniforms.uAFogHeight = u.uFogHeight
      shader.uniforms.uAFogBaseY = u.uFogBaseY
      shader.uniforms.uAFarFade = u.uFarFade
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vAtmoW;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvAtmoW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvAtmoW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vAtmoW;
uniform vec3 uSunDir;
uniform vec3 uAFogColor;
uniform vec3 uAFogSun;
uniform float uAFogDensity;
uniform float uAFogHeight;
uniform float uAFogBaseY;
uniform vec2 uAFarFade;`)
        .replace('#include <fog_fragment>', `
{
  vec3 fd = vAtmoW - cameraPosition;
  float fdist = length(fd);
  vec3 fdir = fd / max(fdist, 1e-3);
  float avgY = 0.5 * (vAtmoW.y + cameraPosition.y) - uAFogBaseY;
  float hf = exp(-max(avgY, 0.0) * uAFogHeight);
  float famt = 1.0 - exp(-fdist * uAFogDensity * (0.35 + 0.65 * hf));
  famt = max(famt, smoothstep(uAFarFade.x, uAFarFade.y, fdist));
  float sunAmt = pow(max(dot(fdir, uSunDir), 0.0), 6.0);
  vec3 fcol = mix(uAFogColor, uAFogSun, sunAmt * 0.85);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fcol, clamp(famt, 0.0, 1.0));
}
#include <fog_fragment>`)
    }
    const prevKey = material.customProgramCacheKey?.bind(material)
    material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|atmo'
    material.needsUpdate = true
    return material
  }
}
