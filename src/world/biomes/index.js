import coast from './coast.js'
import lakeside from './lakeside.js'
import canyon from './canyon.js'
import alpine from './alpine.js'
import temple from './temple.js'
import metropolis from './metropolis.js'

export const BIOMES = { coast, lakeside, canyon, alpine, temple, metropolis }
export function getBiome(id) { return BIOMES[id] }
