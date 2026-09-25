// Terrain height/colour model. Heights are defined relative to the road (so embankments
// follow hills naturally) and fall to the biome's far level at the strip's outer edge.
import { fbm2, ridged2, smoothstep, lerp, clamp } from '../core/math.js'
import { RNG, hashSeed } from '../core/rng.js'
import { getBiome } from './biomes/index.js'
import { mix3 } from './color.js'

export const TERRAIN_COLS = [-0.35, 1.2, 3, 6, 10, 16, 25, 38, 56, 80, 115, 160, 220, 300, 420]
export const TERRAIN_EDGE = 420

/** Per-course terrain context (deterministic per stage + seed). */
export function terrainContext(course, seed = 'or2r') {
  const biome = getBiome(course.stage.biome)
  const rng = new RNG(hashSeed(seed, course.stage.id, 'terrain'))
  const t = biome.terrain
  const startY = course.start.y
  let waterLevel = -1000
  if (t.water === 'sea') waterLevel = 0
  else if (t.water === 'lake') waterLevel = startY - 9
  return {
    biome,
    kind: t.kind,
    waterSide: rng.sign(), // side of the road that faces the sea / lake / valley
    waterLevel,
    farLevel: t.water === 'sea' ? -6 : t.water === 'lake' ? waterLevel - 6 : startY + t.farLevel,
    hillAmp: t.hillAmp,
    sc: t.hillScale,
    snow: course.stage.weather === 'snow',
    ox: rng.range(-5000, 5000),
    oz: rng.range(-5000, 5000),
    parent: null, // set for blend-in at stage starts
  }
}

/** Natural land height (absolute) at world (wx, wz), d metres from the road edge on `side`. */
export function landHeight(ctx, wx, wz, d, side, roadY) {
  const x = (wx + ctx.ox) * ctx.sc
  const z = (wz + ctx.oz) * ctx.sc
  const waterward = side === ctx.waterSide
  switch (ctx.kind) {
    case 'coast': {
      if (waterward) {
        const beach = lerp(roadY - 2.5, ctx.waterLevel - 7, smoothstep(8, 120, d))
        return beach + (fbm2(x * 4, z * 4, 2) - 0.5) * 3
      }
      const n = fbm2(x, z, 4)
      return roadY - 3 + ctx.hillAmp * Math.pow(n, 1.35) * smoothstep(14, 190, d) + (n - 0.5) * 2
    }
    case 'lake': {
      if (waterward) {
        return lerp(roadY - 2.2, ctx.waterLevel - 6, smoothstep(10, 110, d)) + (fbm2(x * 3, z * 3, 2) - 0.5) * 2
      }
      const n = fbm2(x, z, 4)
      return roadY - 2 + ctx.hillAmp * n * smoothstep(15, 230, d)
    }
    case 'canyon': {
      const m = ridged2(x, z, 4)
      const mesa = smoothstep(0.42, 0.52, m) * 0.75 + smoothstep(0.62, 0.7, m) * 0.25
      const rise = smoothstep(35, 210, d)
      return roadY - 3 + ctx.hillAmp * mesa * rise + 10 * fbm2(x * 2, z * 2, 3) * rise
    }
    case 'alpine': {
      const r = ridged2(x, z, 5)
      if (waterward) {
        // valley side: falls away, then distant ridges rise again
        return roadY - 4 - 110 * smoothstep(10, 260, d) + ctx.hillAmp * 0.8 * Math.pow(r, 1.6) * smoothstep(200, 400, d)
      }
      return roadY - 1 + ctx.hillAmp * Math.pow(r, 1.5) * smoothstep(25, 330, d) + 6 * smoothstep(5, 30, d)
    }
    case 'temple': {
      const n = fbm2(x, z, 4)
      return roadY - 1.5 + ctx.hillAmp * n * smoothstep(18, 230, d)
    }
    case 'city':
    default:
      return roadY - 0.7 + (d > 260 ? -12 * smoothstep(260, 420, d) : 0)
  }
}

/** Final terrain height: road-hugging shoulder → land → far level at the outer edge. */
export function terrainHeight(ctx, wx, wz, d, side, roadY) {
  const near = roadY - 0.14
  let land = landHeight(ctx, wx, wz, d, side, roadY)
  if (ctx.parent && ctx.blend < 1) {
    land = lerp(landHeight(ctx.parent, wx, wz, d, side, roadY), land, ctx.blend)
  }
  const farLevel = ctx.parent && ctx.blend < 1 ? lerp(ctx.parent.farLevel, ctx.farLevel, ctx.blend) : ctx.farLevel
  let h = lerp(near, land, smoothstep(2.5, 42, d))
  h = lerp(h, farLevel, smoothstep(320, TERRAIN_EDGE, d))
  return h
}

const tmpA = [0, 0, 0]
const tmpB = [0, 0, 0]

/** Vertex colour (linear RGB) from slope, height, distance and noise. ny = normal.y */
export function terrainColor(ctx, wx, wz, d, side, h, roadY, ny, out) {
  const p = ctx.biome.palette
  const n = fbm2(wx * 0.013 + 11, wz * 0.013 - 7, 3)
  const n2 = fbm2(wx * 0.07, wz * 0.07, 2)
  const slope = 1 - ny
  let c
  switch (ctx.kind) {
    case 'coast':
    case 'lake': {
      c = mix3(p.grass, p.grass2, n, tmpA)
      if (h < ctx.waterLevel + 2.2) c = mix3(c, p.sand, smoothstep(ctx.waterLevel + 2.2, ctx.waterLevel + 0.5, h), tmpA)
      break
    }
    case 'canyon': {
      const band = 0.5 + 0.5 * Math.sin(h * 0.33 + n * 3)
      c = mix3(p.sand, p.dirt, n, tmpA)
      c = mix3(c, mix3(p.rock, p.band, band, tmpB), smoothstep(0.18, 0.45, slope) * 0.9 + smoothstep(roadY + 12, roadY + 40, h) * 0.4, tmpA)
      break
    }
    case 'alpine': {
      c = mix3(p.grass, p.grass2, n, tmpA)
      const snowLine = ctx.snow ? roadY - 40 : roadY + 70 + n * 30
      c = mix3(c, p.snow, smoothstep(snowLine, snowLine + 25, h) * (1 - smoothstep(0.55, 0.8, slope) * 0.6), tmpA)
      if (ctx.snow) c = mix3(c, p.snow, 0.85 * (1 - smoothstep(0.4, 0.75, slope)), tmpA)
      break
    }
    case 'city': {
      c = mix3(p.pavement, p.grass, smoothstep(0.55, 0.62, n) * smoothstep(6, 12, d), tmpA)
      break
    }
    default:
      c = mix3(p.grass, p.grass2, n, tmpA)
  }
  // rock on steep slopes (all biomes)
  c = mix3(c, p.rock, smoothstep(0.32, 0.6, slope) * (ctx.kind === 'city' ? 0 : 1), tmpA)
  // shoulder near the road
  c = mix3(c, p.shoulder, 1 - smoothstep(1.2, 4.5, d), tmpA)
  const shade = 0.86 + 0.28 * n2
  out[0] = c[0] * shade
  out[1] = c[1] * shade
  out[2] = c[2] * shade
  return out
}

/** Max usable strip width on a side (avoids folding on the inside of tight curves / fork wedges). */
export function stripLimit(kMax, side, hw, wedgeHalfGap, innerSide) {
  let lim = TERRAIN_EDGE
  if (kMax * side > 0) lim = Math.min(lim, 0.72 / Math.abs(kMax) - hw)
  if (innerSide && side === innerSide) lim = Math.min(lim, Math.max(0.5, wedgeHalfGap - 1.5))
  return clamp(lim, 0.5, TERRAIN_EDGE)
}
