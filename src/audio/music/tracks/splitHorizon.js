// "Split Horizon" — original composition.
// Synth-funk, A dorian / C major, 122 BPM. Slap bass, FM clav, brass-like saw stabs,
// square lead with portamento + vibrato.
//
// Form (8-bar sections, 72 bars ≈ 2:22, loops back to A ≈ 2:06):
//   intro → A (i–IV dorian vamp) → B (ii–iii–IV–V climb) → hook (deceptive lift to F)
//   → break (slap bass solo) → A → B → hook → hook' ⟲ A
import { REST, SILENT, rep, bars, withLast, withFirst } from './helpers.js'

const CRASH1 = withFirst('x...............', REST)

// ── lead (square) ────────────────────────────────────────────────────────────────────────
const LEAD_INTRO = bars(rep(SILENT, 7), '.:8 E5:2 G5:2 G#5:2 B5:2')

const LEAD_A = bars(
  '.:4 E5:1 .:1 E5:1 G5:2 A5:3 G5:1 .:1 E5:2',
  'F#5:4 E5:2 D5:2 .:8',
  '.:4 C6:1 .:1 C6:1 B5:2 A5:3 G5:1 .:1 E5:2',
  'F#5:2 A5:2 C6:4 B5:2 A5:2 F#5:4',
  '.:4 E5:1 .:1 E5:1 G5:2 A5:3 G5:1 .:1 E5:2',
  'F#5:4 E5:2 D5:2 .:4 E5:2 G5:2',
  'A5:3 G5:1 E5:2 C5:2 E5:4 F5:2 E5:2',
  'G#5:3 B5:3 D6:2 B5:4 G#5:2 E5:2',
)

const LEAD_B = bars(
  'A5:6 F5:2 E5:8',
  'B5:6 G5:2 D5:8',
  'C6:6 A5:2 E5:8',
  'D6:4 B5:4 A5:4 F5:4',
  'F5:2 A5:2 C6:4 ~E6:8',
  'D6:4 B5:4 G5:8',
  'A5:4 C6:4 E6:4 D6:4',
  'A5:4 B5:4 G#5:4 F5:4',
)

const LEAD_HOOK = bars(
  '.:2 C5:2 E5:2 G5:4 A5:2 G5:2 E5:2',
  'F5:3 E5:3 D5:2 B4:4 .:2 D5:2',
  'E5:2 G5:2 B5:4 A5:2 G5:2 E5:2 D5:2',
  'E5:6 C5:2 B4:4 A4:2 C5:2',
  '.:2 D5:2 F5:2 A5:4 C6:2 A5:2 F5:2',
  'E5:3 F5:3 G5:2 B5:4 .:2 A5:2',
  'G5:2 A5:2 B5:4 ~D6:6 C6:2',
  'B5:3 G#5:3 G5:2 E5:4 D5:2 B4:2',
)

const LEAD_BREAK = bars(
  rep(SILENT, 4),
  'C6:2 A5:2 F5:2 E5:2 A5:8',
  'B5:2 G5:2 F5:2 E5:2 D5:8',
  'E5:2 A5:2 B5:2 D6:2 ~E6:8',
  'D6:3 B5:3 G#5:2 G5:4 E5:4',
)

// ── slap bass ────────────────────────────────────────────────────────────────────────────
// ! = popped/slapped accent, * = ghost (dead) note, n< = chromatic approach to next root
const SLAP_A = 'r!:1 .:1 8!:1 r*:1 .:1 r:1 8!:1 .:1 5:1 7:1 8!:1 r*:1 .:1 r:2 n<:1'
const SLAP_HOOK = 'r!:2 8!:1 r*:1 .:1 5:1 8!:1 .:1 r:1 r*:1 7!:1 8!:1 .:1 5:1 3:1 r*:1'
const BASS_B = 'r:2 r*:1 r:1 8:2 r:2 5:2 r:2 7:2 5:2'
const SLAP_SOLO = bars(
  'A1!:1 .:1 A2!:1 A1*:1 .:1 A1:1 G2!:1 A1*:1 .:1 E2:1 A2!:1 .:1 C3!:1 A2:1 G2:1 E2:1',
  'A1!:1 .:1 A2!:1 A1*:1 C2:1 D2:1 E2!:1 .:1 G2!:1 E2*:1 A2!:1 .:1 G2:1 E2:1 D2:1 C2:1',
  'A1!:1 .:1 A2!:1 A1*:1 .:1 A1:1 G2!:1 A1*:1 .:1 E2:1 A2!:1 .:1 C3!:1 A2:1 G2:1 E2:1',
  'A1!:1 .:1 A2!:1 A1*:1 .:1 A1:1 G2!:1 A1*:1 F#2!:1 .:1 E2!:1 .:1 D2!:1 .:1 C2!:1 E2:1',
  rep(SLAP_A, 4),
)

// ── drums ────────────────────────────────────────────────────────────────────────────────
const KICK = 'x....x..x....x..'
const SNARE = '....X..o.o..X...'
const HATS = 'xoxoxoxoxoxoxo.o'
const OHAT = '..............x.'
const FILL = {
  tomHi: withLast(REST, '........x.x.....'),
  tomMid: withLast(REST, '............x.x.'),
  tomLo: withLast(REST, '..............xX'),
}

const DR_INTRO = {
  kick: withLast(KICK, 'x....x..x.......'),
  snare: withLast(SNARE, '....X..o.o..xxXX'),
  hat: rep(HATS, 8),
  ohat: rep(OHAT, 8),
}
const DR_A = { kick: rep(KICK, 8), snare: rep(SNARE, 8), hat: rep(HATS, 8), ohat: rep(OHAT, 8), crash: CRASH1, ...FILL }
const DR_B = {
  kick: rep('x.......x.x.....', 8),
  snare: withLast(SNARE, 'x.x.x.x.xxxxXXXX'),
  clap: rep('....x.......x...', 8),
  hat: rep('x.x.x.x.x.x.x.x.', 8),
  ohat: rep('..x...x...x...x.', 8).replace(/x/g, 'o'),
  cowbell: rep('x..x..x...x.x...', 8).replace(/x/g, 'o'),
  crash: CRASH1,
}
const DR_HOOK = {
  kick: rep('x..x..x...x..x..', 8),
  snare: rep('....X......oX..o', 8),
  clap: rep('....x.......x...', 8),
  hat: rep(HATS, 8),
  ohat: rep(OHAT, 8),
  crash: CRASH1,
  ...FILL,
}
const DR_BREAK = {
  kick: bars(rep(KICK, 4), rep('x..x..x...x..x..', 4)),
  snare: bars(rep('....X.......X...', 3), '....X.......XXXX', rep(SNARE, 4)),
  hat: bars(rep('x.x.x.x.x.x.x.x.', 4), rep(HATS, 4)),
  ohat: bars(rep(REST, 4), rep(OHAT, 4)),
  crash: bars(REST, REST, REST, REST, 'x...............', REST, REST, REST),
}
const DR_HOOK2 = { ...DR_HOOK, cowbell: rep('x.x.x.x.x.x.x.x.', 8).replace(/x/g, 'o') }

export default {
  id: 'splitHorizon',
  title: 'Split Horizon',
  bpm: 122,
  style: 'Synth-funk',
  key: 'A dorian / C major',
  swing: 0.04,
  delay: { beats: 0.75, feedback: 0.3, wet: 0.45 },
  instruments: {
    drums: { type: 'drums', gain: 0.78, rev: 0.05 },
    bass: { type: 'bass', preset: 'slap', gain: 0.85, base: 28 },
    clav: { type: 'ep', preset: 'clav', gain: 0.5, pan: 0.28, rev: 0.06, voicing: { lo: 60, hi: 77, n: 3, rootless: true } },
    keys: {
      type: 'ep',
      preset: 'mellow',
      gain: 0.5,
      pan: -0.22,
      rev: 0.2,
      dly: 0.08,
      tremolo: { rate: 5, depth: 0.25 },
      voicing: { lo: 55, hi: 74, n: 4, rootless: true },
    },
    brass: { type: 'stab', gain: 0.75, pan: -0.05, rev: 0.14, dly: 0.05, voicing: { lo: 60, hi: 80, n: 4, rootless: true } },
    pad: { type: 'pad', gain: 0.45, rev: 0.35, voicing: { lo: 52, hi: 76, n: 4 } },
    lead: { type: 'lead', preset: 'square', gain: 0.85, pan: 0.06, rev: 0.22, dly: 0.2 },
  },
  sections: {
    intro: {
      bars: 8,
      chords: 'Am9 | D9 | Am9 | D9 | Fmaj7 | Em7 | Dm9 | E7#9',
      parts: {
        drums: DR_INTRO,
        clav: '.xo.x.ox.xo.x.ox',
        brass: { p: bars(rep(REST, 4), rep('X-....x-..x-....', 3), 'X-..X-..X-..X-..'), v: 0.9 },
        bass: bars(SILENT, SILENT, rep(SLAP_A, 6)),
        pad: { p: bars(rep(REST, 4), rep('x---------------', 4)), v: 0.6 },
        lead: LEAD_INTRO,
      },
    },
    A: {
      bars: 8,
      chords: 'Am9 | D9 | Am9 | D9 | Am9 | D9 | Fmaj7 | E7#9',
      parts: {
        drums: DR_A,
        bass: SLAP_A,
        clav: '.xo.x.ox.xo.x.ox',
        brass: { p: bars('......x-..x.....', 'X-..............'), v: 0.85 },
        lead: LEAD_A,
      },
    },
    B: {
      bars: 8,
      chords: 'Dm9 | Em7 | Fmaj7 | G13 | Dm9 | Em7 | Fmaj7 | E7sus4 E7b9',
      parts: {
        drums: DR_B,
        bass: BASS_B,
        keys: 'x---..x---..x---',
        brass: { p: 'x-------x-------', v: 0.6 },
        pad: { p: 'x---------------', v: 0.8 },
        lead: LEAD_B,
      },
    },
    hook: {
      bars: 8,
      chords: 'Fmaj9 | G13 | Em7 | Am9 | Dm9 | G13 | Cmaj9 | E7#9',
      parts: {
        drums: DR_HOOK,
        bass: SLAP_HOOK,
        clav: 'x.ox.xo.x.ox.xo.',
        brass: 'X-..x-.x...x..x-',
        pad: { p: 'x---------------', v: 0.6 },
        lead: LEAD_HOOK,
      },
    },
    break: {
      bars: 8,
      chords: 'Am9 | Am9 | Am9 | Am9 | Fmaj7 | G13 | E7sus4 | E7#9',
      parts: {
        drums: DR_BREAK,
        bass: SLAP_SOLO,
        clav: { p: bars(rep(REST, 4), rep('.xo.x.ox.xo.x.ox', 4)), v: 0.9 },
        brass: bars(rep(REST, 4), rep('X-..x-.x...x..x-', 4)),
        lead: LEAD_BREAK,
      },
    },
    hook2: {
      bars: 8,
      chords: 'Fmaj9 | G13 | Em7 | Am9 | Dm9 | G13 | Cmaj9 | E7#9',
      parts: {
        drums: DR_HOOK2,
        bass: SLAP_HOOK,
        clav: 'x.ox.xo.x.ox.xo.',
        keys: { p: 'x-.x-.x-..x-.x-.', v: 0.6 },
        brass: 'X-..x-.x...x..x-',
        pad: { p: 'x---------------', v: 0.75 },
        lead: LEAD_HOOK,
      },
    },
  },
  arrangement: ['intro', 'A', 'B', 'hook', 'break', 'A', 'B', 'hook', 'hook2'],
  loop: 1,
}
