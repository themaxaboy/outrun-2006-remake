// Note names, chord symbols, chord scales and voice-led voicings.

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

export const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/

/** 'C4' → 60, 'F#5' → 78, 'Bb3' → 58. Returns NaN on bad input. */
export function noteToMidi(name) {
  const m = NOTE_RE.exec(name)
  if (!m) return NaN
  return 12 * (Number(m[3]) + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}

export function midiToName(m) {
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
}

export const mod12 = (x) => ((x % 12) + 12) % 12

// Chord qualities → intervals above the root (semitones). Extensions keep their compound value
// (9 = 14, 11 = 17, 13 = 21) so voicing code can tell tensions from chord tones.
export const QUALITIES = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  69: [0, 4, 7, 9, 14],
  m69: [0, 3, 7, 9, 14],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  maj13: [0, 4, 7, 11, 14, 21],
  'maj7#11': [0, 4, 7, 11, 18],
  'maj9#11': [0, 4, 7, 11, 14, 18],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  m13: [0, 3, 7, 10, 14, 21],
  mmaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  7: [0, 4, 7, 10],
  9: [0, 4, 7, 10, 14],
  13: [0, 4, 7, 10, 14, 21],
  '7b9': [0, 4, 7, 10, 13],
  '7#9': [0, 4, 7, 10, 15],
  '7#11': [0, 4, 7, 10, 18],
  '7b13': [0, 4, 7, 10, 20],
  '7#5': [0, 4, 8, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  '9sus4': [0, 5, 7, 10, 14],
  '13sus4': [0, 5, 7, 10, 14, 21],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
}

export const CHORD_RE = /^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/

const pcOf = (letter, acc) => mod12(LETTER[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0))

const chordCache = new Map()

/** Parse 'F#m11', 'A13sus4', 'A/G', 'Bbmaj9' … Throws on unknown symbols. */
export function parseChord(symbol) {
  const hit = chordCache.get(symbol)
  if (hit) return hit
  const m = CHORD_RE.exec(symbol)
  if (!m || !(m[3] in QUALITIES)) throw new Error(`Unknown chord symbol "${symbol}"`)
  const intervals = QUALITIES[m[3]]
  const root = pcOf(m[1], m[2])
  const bass = m[4] ? pcOf(m[4], m[5]) : root
  const has = (i) => intervals.includes(i)
  const third = has(4) ? 4 : has(3) ? 3 : has(5) ? 5 : has(2) ? 2 : null
  const fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7
  const seventh = has(11) ? 11 : has(10) ? 10 : has(9) ? 9 : null
  const chord = Object.freeze({
    symbol,
    quality: m[3],
    root,
    bass,
    intervals,
    third,
    fifth,
    seventh,
    minor: has(3),
    pcs: [...new Set(intervals.map((i) => mod12(root + i)))],
  })
  chordCache.set(symbol, chord)
  return chord
}

/**
 * Pitch classes that sound "inside" over a chord (chord tones + usable tensions).
 * Used by the analysis tests to check melodies against the harmony.
 */
export function chordScale(chord) {
  const q = chord.quality
  let steps
  if (q === 'm7b5') steps = [0, 2, 3, 5, 6, 8, 10]
  else if (q === 'dim' || q === 'dim7') steps = [0, 2, 3, 5, 6, 8, 9, 11]
  else if (q === 'aug' || q === '7#5') steps = [0, 2, 4, 6, 8, 10]
  else if (/b9|#9/.test(q)) steps = [0, 1, 3, 4, 6, 7, 8, 10] // altered dominant
  else if (q === 'mmaj7') steps = [0, 2, 3, 5, 7, 9, 11]
  else if (chord.minor) steps = [0, 2, 3, 5, 7, 8, 9, 10] // dorian ∪ aeolian
  else if (chord.seventh === 10 || q.includes('sus')) steps = [0, 2, 4, 5, 7, 9, 10] // mixolydian
  else steps = [0, 2, 4, 5, 6, 7, 9, 11] // ionian ∪ lydian
  const set = new Set(steps.map((s) => mod12(chord.root + s)))
  for (const pc of chord.pcs) set.add(pc)
  set.add(chord.bass) // slash bass
  return set
}

function cartesian(options, cb) {
  const n = options.length
  const idx = new Array(n).fill(0)
  const cur = new Array(n)
  for (;;) {
    for (let i = 0; i < n; i++) cur[i] = options[i][idx[i]]
    cb(cur)
    let k = n - 1
    while (k >= 0) {
      idx[k]++
      if (idx[k] < options[k].length) break
      idx[k] = 0
      k--
    }
    if (k < 0) return
  }
}

/**
 * Pick pitches for `chord` inside [lo, hi] with smooth voice leading from `prev`.
 * opts: { lo, hi, n, rootless }
 */
export function voiceChord(chord, opts = {}, prev = null) {
  const lo = opts.lo ?? 55
  const hi = Math.max(lo + 12, opts.hi ?? 79)
  const n = Math.max(1, Math.min(6, opts.n ?? 4))
  const rootless = !!opts.rootless
  const iv = chord.intervals
  const pri = []
  const push = (i) => {
    if (i == null) return
    if (!pri.some((p) => mod12(p - i) === 0)) pri.push(i)
  }
  if (!rootless) push(0)
  push(chord.third)
  push(chord.seventh)
  for (const t of [14, 13, 15, 18, 21, 20, 17, 2]) {
    if (!iv.includes(t)) continue
    // an 11th on a major-third chord is an avoid note
    if (t === 17 && chord.third === 4) continue
    push(t)
  }
  push(chord.fifth)
  push(0)
  const pcs = pri.slice(0, Math.min(n, pri.length)).map((i) => mod12(chord.root + i))
  const options = pcs.map((pc) => {
    const a = []
    for (let m = lo; m <= hi; m++) if (mod12(m) === pc) a.push(m)
    return a
  })
  const hasB9 = iv.includes(13)
  const center = (lo + hi) / 2
  let best = null
  let bestScore = Infinity
  cartesian(options, (cand) => {
    const s = cand.slice().sort((a, b) => a - b)
    let score = 0
    for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) score += 50
    const spread = s[s.length - 1] - s[0]
    if (spread > 17) score += (spread - 17) * 2
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        const d = s[j] - s[i]
        if (d === 1 && j === i + 1) score += s[i] < 60 ? 8 : 4
        if (d === 13 && !hasB9) score += 3
        if (d === 2 && j === i + 1 && s[i] < 55) score += 3
      }
    }
    if (prev && prev.length) {
      if (prev.length === s.length) {
        for (let i = 0; i < s.length; i++) score += Math.abs(s[i] - prev[i]) * 0.8
      } else {
        const pm = prev.reduce((a, b) => a + b, 0) / prev.length
        const sm = s.reduce((a, b) => a + b, 0) / s.length
        score += Math.abs(pm - sm) * 1.5
      }
      // drift guard so long progressions don't creep to the edge of the range
      const sm = s.reduce((a, b) => a + b, 0) / s.length
      score += Math.abs(sm - center) * 0.25
    } else {
      const sm = s.reduce((a, b) => a + b, 0) / s.length
      score += Math.abs(sm - center) * 0.6
    }
    if (score < bestScore) {
      bestScore = score
      best = s
    }
  })
  return best || []
}
