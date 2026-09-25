// Far silhouette rings (mountains, peaks, mesas, islands, skyline) that follow the camera.
// Haze-blended toward the sky horizon so they read as distant — Forza-like vistas for ~2 draw calls.
import * as THREE from 'three'
import { hexLin } from './color.js'

const SEG = 360
const R = 3300

function profile(kind, seed, layer) {
  const h = new Float32Array(SEG + 1)
  const win = new Float32Array(SEG + 1)
  const rnd = (i) => {
    const x = Math.sin(i * 12.9898 + seed * 78.233 + layer * 3.1) * 43758.5453
    return x - Math.floor(x)
  }
  const noise = (x) => {
    const i = Math.floor(x), f = x - i
    const u = f * f * (3 - 2 * f)
    return rnd(i) * (1 - u) + rnd(i + 1) * u
  }
  const fbm = (x) => noise(x) * 0.55 + noise(x * 2.3) * 0.28 + noise(x * 5.1) * 0.12 + noise(x * 11) * 0.05
  for (let i = 0; i <= SEG; i++) {
    const a = (i % SEG) / SEG
    const x = a * 40 // periodic enough (wraps at SEG via index modulo)
    let v = 0
    switch (kind) {
      case 'peaks': v = Math.pow(fbm(x * 0.9), 2.2) * 1.6 + Math.pow(Math.abs(Math.sin(x * 1.7 + fbm(x) * 3)), 6) * 0.5; break
      case 'mountains': v = Math.pow(fbm(x * 0.7), 1.6) * 1.2; break
      case 'mesas': {
        const m = fbm(x * 0.8)
        v = (m > 0.52 ? 0.75 + (m - 0.52) * 0.6 : m * 0.35) + (m > 0.62 ? 0.25 : 0)
        break
      }
      case 'islands': v = Math.max(0, fbm(x * 0.9) - 0.48) * 2.2; break
      case 'skyline': {
        const b = Math.floor(a * SEG / (2 + (layer ? 1 : 0)))
        v = 0.15 + Math.pow(rnd(b * 3.7), 2.5) * 1.1 + (rnd(b) > 0.93 ? 0.6 : 0)
        win[i] = 1
        break
      }
      default: v = fbm(x) * 0.8
    }
    h[i] = v
  }
  h[SEG] = h[0]
  return { h, win }
}

const vert = /* glsl */ `
attribute float aH;
attribute float aWin;
varying float vH;
varying float vWin;
varying vec3 vDir;
varying vec2 vUv;
void main() {
  vH = aH; vWin = aWin; vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDir = normalize(w.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uHaze;
uniform float uSnow;
uniform float uNight;
uniform float uFade;
varying float vH;
varying float vWin;
varying vec3 vDir;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col = uColor * (0.35 + 0.65 * clamp(uSunDir.y * 2.0 + 0.4, 0.0, 1.0));
  // sunlit rim vs shadow side
  float facing = dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z)));
  col *= 0.8 + 0.25 * facing;
  col = mix(col, vec3(0.95, 0.97, 1.0) * (0.5 + 0.5 * uSunDir.y + 0.3), uSnow * smoothstep(0.55, 0.75, vH));
  // city windows at night
  if (vWin > 0.5) {
    vec2 g = floor(vUv * vec2(1400.0, 60.0));
    float lit = step(0.72, hash(g)) * step(0.06, vUv.y);
    col += vec3(1.0, 0.8, 0.45) * lit * uNight * 1.4;
  }
  float haze = uHaze * (1.0 - 0.45 * smoothstep(0.0, 1.0, vH));
  vec3 sky = mix(uHorizon, uZenith, 0.08);
  col = mix(col, sky, clamp(haze, 0.0, 1.0));
  col = mix(col, uHorizon, uFade);
  gl_FragColor = vec4(col, 1.0);
}`

export class Backdrop {
  constructor(atmo) {
    this.atmo = atmo
    this.group = new THREE.Group()
    this.group.name = 'backdrop'
    this.layers = [] // { mesh, biome }
    this.current = null
  }

  _makeRing(kind, color, height, seed, layer, snow) {
    const { h, win } = profile(kind, seed, layer)
    const pos = new Float32Array((SEG + 1) * 2 * 3)
    const aH = new Float32Array((SEG + 1) * 2)
    const aW = new Float32Array((SEG + 1) * 2)
    const uv = new Float32Array((SEG + 1) * 2 * 2)
    const idx = []
    const r = R * (layer ? 1.12 : 1)
    const H = height * (layer ? 1.35 : 1)
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2
      const x = Math.cos(a) * r, z = Math.sin(a) * r
      pos.set([x, -300, z, x, h[i] * H, z], i * 6)
      aH[i * 2] = 0; aH[i * 2 + 1] = Math.min(1, h[i])
      aW[i * 2] = win[i]; aW[i * 2 + 1] = win[i]
      uv.set([i / SEG, 0, i / SEG, h[i]], i * 4)
      if (i < SEG) {
        const b = i * 2
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aH', new THREE.BufferAttribute(aH, 1))
    g.setAttribute('aWin', new THREE.BufferAttribute(aW, 1))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    const u = this.atmo.u
    const c = hexLin(color)
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(c[0], c[1], c[2]).multiplyScalar(layer ? 0.9 : 0.75) },
        uHorizon: u.uHorizon, uZenith: u.uZenith, uSunDir: u.uSunDir, uSunColor: u.uSunColor,
        uHaze: { value: layer ? 0.72 : 0.55 },
        uSnow: { value: snow ? 1 : 0 },
        uNight: { value: 0 },
        uFade: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
    const m = new THREE.Mesh(g, mat)
    m.frustumCulled = false
    m.renderOrder = -5
    return m
  }

  /** Swap to a biome's backdrop. blend=true animates old sinking / new rising. */
  setBiome(biome, seed = 1, blend = false) {
    const bd = biome.backdrop
    if (this.current === biome.id) return
    this.current = biome.id
    const meshes = [
      this._makeRing(bd.kind, bd.color, bd.height * 0.8, seed + 17, 1, bd.snowcaps),
      this._makeRing(bd.kind, bd.color, bd.height, seed, 0, bd.snowcaps),
    ]
    for (const m of meshes) this.group.add(m)
    for (const l of this.layers) l.dying = true
    this.layers.push(...meshes.map((mesh) => ({ mesh, rise: blend ? 0 : 1, dying: false })))
  }

  update(dt, camera, baseY, night, blendT) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i]
      if (l.dying) {
        l.rise = Math.max(0, l.rise - dt * 0.35)
        if (l.rise <= 0) {
          this.group.remove(l.mesh)
          l.mesh.geometry.dispose()
          l.mesh.material.dispose()
          this.layers.splice(i, 1)
          continue
        }
      } else l.rise = Math.min(1, l.rise + dt * 0.35)
      l.mesh.position.set(camera.position.x, baseY - 400 * (1 - l.rise), camera.position.z)
      l.mesh.material.uniforms.uNight.value = night
    }
  }
}
