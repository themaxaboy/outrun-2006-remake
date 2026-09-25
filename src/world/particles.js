// CPU-simulated sprite pools (tyre smoke, dust, sparks) + GPU-animated precipitation.
import * as THREE from 'three'

const smokeVert = /* glsl */ `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
varying vec3 vW;
uniform float uScale;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_PointSize = aSize * uScale / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}`

const smokeFrag = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uAFogColor;
uniform float uAFogDensity;
varying float vAlpha;
varying vec3 vColor;
varying vec3 vW;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  if (a < 0.004) discard;
  vec3 col = vColor * uLight * (0.85 + 0.3 * (0.5 - c.y));
  float dist = length(vW - cameraPosition);
  col = mix(col, uAFogColor, 1.0 - exp(-dist * uAFogDensity));
  gl_FragColor = vec4(col, a);
}`

const sparkFrag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
varying vec3 vW;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c)) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * a * 6.0, 1.0);
}`

export class SpritePool {
  constructor(max, { additive = false, atmo, scale = 300 } = {}) {
    this.max = max
    this.n = 0
    this.head = 0
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.age = new Float32Array(max)
    this.life = new Float32Array(max)
    this.s0 = new Float32Array(max)
    this.s1 = new Float32Array(max)
    this.a0 = new Float32Array(max)
    this.drag = new Float32Array(max)
    this.grav = new Float32Array(max)
    const g = new THREE.BufferGeometry()
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage)
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage)
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.aPos)
    g.setAttribute('aAlpha', this.aAlpha)
    g.setAttribute('aSize', this.aSize)
    g.setAttribute('aColor', this.aColor)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.uniforms = {
      uScale: { value: scale },
      uLight: { value: new THREE.Vector3(1, 1, 1) },
      uAFogColor: atmo ? atmo.u.uFogColor : { value: new THREE.Vector3(0.7, 0.8, 0.9) },
      uAFogDensity: atmo ? atmo.u.uFogDensity : { value: 0.0004 },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: smokeVert,
      fragmentShader: additive ? sparkFrag : smokeFrag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(g, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
  }

  emit(x, y, z, vx, vy, vz, { life = 1.5, size0 = 1, size1 = 4, alpha = 0.5, color = [1, 1, 1], drag = 1.5, grav = 0 } = {}) {
    const i = this.head
    this.head = (this.head + 1) % this.max
    if (this.n < this.max) this.n++
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
    this.age[i] = 0
    this.life[i] = life
    this.s0[i] = size0
    this.s1[i] = size1
    this.a0[i] = alpha
    this.drag[i] = drag
    this.grav[i] = grav
    const c = this.aColor.array
    c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]
  }

  update(dt) {
    const al = this.aAlpha.array, sz = this.aSize.array
    let alive = 0
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= this.life[i]) { al[i] = 0; continue }
      alive++
      this.age[i] += dt
      const t = Math.min(1, this.age[i] / this.life[i])
      const k = Math.exp(-this.drag[i] * dt)
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      al[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8)
      sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t)
    }
    this.points.geometry.setDrawRange(0, this.n)
    this.aPos.needsUpdate = true
    this.aAlpha.needsUpdate = true
    this.aSize.needsUpdate = true
    this.aColor.needsUpdate = true
    this.points.visible = alive > 0
  }
}

// ── precipitation (rain streaks / snow) — fully GPU-animated in a camera-following box ──
const precipVert = /* glsl */ `
attribute float aEnd;
uniform float uTime;
uniform float uFall;
uniform vec3 uBox;
uniform vec3 uCam;
uniform vec3 uWind;
uniform float uSnow;
varying float vA;
void main() {
  vec3 p = position;
  p.y -= uTime * uFall;
  p.xz += uWind.xz * uTime;
  if (uSnow > 0.5) { p.x += sin(uTime * 1.3 + position.y) * 0.6; p.z += cos(uTime * 1.1 + position.x) * 0.6; }
  // wrap into the box around the camera
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 w = uCam + rel;
  // streak end: offset along the fall/relative-wind direction
  w += aEnd * normalize(vec3(uWind.x, -uFall, uWind.z)) * (uSnow > 0.5 ? 0.05 : 0.9);
  vA = 1.0 - smoothstep(0.25, 0.5, length(rel.xz) / uBox.x);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  gl_PointSize = uSnow > 0.5 ? 60.0 / max(-mv.z, 1.0) : 1.0;
  gl_Position = projectionMatrix * mv;
}`

const precipFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uAmt;
uniform float uSnow;
varying float vA;
void main() {
  float a = vA * uAmt;
  if (uSnow > 0.5) {
    float d = length(gl_PointCoord - 0.5);
    a *= smoothstep(0.5, 0.2, d);
  }
  gl_FragColor = vec4(uColor, a * (uSnow > 0.5 ? 0.9 : 0.35));
}`

export class Precipitation {
  constructor(count = 1800) {
    const box = new THREE.Vector3(70, 40, 70)
    const n = count
    const pos = new Float32Array(n * 2 * 3)
    const end = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * box.x, y = (Math.random() - 0.5) * box.y, z = (Math.random() - 0.5) * box.z
      for (let k = 0; k < 2; k++) {
        pos[(i * 2 + k) * 3] = x; pos[(i * 2 + k) * 3 + 1] = y; pos[(i * 2 + k) * 3 + 2] = z
        end[i * 2 + k] = k
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.uniforms = {
      uTime: { value: 0 }, uFall: { value: 22 }, uBox: { value: box }, uCam: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0.75, 0.8, 0.9) }, uAmt: { value: 0 }, uSnow: { value: 0 },
    }
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: precipVert, fragmentShader: precipFrag, transparent: true, depthWrite: false })
    this.lines = new THREE.LineSegments(g, mat)
    this.lines.frustumCulled = false
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(pos.filter((_, i) => Math.floor(i / 3) % 2 === 0), 3))
    pg.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(n), 1))
    pg.boundingSphere = g.boundingSphere
    this.points = new THREE.Points(pg, mat)
    this.points.frustumCulled = false
    this.lines.renderOrder = this.points.renderOrder = 6
  }

  update(dt, camPos, carVel, type, amount) {
    const u = this.uniforms
    u.uTime.value += dt
    u.uCam.value.copy(camPos)
    u.uAmt.value = amount
    const snow = type === 2
    u.uSnow.value = snow ? 1 : 0
    u.uFall.value = snow ? 2.2 : 24
    u.uColor.value.set(snow ? 0xffffff : 0xb8c4d8)
    // relative wind from the car's motion
    u.uWind.value.set(-carVel.x * (snow ? 0.6 : 0.35), 0, -carVel.z * (snow ? 0.6 : 0.35))
    this.lines.visible = amount > 0.01 && !snow
    this.points.visible = amount > 0.01 && snow
  }
}
