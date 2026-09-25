// "Last Wave" — original composition.
// Latin fusion, G minor / Bb major, 128 BPM. Piano montuno in octaves, tumbao bass, 2-3 son
// clave, cascara on the timbale shell, congas, brass stabs, soaring saw lead with glides.
//
// Form (8-bar sections, 72 bars ≈ 2:15, loops back to A ≈ 2:00):
//   intro → A (i–IV dorian vamp, ii–V–I) → B (circle: ii–V–I–IV, iiø–V–i) → hook (deceptive
//   lift to Eb, soaring lead) → mambo (brass + timbales) → A → B → hook → hook' ⟲ A
import { REST, SILENT, rep, bars, withLast, withFirst } from './helpers.js'

const CRASH1 = withFirst('x...............', REST)

// ── lead (soaring saw) ───────────────────────────────────────────────────────────────────
const LEAD_INTRO = bars(rep(SILENT, 7), '.:8 A4:2 C5:2 Eb5:2 F#5:2')

const LEAD_A = bars(
  '.:2 D5:2 F5:1 G5:2 A5:3 G5:2 F5:2 D5:2',
  'E5:6 D5:2 C5:2 Bb4:2 A4:4',
  '.:2 D5:2 F5:1 G5:2 Bb5:3 A5:2 G5:2 F5:2',
  'G5:6 A5:2 Bb5:4 E5:4',
  '.:2 G5:2 Bb5:1 C6:2 D6:3 C6:2 Bb5:2 G5:2',
  'A5:6 G5:2 F5:2 Eb5:2 D5:4',
  'F5:4 D5:2 Bb4:2 A4:4 C5:4',
  'F#5:3 A5:3 C6:2 F5:4 D5:4',
)

const LEAD_B = bars(
  'G5:4 Eb5:2 D5:2 C5:4 Bb4:4',
  'A4:4 C5:2 D5:2 Eb5:6 F5:2',
  'F5:4 A5:4 C6:8',
  'Bb5:4 G5:4 F5:4 D5:4',
  'Eb5:6 D5:2 C5:4 A4:4',
  'C5:2 D5:2 F#5:2 A5:2 C6:4 Eb6:4',
  'D6:6 Bb5:2 A5:4 G5:4',
  'F#5:4 F5:4 D5:4 .:4',
)

const LEAD_HOOK = bars(
  'Bb4:2 D5:2 F5:2 ~G5:10',
  '.:2 A5:2 G5:2 F5:2 D5:4 Eb5:4',
  'F5:6 A5:2 ~C6:8',
  'Bb5:3 A5:3 G5:2 F5:4 D5:4',
  'Eb5:2 G5:2 Bb5:2 ~D6:10',
  '.:2 C6:2 A5:2 F5:2 G5:4 A5:4',
  'D6:6 C6:2 Bb5:4 A5:4',
  'G5:4 A5:4 F#5:4 Eb5:2 D5:2',
)

const LEAD_MAMBO = bars(
  rep(SILENT, 4),
  'G5:2 Bb5:2 D6:2 Eb6:6 D6:2 Bb5:2',
  'A5:3 F#5:3 C6:2 A5:4 F#5:4',
  'G5:2 A5:2 Bb5:2 D6:6 C6:2 Bb5:2',
  'A5:3 F#5:3 F5:2 D5:8',
)

// ── piano montuno (chord-relative, doubled in octaves) ───────────────────────────────────
const MONTUNO = bars('r:2 3+5:2 .:2 3+5:2 .:2 5+8:2 3+5:2 .:2', '.:2 5+7:2 3+5:2 .:2 5+8:2 3+5:2 .:2 3+8:2')

// ── bass: tumbao (anticipates the next chord on beat 4, tied over the bar line) ──────────
const TUMBAO = '-:6 5:6 n:4'
const TUMBAO_R = 'r:6 5:6 n:4'

// ── percussion ───────────────────────────────────────────────────────────────────────────
const CLAVE = '....x...x....... | x.....x.....x...' // 2-3 son clave
const CASCARA = 'x...x...x.x...x. | x...x.x...x...x.'
const CONGA = {
  congaMute: 'o.......o.......',
  congaSlap: '....x...........',
  congaHi: '............x.x.',
  congaLo: '...............o | ......x........o',
}
const rep4 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, rep(v, v.includes('|') ? 4 : 8)]))
const TIMB_FILL = {
  timbHi: withLast(REST, '........x.xx.x..'),
  timbLo: withLast(REST, '..........x..xxX'),
}

const DR_INTRO = {
  clave: rep(CLAVE, 4),
  paila: rep(CASCARA, 4),
  ...rep4(CONGA),
  shaker: bars(rep(REST, 4), rep('xoxoxoxoxoxoxoxo', 4)),
  kick: bars(rep(REST, 4), rep('x.....x.....x...', 4)),
  ...TIMB_FILL,
}
const DR_A = {
  clave: rep(CLAVE, 4),
  paila: rep(CASCARA, 4),
  ...rep4(CONGA),
  kick: rep('x.....x.....x...', 8),
  rim: rep('....x.......x...', 8).replace(/x/g, 'o'),
  hat: rep('x.x.x.x.x.x.x.x.', 8).replace(/x/g, 'o'),
  shaker: rep('xoxoxoxoxoxoxoxo', 8),
  crash: CRASH1,
  ...TIMB_FILL,
}
const DR_B = {
  clave: rep(CLAVE, 4),
  ...rep4(CONGA),
  cowbell: rep('X...x...X...x...', 8),
  kick: rep('x.....x.....x...', 8),
  snare: withLast('....x.......x...', 'x.x.x.x.xxxxXXXX'),
  hat: rep('x.x.x.x.x.x.x.x.', 8),
  shaker: rep('xoxoxoxoxoxoxoxo', 8),
  crash: CRASH1,
}
const DR_HOOK = {
  clave: rep(CLAVE, 4),
  ...rep4(CONGA),
  cowbell: rep('X...x...X...x...', 8),
  kick: rep('x.....x.x.....x.', 8),
  snare: rep('....x.......x...', 8),
  ohat: rep('..x...x...x...x.', 8),
  shaker: rep('xoxoxoxoxoxoxoxo', 8),
  crash: CRASH1,
  ...TIMB_FILL,
}
const DR_MAMBO = {
  clave: rep(CLAVE, 4),
  ...rep4(CONGA),
  cowbell: rep('X.x.X.x.X.x.X.x.', 8),
  kick: rep('x.....x.....x...', 8),
  timbHi: bars(rep('..........x.....', 3), '........x.xx.x..', rep('..........x.....', 3), '........x.xxxxxx'),
  timbLo: bars(rep('..............x.', 3), '..........x..xxX', rep('..............x.', 3), '..........x....X'),
  shaker: rep('xoxoxoxoxoxoxoxo', 8),
  crash: bars('x...............', REST, REST, REST, 'x...............', REST, REST, REST),
}

export default {
  id: 'lastWave',
  title: 'Last Wave',
  bpm: 128,
  style: 'Latin fusion',
  key: 'G minor / Bb major',
  swing: 0,
  delay: { beats: 0.75, feedback: 0.34, wet: 0.5 },
  instruments: {
    drums: { type: 'drums', gain: 0.85, rev: 0.1 },
    bass: { type: 'bass', preset: 'tumbao', gain: 0.8, base: 31 },
    piano: { type: 'piano', gain: 0.62, level: 0.8, pan: -0.15, rev: 0.16, base: 55, octaves: true },
    brass: { type: 'stab', gain: 0.7, pan: 0.16, rev: 0.18, dly: 0.04, voicing: { lo: 58, hi: 80, n: 4, rootless: true } },
    pad: { type: 'pad', gain: 0.42, rev: 0.4, voicing: { lo: 50, hi: 74, n: 4 } },
    lead: { type: 'lead', preset: 'soar', gain: 1.05, pan: 0.08, rev: 0.3, dly: 0.26 },
  },
  sections: {
    intro: {
      bars: 8,
      chords: 'Gm9 | C13 | Gm9 | C13 | Ebmaj7 | D7sus4 | Ebmaj7 | D7b9',
      parts: {
        drums: DR_INTRO,
        piano: { seq: MONTUNO, v: 0.85 },
        bass: bars(rep(SILENT, 4), rep(TUMBAO, 4)),
        brass: { p: bars(rep(REST, 4), rep('x-......x-..x...', 3), 'X-..X-..X-..X-..'), v: 0.8 },
        pad: { p: rep('x---------------', 8), v: 0.6 },
        lead: LEAD_INTRO,
      },
    },
    A: {
      bars: 8,
      chords: 'Gm9 | C13 | Gm9 | C13 | Cm9 | F13 | Bbmaj7 | D7#9',
      parts: {
        drums: DR_A,
        piano: { seq: MONTUNO },
        bass: TUMBAO,
        pad: { p: 'x---------------', v: 0.45 },
        lead: LEAD_A,
      },
    },
    B: {
      bars: 8,
      chords: 'Cm9 | F13 | Bbmaj9 | Ebmaj7 | Am7b5 | D7b9 | Gm9 | D7#9',
      parts: {
        drums: DR_B,
        piano: { seq: MONTUNO },
        bass: TUMBAO_R,
        brass: { p: 'x-------........', v: 0.6 },
        pad: { p: 'x---------------', v: 0.8 },
        lead: LEAD_B,
      },
    },
    hook: {
      bars: 8,
      chords: 'Ebmaj9 | F13 | Dm7 | Gm9 | Cm9 | F13 | Bbmaj7 | D7sus4 D7b9',
      parts: {
        drums: DR_HOOK,
        piano: { seq: MONTUNO },
        bass: TUMBAO_R,
        brass: { p: 'x-------x-------', v: 0.65 },
        pad: { p: 'x---------------', v: 0.8 },
        lead: LEAD_HOOK,
      },
    },
    mambo: {
      bars: 8,
      chords: 'Gm9 | C13 | Gm9 | C13 | Ebmaj7 | D7#9 | Gm9 | D7#9',
      parts: {
        drums: DR_MAMBO,
        piano: { seq: MONTUNO },
        bass: TUMBAO,
        brass: '..X.X..x..x.X.x.',
        lead: LEAD_MAMBO,
      },
    },
    hook2: {
      bars: 8,
      chords: 'Ebmaj9 | F13 | Dm7 | Gm9 | Cm9 | F13 | Bbmaj7 | D7sus4 D7b9',
      parts: {
        drums: { ...DR_HOOK, paila: rep(CASCARA, 4) },
        piano: { seq: MONTUNO },
        bass: TUMBAO_R,
        brass: '..X.X..x..x.X.x.',
        pad: { p: 'x---------------', v: 0.9 },
        lead: LEAD_HOOK,
      },
    },
  },
  arrangement: ['intro', 'A', 'B', 'hook', 'mambo', 'A', 'B', 'hook', 'hook2'],
  loop: 1,
}
