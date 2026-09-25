// Pattern notation, compiler and validator for the built-in tracks.
//
// All patterns run on a 16-step (sixteenth-note) grid; bars are separated by '|'.
//
// GRID patterns (drums, chord comping) — one character per step, spaces ignored:
//   .  rest        -  hold previous hit        x  hit   X  accent   o  ghost
//   0-7 (chordal instruments only) play that note of the current voicing (arpeggio)
//
// SEQ patterns (melodies, basslines, montunos) — whitespace separated tokens `body[:len]`:
//   .        rest               -        tie / extend previous note (works across bars)
//   F#5      absolute note      C5+E5    several notes at once
//   r        chord root (slash bass if any)     n  root of the NEXT chord (anticipation)
//   2 3 4 5 6 7 8 9   chord-relative degrees (3/5/7 follow the chord quality: m3, b7, b5 …)
//   suffixes: ^ octave up, _ octave down, > +1 semitone, < -1 semitone,
//             ! accent, * ghost; prefix ~ = glide (portamento) into the note.
//
// CHORDS: 'Dmaj9 | Am9 D9 | Gm6:3 C7:1' — whitespace separated symbols per bar; `:beats`
//   gives an explicit length, otherwise the bar is split evenly.
import { noteToMidi, parseChord, voiceChord, mod12 } from './theory.js'

export const STEPS_PER_BAR = 16

export const INSTRUMENT_TYPES = ['drums', 'ep', 'pad', 'stab', 'bass', 'lead', 'mallet', 'piano', 'pluck']
export const MONO_TYPES = new Set(['bass', 'lead'])
export const CHORDAL_TYPES = new Set(['ep', 'pad', 'stab', 'piano', 'pluck', 'mallet'])
// String parts default to GRID for these types and to SEQ for the rest (bass, lead, mallet).
// Use { grid: '…' } or { seq: '…' } to be explicit.
export const GRID_DEFAULT = new Set(['ep', 'pad', 'stab', 'piano', 'pluck'])

export const DRUM_VOICES = [
  'kick',
  'snare',
  'clap',
  'rim',
  'hat',
  'ohat',
  'shaker',
  'tomHi',
  'tomMid',
  'tomLo',
  'timbHi',
  'timbLo',
  'paila',
  'congaHi',
  'congaLo',
  'congaSlap',
  'congaMute',
  'cowbell',
  'clave',
  'crash',
]

const GRID_VEL = { x: 0.8, X: 1, o: 0.45 }

export function splitBars(str) {
  return String(str)
    .split('|')
    .map((s) => s.trim())
}

/** GRID → array of step characters (length bars*16). */
export function parseGrid(str) {
  const bars = splitBars(str)
  const steps = []
  bars.forEach((b, bi) => {
    const chars = b.replace(/\s+/g, '')
    if (chars.length !== STEPS_PER_BAR) throw new Error(`grid bar ${bi + 1} has ${chars.length} steps (want ${STEPS_PER_BAR}): "${b}"`)
    for (const c of chars) {
      if (!/[.\-xXo0-7]/.test(c)) throw new Error(`grid: bad character "${c}" in "${b}"`)
      steps.push(c)
    }
  })
  return { bars: bars.length, steps }
}

const NOTE_TOKEN = /^(~)?([A-G](?:#|b)?-?\d|[rn2-9])([_^]*)([<>]*)([!*]?)$/

function parseNoteToken(s) {
  const m = NOTE_TOKEN.exec(s)
  if (!m) throw new Error(`seq: bad note "${s}"`)
  const glide = !!m[1]
  const p = m[2]
  const abs = /^[A-G]/.test(p) ? noteToMidi(p) : null
  let oct = 0
  for (const c of m[3]) oct += c === '^' ? 1 : -1
  let semi = 0
  for (const c of m[4]) semi += c === '>' ? 1 : -1
  const vel = m[5] === '!' ? 1 : m[5] === '*' ? 0.45 : 0.8
  return { abs, deg: abs == null ? p : null, oct, semi, vel, glide }
}

/** SEQ → { bars, tokens: [{ step, len, kind, notes, vel, glide }] } */
export function parseSeq(str) {
  const bars = splitBars(str)
  const tokens = []
  let base = 0
  bars.forEach((b, bi) => {
    let pos = 0
    for (const tok of b.split(/\s+/).filter(Boolean)) {
      const [body, lenStr] = tok.split(':')
      const len = lenStr === undefined ? 1 : Number(lenStr)
      if (!Number.isInteger(len) || len < 1) throw new Error(`seq: bad length in "${tok}"`)
      let t
      if (body === '.') t = { kind: 'rest' }
      else if (body === '-') t = { kind: 'hold' }
      else {
        const notes = body.split('+').map(parseNoteToken)
        const marked = notes.find((n) => n.vel !== 0.8)
        t = { kind: 'notes', notes, vel: marked ? marked.vel : 0.8, glide: notes.some((n) => n.glide) }
      }
      t.step = base + pos
      t.len = len
      tokens.push(t)
      pos += len
    }
    if (pos !== STEPS_PER_BAR) throw new Error(`seq bar ${bi + 1} lasts ${pos} steps (want ${STEPS_PER_BAR}): "${b}"`)
    base += STEPS_PER_BAR
  })
  return { bars: bars.length, tokens }
}

/** CHORDS → { bars, list: [{ step, len, chord }] } */
export function parseChords(str) {
  const bars = splitBars(str)
  const list = []
  bars.forEach((b, bi) => {
    const toks = b.split(/\s+/).filter(Boolean)
    if (!toks.length) throw new Error(`chords: empty bar ${bi + 1}`)
    const parsed = toks.map((t) => {
      const [sym, beats] = t.split(':')
      return { chord: parseChord(sym), beats: beats === undefined ? null : Number(beats) }
    })
    const fixed = parsed.reduce((a, p) => a + (p.beats ?? 0), 0)
    const free = parsed.filter((p) => p.beats == null).length
    const each = free ? (4 - fixed) / free : 0
    let pos = 0
    for (const p of parsed) {
      const beats = p.beats ?? each
      const len = beats * 4
      if (!Number.isInteger(len) || len <= 0) throw new Error(`chords: bar ${bi + 1} "${b}" does not divide into whole steps`)
      list.push({ step: bi * STEPS_PER_BAR + pos, len, chord: p.chord })
      pos += len
    }
    if (pos !== STEPS_PER_BAR) throw new Error(`chords: bar ${bi + 1} "${b}" covers ${pos / 4} beats (want 4)`)
  })
  return { bars: bars.length, list }
}

const normPart = (part) => (typeof part === 'string' ? { p: part } : part)

/** Semitone offset of a chord-relative degree. */
function degreeInterval(chord, deg) {
  switch (deg) {
    case '2':
      return 2
    case '3':
      return chord.third ?? 4
    case '4':
      return 5
    case '5':
      return chord.fifth
    case '6':
      return 9
    case '7':
      return chord.seventh ?? 12
    case '8':
      return 12
    case '9':
      return 14
    default:
      return 0
  }
}

const placeAbove = (pc, base) => base + mod12(pc - base)

function resolveNote(n, chord, next, base) {
  let m
  if (n.abs != null) m = n.abs
  else if (n.deg === 'r') m = placeAbove(chord.bass, base)
  else if (n.deg === 'n') m = placeAbove(next.bass, base)
  else m = placeAbove(chord.root, base) + degreeInterval(chord, n.deg)
  return m + n.oct * 12 + n.semi
}

/**
 * Compile a track definition into a flat step timeline.
 * Returns { id, title, bpm, swing, totalSteps, loopStep, slots, events[step] → [event], chordAt[step] }
 * event: { i: instrumentKey, s: absStep, d: durSteps, v, n: [midi…] | drum: voice, g: glide, l: legatoToNext }
 */
export function compileTrack(track) {
  const slots = []
  let step = 0
  for (const name of track.arrangement) {
    const sec = track.sections[name]
    if (!sec) throw new Error(`${track.id}: unknown section "${name}" in arrangement`)
    slots.push({ name, start: step, bars: sec.bars, steps: sec.bars * STEPS_PER_BAR })
    step += sec.bars * STEPS_PER_BAR
  }
  const totalSteps = step
  const loopIndex = track.loop ?? 0
  const loopStep = slots[loopIndex].start

  // Chord timeline.
  const segs = []
  const segAt = new Int32Array(totalSteps)
  for (const slot of slots) {
    const pc = parseChords(track.sections[slot.name].chords)
    if (slot.bars % pc.bars !== 0) throw new Error(`${track.id}/${slot.name}: ${pc.bars} chord bars do not divide ${slot.bars} bars`)
    const reps = slot.bars / pc.bars
    for (let r = 0; r < reps; r++) {
      for (const c of pc.list) {
        const start = slot.start + r * pc.bars * STEPS_PER_BAR + c.step
        segs.push({ start, len: c.len, chord: c.chord })
        for (let k = 0; k < c.len; k++) segAt[start + k] = segs.length - 1
      }
    }
  }
  const chordAt = (s) => segs[segAt[s]].chord
  const wrap = (s) => (s < totalSteps ? s : loopStep + ((s - totalSteps) % (totalSteps - loopStep)))
  const chordEnd = (s) => {
    const seg = segs[segAt[s]]
    return seg.start + seg.len
  }

  const events = new Array(totalSteps).fill(null)
  const add = (ev) => {
    ;(events[ev.s] ||= []).push(ev)
    return ev
  }

  for (const [key, def] of Object.entries(track.instruments)) {
    const type = def.type
    let prevVoicing = null
    const instEvents = []
    for (const slot of slots) {
      const sec = track.sections[slot.name]
      const raw = sec.parts && sec.parts[key]
      if (!raw) continue
      const part = type === 'drums' ? raw : normPart(raw)
      const vs = part.v ?? 1

      if (type === 'drums') {
        for (const [voice, gstr] of Object.entries(part)) {
          if (voice === 'v') continue
          const g = parseGrid(gstr)
          if (slot.bars % g.bars !== 0) throw new Error(`${track.id}/${slot.name}/${key}.${voice}: ${g.bars} bars do not divide ${slot.bars}`)
          const L = g.steps.length
          for (let s = 0; s < slot.steps; s++) {
            const c = g.steps[s % L]
            const v = GRID_VEL[c]
            if (v) add({ i: key, s: slot.start + s, d: 1, v: v * vs * (raw.v ?? 1), drum: voice })
          }
        }
        continue
      }

      const oct = (part.oct ?? 0) * 12
      const base = part.base ?? def.base ?? 48
      const vopts = { ...(def.voicing || {}), ...(part.voicing || {}) }
      const doubles = part.octaves ?? def.octaves ?? false

      const isGrid = part.grid !== undefined || (part.seq === undefined && GRID_DEFAULT.has(type))
      const src = part.grid ?? part.seq ?? part.p
      if (typeof src !== 'string') throw new Error(`${track.id}/${slot.name}/${key}: missing pattern`)

      if (isGrid) {
        // GRID on a chordal instrument.
        const g = parseGrid(src)
        if (slot.bars % g.bars !== 0) throw new Error(`${track.id}/${slot.name}/${key}: ${g.bars} bars do not divide ${slot.bars}`)
        const L = g.steps.length
        for (let s = 0; s < slot.steps; s++) {
          const c = g.steps[s % L]
          if (c === '.' || c === '-') continue
          let hold = 1
          while (s + hold < slot.steps && g.steps[(s + hold) % L] === '-') hold++
          // split at chord changes so held chords follow the harmony
          let a = slot.start + s
          const end = a + hold
          let first = true
          while (a < end) {
            const chord = chordAt(a)
            const segEnd = Math.min(end, chordEnd(a))
            const voicing = voiceChord(chord, vopts, prevVoicing)
            prevVoicing = voicing
            let notes
            if (/[0-7]/.test(c)) {
              const d = Number(c)
              notes = [voicing[d % voicing.length] + 12 * Math.floor(d / voicing.length)]
            } else notes = voicing.slice()
            notes = notes.map((m) => m + oct)
            if (doubles) notes = notes.concat(notes.map((m) => m + 12))
            instEvents.push(add({ i: key, s: a, d: segEnd - a, v: (GRID_VEL[c] ?? 0.8) * vs * (first ? 1 : 0.8), n: notes }))
            first = false
            a = segEnd
          }
        }
        continue
      }

      // SEQ.
      const sq = parseSeq(src)
      if (slot.bars % sq.bars !== 0) throw new Error(`${track.id}/${slot.name}/${key}: ${sq.bars} bars do not divide ${slot.bars}`)
      const patLen = sq.bars * STEPS_PER_BAR
      const reps = slot.bars / sq.bars
      for (let r = 0; r < reps; r++) {
        for (const t of sq.tokens) {
          const s = slot.start + r * patLen + t.step
          if (t.kind === 'rest') continue
          if (t.kind === 'hold') {
            const last = instEvents[instEvents.length - 1]
            if (last && last.s + last.d === s) last.d += t.len
            continue
          }
          const chord = chordAt(s)
          // 'n' = the chord sounding right after this note (anticipations / approach notes)
          const next = chordAt(wrap(s + t.len))
          let notes = t.notes.map((n) => resolveNote(n, chord, next, base) + oct)
          if (doubles) notes = notes.concat(notes.map((m) => m + 12))
          instEvents.push(add({ i: key, s, d: t.len, v: t.vel * vs, n: notes, g: t.glide }))
        }
      }
    }

    // Mono instruments: no overlaps; mark legato joins.
    if (MONO_TYPES.has(type)) {
      instEvents.sort((a, b) => a.s - b.s)
      for (let k = 0; k < instEvents.length - 1; k++) {
        const e = instEvents[k]
        const nx = instEvents[k + 1]
        if (e.s + e.d > nx.s) e.d = Math.max(1, nx.s - e.s)
        e.l = e.s + e.d === nx.s
      }
    }
  }

  return {
    id: track.id,
    title: track.title,
    bpm: track.bpm,
    swing: track.swing ?? 0,
    totalSteps,
    loopStep,
    slots,
    events,
    chordAt,
    segs,
  }
}

/** Seconds for a step count at the track tempo. */
export const stepSeconds = (bpm) => 60 / bpm / 4

/**
 * Validate a track definition. Returns an array of human-readable problems (empty = OK).
 */
export function validateTrack(track) {
  const errs = []
  const e = (m) => errs.push(`${track && track.id}: ${m}`)
  if (!track || typeof track !== 'object') return ['track is not an object']
  for (const k of ['id', 'title', 'style']) if (typeof track[k] !== 'string' || !track[k]) e(`missing ${k}`)
  if (!(track.bpm >= 60 && track.bpm <= 200)) e(`bpm ${track.bpm} out of range`)
  if (!Array.isArray(track.arrangement) || !track.arrangement.length) e('empty arrangement')
  if (!track.sections || typeof track.sections !== 'object') e('no sections')
  if (!track.instruments || typeof track.instruments !== 'object') e('no instruments')
  if (errs.length) return errs
  for (const [k, d] of Object.entries(track.instruments)) if (!INSTRUMENT_TYPES.includes(d.type)) e(`instrument ${k} has unknown type ${d.type}`)
  for (const name of track.arrangement) if (!track.sections[name]) e(`arrangement references unknown section ${name}`)
  const loop = track.loop ?? 0
  if (!(loop >= 0 && loop < track.arrangement.length)) e(`loop index ${loop} invalid`)
  for (const [name, sec] of Object.entries(track.sections)) {
    if (!Number.isInteger(sec.bars) || sec.bars <= 0) e(`${name}: bars must be a positive integer`)
    try {
      const pc = parseChords(sec.chords)
      if (sec.bars % pc.bars) e(`${name}: ${pc.bars} chord bars do not divide ${sec.bars}`)
    } catch (err) {
      e(`${name}: ${err.message}`)
    }
    for (const [k, raw] of Object.entries(sec.parts || {})) {
      const def = track.instruments[k]
      if (!def) {
        e(`${name}: part for unknown instrument ${k}`)
        continue
      }
      try {
        if (def.type === 'drums') {
          for (const [voice, g] of Object.entries(raw)) {
            if (voice === 'v') continue
            if (!DRUM_VOICES.includes(voice)) e(`${name}/${k}: unknown drum voice ${voice}`)
            const pg = parseGrid(g)
            if (sec.bars % pg.bars) e(`${name}/${k}.${voice}: ${pg.bars} bars do not divide ${sec.bars}`)
          }
        }
      } catch (err) {
        e(`${name}/${k}: ${err.message}`)
      }
    }
  }
  if (errs.length) return errs
  let c
  try {
    c = compileTrack(track)
  } catch (err) {
    e(`compile failed: ${err.message}`)
    return errs
  }
  for (const list of c.events) {
    if (!list) continue
    for (const ev of list) {
      if (ev.d < 1) e(`event at step ${ev.s} (${ev.i}) has non-positive length`)
      if (!(ev.v > 0 && ev.v <= 1.5)) e(`event at step ${ev.s} (${ev.i}) has bad velocity ${ev.v}`)
      if (ev.n) for (const m of ev.n) if (!(Number.isInteger(m) && m >= 21 && m <= 108)) e(`note ${m} out of range at step ${ev.s} (${ev.i})`)
    }
  }
  return errs
}
