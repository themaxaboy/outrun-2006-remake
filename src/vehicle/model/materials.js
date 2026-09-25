// Car materials: multi-layer clearcoat paint with a procedural metallic-flake normal map,
// dark tinted glass, trim plastic, chrome, carbon fibre (procedural twill), rubber, rims,
// brakes and emissive light lenses. Procedural textures are small DataTextures generated once
// and shared by every car (no downloads, no canvas — also works under Node for tests).
import * as THREE from 'three'
import { rng } from './curves.js'

export const FINISHES = ['metallic', 'pearl', 'matte', 'solid']

let _flake = null
let _carbon = null
let _carbonN = null
let _tread = null

function dataTex(data, w, h, { srgb = false, repeat = true, mips = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  t.generateMipmaps = mips
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

/** Random tangent-space normals: each texel is a flake tilted up to ~30°. Tiled via UVs in metres. */
export function flakeNormalMap() {
  if (_flake) return _flake
  const S = 64
  const d = new Uint8Array(S * S * 4)
  const r = rng(9127)
  for (let i = 0; i < S * S; i++) {
    const tilt = Math.pow(r(), 1.6) * 0.55
    const az = r() * Math.PI * 2
    const x = Math.sin(tilt) * Math.cos(az), y = Math.sin(tilt) * Math.sin(az), z = Math.cos(tilt)
    d[i * 4] = Math.round((x * 0.5 + 0.5) * 255)
    d[i * 4 + 1] = Math.round((y * 0.5 + 0.5) * 255)
    d[i * 4 + 2] = Math.round((z * 0.5 + 0.5) * 255)
    d[i * 4 + 3] = 255
  }
  _flake = dataTex(d, S, S)
  _flake.repeat.set(14, 14) // body UVs are in metres → ~7 cm tiles, ~1.1 mm flakes
  return _flake
}

/** 2×2 twill carbon weave: albedo (sRGB) + a matching normal map. */
export function carbonTextures() {
  if (_carbon) return { map: _carbon, normal: _carbonN }
  const S = 64, T = 8 // tow width in texels
  const c = new Uint8Array(S * S * 4)
  const n = new Uint8Array(S * S * 4)
  const r = rng(77)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T)
      const warp = ((tx + ty) >> 1) % 2 === 0 // twill: over 2 under 2, shifted each row
      const fx = (x % T) / T, fy = (y % T) / T
      // along-tow shading (the fibres run along x for warp, y for weft)
      const across = warp ? fy : fx
      const along = warp ? fx : fy
      const bulge = Math.sin(across * Math.PI)
      const sheen = warp ? 0.62 : 0.4
      let v = (0.07 + 0.11 * bulge * sheen + 0.02 * Math.sin(along * Math.PI * 2) + r() * 0.012) * 255
      const i = (y * S + x) * 4
      c[i] = c[i + 1] = v
      c[i + 2] = Math.min(255, v * 1.08)
      c[i + 3] = 255
      const slope = Math.cos(across * Math.PI) * 0.45
      const nx = warp ? 0 : slope, ny = warp ? slope : 0
      const l = Math.hypot(nx, ny, 1)
      n[i] = Math.round((nx / l * 0.5 + 0.5) * 255)
      n[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255)
      n[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255)
      n[i + 3] = 255
    }
  }
  _carbon = dataTex(c, S, S, { srgb: true })
  _carbonN = dataTex(n, S, S)
  _carbon.repeat.set(16, 16) // part UVs are in metres → ~8 mm tows
  _carbonN.repeat.set(16, 16)
  return { map: _carbon, normal: _carbonN }
}

/** Tyre tread normal map. u: across the tyre (tread only in the middle), v: around (tiled). */
export function treadNormalMap() {
  if (_tread) return _tread
  const W = 32, H = 64
  const d = new Uint8Array(W * H * 4)
  const hgt = (x, y) => {
    const u = x / W, v = y / H
    if (u < 0.12 || u > 0.88) return 1 // sidewall region: flat
    // directional V-pattern sipes + two circumferential grooves
    const cu = Math.abs(u - 0.5)
    const phase = (v * 4 + cu * 1.6) % 1
    let h = phase < 0.12 ? 0.25 : 1
    if (Math.abs(cu - 0.17) < 0.03) h = 0
    if (cu > 0.36) h = Math.min(h, (phase + 0.5) % 1 < 0.22 ? 0.3 : 1)
    return h
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = hgt(Math.min(W - 1, x + 1), y) - hgt(Math.max(0, x - 1), y)
      const dy = hgt(x, (y + 1) % H) - hgt(x, (y - 1 + H) % H)
      const nx = -dx * 0.9, ny = -dy * 0.9
      const l = Math.hypot(nx, ny, 1)
      const i = (y * W + x) * 4
      d[i] = Math.round((nx / l * 0.5 + 0.5) * 255)
      d[i + 1] = Math.round((ny / l * 0.5 + 0.5) * 255)
      d[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255)
      d[i + 3] = 255
    }
  }
  _tread = dataTex(d, W, H)
  return _tread
}

/** Configure a MeshPhysicalMaterial for a paint colour + finish. */
export function applyPaintFinish(mat, hex, finish = 'metallic') {
  if (!FINISHES.includes(finish)) finish = 'metallic'
  mat.color.set(hex)
  const flakes = flakeNormalMap()
  const prevIri = mat.iridescence > 0, prevCC = mat.clearcoat > 0, prevN = !!mat.normalMap
  mat.normalMap = null
  mat.iridescence = 0
  mat.sheen = 0
  switch (finish) {
    case 'pearl':
      mat.metalness = 0.45
      mat.roughness = 0.3
      mat.clearcoat = 1
      mat.clearcoatRoughness = 0.04
      mat.iridescence = 0.4
      mat.iridescenceIOR = 1.35
      mat.iridescenceThicknessRange = [180, 420]
      mat.normalMap = flakes
      mat.normalScale.set(0.12, 0.12)
      break
    case 'matte':
      mat.metalness = 0.35
      mat.roughness = 0.58
      mat.clearcoat = 0
      mat.clearcoatRoughness = 0
      break
    case 'solid':
      mat.metalness = 0.04
      mat.roughness = 0.32
      mat.clearcoat = 1
      mat.clearcoatRoughness = 0.035
      break
    default: // metallic
      mat.metalness = 0.6
      mat.roughness = 0.3
      mat.clearcoat = 1
      mat.clearcoatRoughness = 0.045
      mat.normalMap = flakes
      mat.normalScale.set(0.14, 0.14)
  }
  mat.userData.finish = finish
  mat.userData.color = hex
  if (prevIri !== mat.iridescence > 0 || prevCC !== mat.clearcoat > 0 || prevN !== !!mat.normalMap) mat.needsUpdate = true
  return mat
}

export function createPaintMaterial(hex = '#c8102e', finish = 'metallic') {
  const mat = new THREE.MeshPhysicalMaterial({ name: 'Paint', envMapIntensity: 1.15 })
  applyPaintFinish(mat, hex, finish)
  mat.needsUpdate = true
  return mat
}

export function createGlassMaterial({ tint = '#06080c', transparent = false } = {}) {
  return new THREE.MeshPhysicalMaterial({
    name: 'Glass',
    color: tint,
    metalness: 0.0,
    roughness: 0.03,
    ior: 1.75,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.015,
    envMapIntensity: 1.8,
    transparent,
    opacity: transparent ? 0.55 : 1,
    depthWrite: !transparent,
  })
}

export function createTrimMaterial(color = '#0b0c0e') {
  return new THREE.MeshStandardMaterial({ name: 'Trim', color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide })
}

export function createChromeMaterial() {
  return new THREE.MeshStandardMaterial({ name: 'Chrome', color: '#e6e8ea', metalness: 1, roughness: 0.09, envMapIntensity: 1.3 })
}

export function createCarbonMaterial() {
  const { map, normal } = carbonTextures()
  return new THREE.MeshPhysicalMaterial({
    name: 'Carbon',
    color: '#ffffff',
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.4, 0.4),
    metalness: 0.25,
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  })
}

export function createRubberMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'Rubber',
    color: '#121314',
    roughness: 0.86,
    metalness: 0,
    normalMap: treadNormalMap(),
    normalScale: new THREE.Vector2(0.8, 0.8),
  })
}

export function createRimMaterial(color = '#2b2e33', finish = 'metallic') {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'Rim',
    color,
    vertexColors: true,
    metalness: finish === 'satin' ? 0.7 : 0.9,
    roughness: finish === 'satin' ? 0.42 : 0.24,
    clearcoat: finish === 'satin' ? 0.2 : 0.8,
    clearcoatRoughness: 0.08,
  })
  return m
}

export function createBrakeMaterial() {
  return new THREE.MeshStandardMaterial({ name: 'Brakes', color: '#ffffff', vertexColors: true, metalness: 0.55, roughness: 0.42 })
}

export function createHeadlightMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'Headlight',
    color: '#d9e2ea',
    emissive: '#f4f8ff',
    emissiveIntensity: 0.4,
    metalness: 0.2,
    roughness: 0.12,
  })
}

export function createTaillightMaterial() {
  return new THREE.MeshStandardMaterial({
    name: 'Taillight',
    color: '#8a0c12',
    emissive: '#ff0206',
    emissiveIntensity: 0.6,
    metalness: 0.1,
    roughness: 0.18,
  })
}

/** Every material a procedural car uses, keyed by the geometry group names. */
export function createCarMaterials({ color = '#c8102e', finish = 'metallic', rimColor = '#2b2e33', rimFinish = 'metallic', transparentGlass = false } = {}) {
  const m = {
    paint: createPaintMaterial(color, finish),
    glass: createGlassMaterial({ transparent: transparentGlass }),
    trim: createTrimMaterial(),
    chrome: createChromeMaterial(),
    carbon: createCarbonMaterial(),
    head: createHeadlightMaterial(),
    tail: createTaillightMaterial(),
    rubber: createRubberMaterial(),
    rim: createRimMaterial(rimColor, rimFinish),
    brake: createBrakeMaterial(),
  }
  return m
}
