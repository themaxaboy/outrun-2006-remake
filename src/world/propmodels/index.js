// Prop geometry registry: kind → { lod0, lod1, castShadow }
import * as N from './nature.js'
import * as S from './structures.js'

const BUILDERS = {
  palm: (l) => N.palm(l),
  pine: (l) => N.pine(l),
  broadleaf: (l) => N.broadleaf(l),
  shrub: (l) => N.shrub(l),
  rock: (l) => N.rock(l),
  cactus: (l) => N.cactus(l),
  deadtree: (l) => N.deadtree(l),
  bamboo: (l) => N.bamboo(l),
  villa: (l) => S.villa(l),
  cabin: (l) => S.cabin(l),
  chalet: (l) => S.chalet(l),
  lamp: (l) => S.lamp(l),
  streetlight: (l) => S.streetlight(l),
  sign: (l) => S.sign(l),
  lantern: (l) => S.lantern(l),
  pagoda: (l) => S.pagoda(l),
  torii: (l) => S.torii(l),
  tower: (l) => S.tower(l),
  billboard: (l) => S.billboard(l),
  blossom: (l) => S.blossom(l),
  maple: (l) => S.maple(l),
}

let cache = null

export function getPropLibrary() {
  if (cache) return cache
  cache = new Map()
  for (const [kind, fn] of Object.entries(BUILDERS)) {
    const lod0 = fn(0)
    const lod1 = fn(1)
    cache.set(kind, { lod0, lod1 })
  }
  return cache
}

export function propKinds() { return Object.keys(BUILDERS) }
