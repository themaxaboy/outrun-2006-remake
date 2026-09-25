// "Coastline Drive" — original composition.
// Balearic / breezy, D major, 116 BPM. Bright FM piano comping, steel-drum lead, warm synth
// bass, nylon plucks, soft flute lead in the pre-chorus.
//
// Form (8-bar sections, 72 bars ≈ 2:29, loops back to A ≈ 2:12):
//   intro  → A (verse) → B (pre-chorus) → hook → break → A' → B → hook → hook' ⟲ A
// Harmony: verse I–vi–IV–V on maj9/m11 colours; pre-chorus climbs IV–V/IV–iii–vi; the hook
// borrows a ii–V into IV and the minor iv (Gm6) for a bittersweet Balearic turn.
import { REST, SILENT, rep, bars, withLast, withFirst } from './helpers.js'

const SHAKER = 'oxXooxXooxXooxXo'
const CRASH1 = withFirst('x...............', REST)

// ── lead lines (steel drum) ──────────────────────────────────────────────────────────────
const STEEL_INTRO = bars(
  rep(SILENT, 4),
  '.:8 D5:2 F#5:2 A5:4',
  'C#6:6 A5:2 .:8',
  '.:8 E5:2 G5:2 B5:4',
  'D6:6 B5:2 C#6:4 .:4',
)

const STEEL_VERSE = bars(
  '.:4 F#4:2 A4:2 E5:4 C#5:2 D5:2',
  '.:2 F#5:2 E5:4 D5:2 B4:2 A4:4',
  '.:4 B4:2 D5:2 A5:4 F#5:2 G5:2',
  '.:2 E5:2 D5:4 B4:2 D5:2 E5:4',
  '.:4 F#4:2 A4:2 E5:3 F#5:1 A5:4',
  '.:2 A5:2 F#5:4 E5:2 D5:2 C#5:4',
  '.:2 B4:2 D5:2 F#5:2 G5:4 F#5:2 E5:2',
  'D5:6 E5:2 .:8',
)

// The hook: a 3+1+4 rhythmic cell, first over Dmaj9, then re-harmonised over F#m7 in bar 5.
const HOOK = bars(
  'E5:3 F#5:1 A5:4 C#6:2 B5:2 A5:4',
  'C6:3 B5:1 A5:2 G5:2 F#5:2 A5:2 C6:4',
  'B5:6 A5:2 F#5:2 D5:2 E5:2 F#5:2',
  'G5:3 A5:1 Bb5:4 A5:2 G5:2 E5:4',
  'E5:3 F#5:1 A5:4 C#6:2 B5:2 A5:4',
  'B5:3 A5:1 F#5:2 D5:2 E5:2 F#5:2 C#6:4',
  'B5:3 A5:1 G5:4 F#5:2 E5:2 D5:2 E5:2',
  'F#5:4 E5:2 D5:2 C#5:2 E5:2 G5:2 F#5:2',
)

const STEEL_BREAK = bars(
  'D5:2 F#5:2 A5:2 B5:6 .:4',
  '.:8 A5:2 B5:2 C#6:4',
  'B5:2 G5:2 F#5:2 E5:6 .:4',
  '.:8 F#5:2 E5:2 C#5:4',
  'D5:2 F#5:2 A5:2 D6:6 .:4',
  '.:8 C#6:2 B5:2 A5:4',
  'G5:2 B5:2 D6:2 B5:6 A5:2 G5:2',
  'F#5:8 E5:4 .:4',
)

// Pre-chorus flute: long guide-tone line climbing to the hook.
const FLUTE_B = bars(
  'B4:6 D5:2 F#5:8',
  'E5:6 C#5:2 A4:4 C#5:2 E5:2',
  'F#5:6 E5:2 C#5:8',
  'D5:6 C#5:2 B4:4 C#5:2 D5:2',
  'G5:6 F#5:2 E5:4 B4:4',
  'A5:6 E5:2 C#5:4 E5:4',
  'F#5:4 A5:4 ~B5:8',
  'D5:4 E5:4 G5:2 A5:2 C#6:2 .:2',
)

// ── bass (chord-relative) ────────────────────────────────────────────────────────────────
const BASS_VERSE = 'r:3 r*:1 .:2 5:2 8:2 5:1 .:1 r:2 5_:2'
const BASS_B = 'r:6 5:2 8:4 5:2 r:2'
const BASS_HOOK = 'r:2 .:1 r*:1 8:2 5:2 r:2 .:1 r*:1 5:2 7:1 8:1'
const BASS_BREAK = 'r:8 .:4 5:2 8:2'

// ── drums ────────────────────────────────────────────────────────────────────────────────
const TOM_FILL = {
  tomHi: withLast(REST, '........x.x.....'),
  tomMid: withLast(REST, '............x.x.'),
  tomLo: withLast(REST, '...............X'),
}

const DR_INTRO = {
  shaker: rep(SHAKER, 8),
  kick: bars(rep(REST, 4), rep('x.......x.......', 3), 'x.......x...x.x.'),
  rim: bars(rep(REST, 4), rep('....o.......o...', 4)),
  congaHi: bars(rep(REST, 4), rep('......x.....x.x.', 4)),
  congaLo: bars(rep(REST, 4), rep('...x............', 4)),
  snare: withLast(REST, '........x.x.xxXX'),
}

const DR_VERSE = {
  kick: rep('x.....x.x.......', 8),
  clap: rep('....x.......x...', 8),
  hat: rep('o.x.o.x.o.x.o.x.', 8),
  shaker: rep(SHAKER, 8),
  congaHi: rep('......x.....x.x.', 8),
  congaLo: rep('...x..........x.', 8),
  crash: CRASH1,
  ...TOM_FILL,
}

const DR_B = {
  kick: rep('x...x...x...x...', 8),
  clap: withLast('....x.......x...', '....x.......x.x.'),
  snare: withLast(REST, 'x.x.x.x.xxxxXXXX'),
  hat: rep('x..ox..ox..ox..o', 8),
  ohat: withLast('..x...x...x...x.', '..x...x.........'),
  shaker: rep(SHAKER, 8),
  crash: CRASH1,
}

const DR_HOOK = {
  kick: withLast('x...x...x...x...', 'x...x...x.x.x...'),
  clap: rep('....x.......x...', 8),
  snare: rep('.......o......o.', 8),
  hat: rep('xo.oxo.oxo.oxo.o', 8),
  ohat: rep('..x...x...x...x.', 8),
  shaker: rep(SHAKER, 8),
  congaHi: rep('......x.....x.x.', 8),
  congaLo: rep('...x..........x.', 8),
  crash: CRASH1,
}

const DR_BREAK = {
  kick: bars(rep('x.........x.....', 6), 'x...x...x...x...', 'x...x...x.x.x.x.'),
  rim: rep('....o.......o...', 8),
  shaker: rep(SHAKER, 8),
  congaHi: rep('......x.....x.x.', 8),
  congaLo: rep('...x.......x....', 8),
  congaMute: rep('o.......o.......', 8),
  snare: bars(rep(REST, 6), '....x.......x...', 'x.x.x.x.xxxxXXXX'),
}

const DR_HOOK2 = {
  ...DR_HOOK,
  kick: withLast('x...x...x...x...', 'x...x...x.......'),
  tomHi: withLast(REST, '........X.x.....'),
  tomMid: withLast(REST, '............x.x.'),
  tomLo: withLast(REST, '...............X'),
}

export default {
  id: 'coastline',
  title: 'Coastline Drive',
  bpm: 116,
  style: 'Balearic',
  key: 'D major',
  swing: 0.08,
  delay: { beats: 0.75, feedback: 0.36, wet: 0.5 },
  instruments: {
    drums: { type: 'drums', gain: 0.8, rev: 0.07 },
    bass: { type: 'bass', preset: 'round', gain: 0.8, base: 33 },
    keys: {
      type: 'ep',
      preset: 'bright',
      gain: 0.65,
      pan: -0.12,
      rev: 0.2,
      dly: 0.1,
      tremolo: { rate: 3.8, depth: 0.3 },
      voicing: { lo: 57, hi: 77, n: 4, rootless: true },
    },
    pad: { type: 'pad', gain: 0.55, rev: 0.4, voicing: { lo: 50, hi: 74, n: 4 } },
    steel: { type: 'mallet', preset: 'steel', gain: 0.95, level: 0.8, pan: 0.12, rev: 0.26, dly: 0.2 },
    gtr: { type: 'pluck', gain: 1.3, level: 0.8, pan: 0.38, rev: 0.18, dly: 0.12, voicing: { lo: 52, hi: 71, n: 4 } },
    flute: { type: 'lead', preset: 'flute', gain: 0.72, pan: -0.06, rev: 0.3, dly: 0.24 },
  },
  sections: {
    intro: {
      bars: 8,
      chords: 'Gmaj9 | F#m7 | Em9 | A13sus4 | Gmaj9 | F#m7 | Em9 | A13sus4 A13',
      parts: {
        drums: DR_INTRO,
        pad: { p: rep('x---------------', 8), v: 0.8 },
        keys: { p: rep('x---------------', 8), v: 0.7 },
        bass: bars(rep(SILENT, 4), rep('r:12 5:2 8:2', 3), 'r:8 5:4 r:4'),
        steel: STEEL_INTRO,
      },
    },
    A: {
      bars: 8,
      chords: 'Dmaj9 | Bm11 | Gmaj9 | A13sus4 | Dmaj9 | Bm11 | Em9 | A13sus4',
      parts: {
        drums: DR_VERSE,
        bass: BASS_VERSE,
        keys: 'x---..x---..x---',
        pad: { p: 'x---------------', v: 0.55 },
        steel: STEEL_VERSE,
      },
    },
    B: {
      bars: 8,
      chords: 'Gmaj7 | A/G | F#m7 | Bm9 | Em9 | F#m7 | Gmaj9 | A7sus4 A7',
      parts: {
        drums: DR_B,
        bass: BASS_B,
        keys: { p: 'x-------x-------', v: 0.75 },
        pad: { p: 'x---------------', v: 0.9 },
        gtr: { p: '0..1..2..3..2.1.', v: 0.7 },
        flute: FLUTE_B,
      },
    },
    hook: {
      bars: 8,
      chords: 'Dmaj9 | Am9 D9 | Gmaj9 | Gm6 | F#m7 | Bm9 | Em9 | A13sus4 A13',
      parts: {
        drums: DR_HOOK,
        bass: BASS_HOOK,
        keys: 'x-.x-.x-..x-.x-.',
        pad: { p: 'x---------------', v: 0.7 },
        steel: HOOK,
      },
    },
    break: {
      bars: 8,
      chords: 'Gmaj9 | F#m11 | Em9 | Dmaj9/F# | Gmaj9 | F#m11 | Em9 | A13sus4',
      parts: {
        drums: DR_BREAK,
        bass: BASS_BREAK,
        keys: { p: '0.2.1.3.0.2.1.3.', v: 0.8 },
        pad: { p: 'x---------------', v: 1 },
        gtr: { p: '0..1..2..3..2.1.', v: 0.6 },
        steel: STEEL_BREAK,
      },
    },
    A2: {
      bars: 8,
      chords: 'Dmaj9 | Bm11 | Gmaj9 | A13sus4 | Dmaj9 | Bm11 | Em9 | A13sus4',
      parts: {
        drums: { ...DR_VERSE, ohat: rep('..............x.', 8) },
        bass: BASS_VERSE,
        keys: 'x---..x---..x---',
        pad: { p: 'x---------------', v: 0.6 },
        gtr: { p: '0..1..2..3..2.1.', v: 0.75 },
        steel: STEEL_VERSE,
      },
    },
    hook2: {
      bars: 8,
      chords: 'Dmaj9 | Am9 D9 | Gmaj9 | Gm6 | F#m7 | Bm9 | Em9 | A13sus4 A13',
      parts: {
        drums: DR_HOOK2,
        bass: BASS_HOOK,
        keys: 'x-.x-.x-..x-.x-.',
        pad: { p: 'x---------------', v: 0.85 },
        gtr: { p: '0..1..2..3..2.1.', v: 0.6 },
        steel: HOOK,
        flute: { p: HOOK, oct: -1, v: 0.75 },
      },
    },
  },
  arrangement: ['intro', 'A', 'B', 'hook', 'break', 'A2', 'B', 'hook', 'hook2'],
  loop: 1,
}
