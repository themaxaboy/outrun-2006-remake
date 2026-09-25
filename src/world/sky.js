// Live sky dome: gradient + sun glow/disc + drifting clouds (tileable noise texture) + stars.
// One draw call, cheap fragment work. Also used (with uEnvBake) to bake the IBL environment.
import * as THREE from 'three'

export function makeCloudTexture(size = 256) {
  // tileable fbm (value noise on periodic lattices)
  const oct = 6
  const lats = []
  for (let o = 0; o < oct; o++) {
    const p = 4 << o
    const a = new Float32Array(p * p)
    let s = 4242 + o * 131
    for (let i = 0; i < p * p; i++) { s = (s * 16807) % 2147483647; a[i] = (s & 0xffff) / 65535 }
    lats.push({ p, a })
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, n = 0
      for (let o = 0; o < oct; o++) {
        const { p, a } = lats[o]
        const fx = (x / size) * p, fy = (y / size) * p
        const xi = Math.floor(fx), yi = Math.floor(fy)
        const tx = fx - xi, ty = fy - yi
        const x0 = xi % p, y0 = yi % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p
        const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty)
        const A = a[y0 * p + x0], B = a[y0 * p + x1], C = a[y1 * p + x0], D = a[y1 * p + x1]
        v += amp * (A + (B - A) * ux + (C - A) * uy + (A - B - C + D) * ux * uy)
        n += amp
        amp *= 0.52
      }
      v /= n
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v * 255))
      data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  return t
}

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // at far plane
}`

const frag = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uFogSun;
uniform vec3 uCloudColor;
uniform float uCloud;
uniform float uStars;
uniform float uTime;
uniform float uMoon;
uniform float uEnvBake;
uniform sampler2D uCloudTex;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float mu = dot(d, uSunDir);
  // base gradient
  float up = pow(clamp(y, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, up);
  // horizon glow toward the sun
  float glow = pow(max(mu, 0.0), 6.0);
  float horizonBand = exp(-abs(y) * 6.0);
  col = mix(col, uFogSun, glow * horizonBand * 0.85);
  col += uSunColor * (pow(max(mu, 0.0), 64.0) * 0.22 + pow(max(mu, 0.0), 8.0) * 0.05);
  // below horizon
  col = mix(col, mix(uHorizon, uGround, 0.6), smoothstep(0.0, -0.08, y));

  // clouds (planar projection)
  float cy = max(y, 0.0);
  if (cy > 0.001 && uCloud > 0.01) {
    vec2 uv = d.xz / (cy + 0.12) * 0.19 + vec2(uTime * 0.0035, uTime * 0.0012);
    float n = texture2D(uCloudTex, uv).r * 0.65 + texture2D(uCloudTex, uv * 2.7 + 0.31).r * 0.35;
    float cover = uCloud;
    float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.32, n);
    dens *= smoothstep(0.0, 0.18, cy); // fade into the haze
    float lit = 0.55 + 0.45 * clamp(uSunDir.y * 2.0 + 0.3, 0.0, 1.0);
    vec3 ccol = uCloudColor * lit;
    // silver lining / forward scattering
    ccol += uSunColor * pow(max(mu, 0.0), 12.0) * 0.35 * (1.0 - dens * 0.6);
    ccol = mix(ccol, uCloudColor * 0.55, smoothstep(0.55, 1.0, n) * 0.5);
    col = mix(col, ccol, dens * 0.92);
  }

  // stars
  if (uStars > 0.01 && y > 0.0) {
    vec3 sp = d * 700.0;
    vec3 g = floor(sp);
    float h = hash13(g);
    // point-like: brightness falls off from a jittered position inside the cell
    vec3 c = g + 0.25 + 0.5 * vec3(hash13(g + 1.3), hash13(g + 2.7), hash13(g + 4.1));
    float pt = smoothstep(0.42, 0.0, length(sp - c));
    float star = step(0.9955, h) * pt * (0.35 + 0.65 * hash13(g + 7.1));
    float tw = 0.75 + 0.25 * sin(uTime * 3.0 + h * 50.0);
    col += vec3(0.9, 0.95, 1.0) * star * tw * uStars * 1.6 * smoothstep(0.0, 0.25, y);
  }

  // sun / moon disc (dimmed in env bake to avoid fireflies)
  float disc = smoothstep(0.99955, 0.99975, mu);
  float discI = mix(mix(14.0, 4.0, uMoon), 1.5, uEnvBake);
  col += uSunColor * disc * discI * step(-0.02, y);

  gl_FragColor = vec4(clamp(col, 0.0, 48.0), 1.0);
}`

export class SkyDome {
  constructor(uniforms, cloudTex) {
    this.uniforms = {
      uSunDir: uniforms.uSunDir,
      uSunColor: uniforms.uSunColor,
      uZenith: uniforms.uZenith,
      uHorizon: uniforms.uHorizon,
      uGround: uniforms.uGround,
      uFogSun: uniforms.uFogSunColor,
      uCloudColor: uniforms.uCloudColor,
      uCloud: uniforms.uCloud,
      uStars: uniforms.uStars,
      uTime: uniforms.uTime,
      uMoon: uniforms.uMoon,
      uEnvBake: { value: 0 },
      uCloudTex: { value: cloudTex },
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material)
    this.mesh.scale.setScalar(5000)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
    this.mesh.name = 'sky'
  }
}
