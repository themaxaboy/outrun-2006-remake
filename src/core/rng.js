// Deterministic, seedable RNG. sfc32 seeded from a cyrb128 string hash.
// Every subsystem derives its own stream (hashSeed(stageSeed, 'props', chunk)) so results never
// depend on the order in which things are generated or streamed in.

export function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export function hashSeed(...parts) {
  return parts.join('|')
}

export class RNG {
  constructor(seed) {
    const s = cyrb128(String(seed))
    this._next = sfc32(s[0], s[1], s[2], s[3])
    // warm up
    for (let i = 0; i < 12; i++) this._next()
  }
  next() { return this._next() }
  range(a, b) { return a + (b - a) * this._next() }
  int(a, b) { return a + Math.floor((b - a + 1) * this._next()) } // inclusive
  chance(p) { return this._next() < p }
  sign() { return this._next() < 0.5 ? -1 : 1 }
  pick(arr) { return arr[Math.floor(this._next() * arr.length)] }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0
    for (const e of entries) total += e[1]
    let r = this._next() * total
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0] }
    return entries[entries.length - 1][0]
  }
  gauss() {
    let u = 0, v = 0
    while (u === 0) u = this._next()
    while (v === 0) v = this._next()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}

// Cheap integer hash → [0,1). Used in hot loops where constructing an RNG is too costly.
export function hash1(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d)
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

export function hash2(a, b) {
  return hash1((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) | 0)
}
