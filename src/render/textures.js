// Procedural, tileable textures generated at startup (no downloads, no licensing issues).
import * as THREE from 'three'

function makeLattice(period, seed) {
  const n = period * period
  const v = new Float32Array(n)
  let s = seed * 9301 + 49297
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647
    v[i] = (s & 0xffff) / 65535
  }
  return v
}

/** Tileable value noise sampled on an integer-period lattice. */
function tileNoise(lat, period, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period
  const a = lat[y0 * period + x0], b = lat[y0 * period + x1]
  const c = lat[y1 * period + x0], d = lat[y1 * period + x1]
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function tileFbm(lats, size, px, py, baseFreq, oct) {
  let s = 0, amp = 0.5, n = 0, f = baseFreq
  for (let o = 0; o < oct; o++) {
    s += amp * tileNoise(lats[o], f, (px / size) * f, (py / size) * f)
    n += amp
    amp *= 0.5
    f *= 2
  }
  return s / n
}

function toTexture(data, size, { srgb = false, repeat = true } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** Asphalt: albedo (sRGB) + packed [height, roughness] map. */
export function makeAsphalt(size = 512) {
  const lats = [0, 1, 2, 3, 4, 5].map((i) => makeLattice(8 << i, 11 + i))
  const lat2 = [0, 1, 2].map((i) => makeLattice(4 << i, 77 + i))
  const albedo = new Uint8Array(size * size * 4)
  const hr = new Uint8Array(size * size * 4)
  let seed = 1337
  const rnd = () => ((seed = (seed * 16807) % 2147483647) & 0xffff) / 65535
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const fine = tileFbm(lats, size, x, y, 64, 3)
      const mid = tileFbm(lats, size, x, y, 16, 3)
      const macro = tileFbm(lat2, size, x, y, 4, 3)
      // aggregate stones: bright/dark speckles
      const r = rnd()
      const speck = r > 0.965 ? 0.22 : r < 0.02 ? -0.18 : 0
      const v = 0.3 + 0.1 * (fine - 0.5) + 0.07 * (mid - 0.5) + 0.05 * (macro - 0.5) + speck * 0.6
      albedo[i * 4] = Math.max(0, Math.min(255, v * 255 * 0.97))
      albedo[i * 4 + 1] = Math.max(0, Math.min(255, v * 255 * 0.98))
      albedo[i * 4 + 2] = Math.max(0, Math.min(255, v * 255 * 1.02))
      albedo[i * 4 + 3] = 255
      height[i] = fine * 0.6 + mid * 0.3 + speck
    }
  }
  for (let i = 0; i < size * size; i++) {
    hr[i * 4] = Math.max(0, Math.min(255, height[i] * 200))
    const rough = 0.9 + 0.12 * (height[i] - 0.5)
    hr[i * 4 + 1] = Math.max(0, Math.min(255, rough * 255))
    hr[i * 4 + 2] = 0
    hr[i * 4 + 3] = 255
  }
  return { albedo: toTexture(albedo, size, { srgb: true }), hr: toTexture(hr, size) }
}

/** Neutral grey detail noise (for terrain/props) centred on 0.5 in each channel at different scales. */
export function makeDetail(size = 256) {
  const lats = [0, 1, 2, 3, 4].map((i) => makeLattice(8 << i, 101 + i))
  const lats2 = [0, 1, 2, 3].map((i) => makeLattice(4 << i, 201 + i))
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      data[i] = tileFbm(lats, size, x, y, 16, 4) * 255
      data[i + 1] = tileFbm(lats2, size, x, y, 4, 4) * 255
      data[i + 2] = tileFbm(lats, size, x, y, 32, 3) * 255
      data[i + 3] = 255
    }
  }
  return toTexture(data, size)
}

/** Soft radial blob (shadows, light pools, particles). */
export function makeRadial(size = 128) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1
      const d = Math.min(1, Math.hypot(dx, dy))
      const a = Math.pow(1 - d, 2) * (1 - d * d)
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = a * 255
    }
  }
  const t = toTexture(data, size, { repeat: false })
  return t
}
