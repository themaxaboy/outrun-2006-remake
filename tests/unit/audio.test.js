// Audio system — Node-side checks: import safety, track data integrity, musical sanity of the
// note data, parser/voicing behaviour and the pure-JS DSP renderers.
import { describe, it, expect } from 'vitest'
import { AudioEngine, audio } from '../../src/audio/audio.js'
import { TRACKS } from '../../src/audio/music/tracks/index.js'
import { compileTrack, validateTrack, parseGrid, parseSeq, parseChords, stepSeconds, STEPS_PER_BAR, DRUM_VOICES, MONO_TYPES } from '../../src/audio/music/patterns.js'
import { parseChord, voiceChord, chordScale, noteToMidi, mod12, QUALITIES } from '../../src/audio/music/theory.js'
import { VoicePool } from '../../src/audio/music/instruments.js'
import { renderDrum, DRUM_NAMES } from '../../src/audio/music/drumkit.js'
import { renderSamplerNote, SAMPLER_PRESETS } from '../../src/audio/music/samplers.js'
import { JINGLES } from '../../src/audio/sfx/jingles.js'
import { renderSqueal, renderWind, renderRumble, renderGravel } from '../../src/audio/sfx/loops.js'
import { SFX_NAMES } from '../../src/audio/sfx/sfxBank.js'
import { renderReverbIR } from '../../src/audio/music/fx.js'

const MELODIC = new Set(['lead', 'mallet'])

function finiteAndBounded(arr, max = 1.0001) {
  let peak = 0
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]
    if (!Number.isFinite(v)) return { ok: false, peak: NaN }
    peak = Math.max(peak, Math.abs(v))
  }
  return { ok: peak <= max, peak }
}

describe('audio module (Node import safety)', () => {
  it('imports without touching browser globals and exposes a singleton', () => {
    expect(audio).toBeInstanceOf(AudioEngine)
    expect(audio.ready).toBe(false)
    expect(audio.userTracks).toEqual([])
    expect(audio.musicTime).toBe(0)
  })

  it('lists the three built-in tracks', () => {
    const t = audio.tracks
    expect(t).toHaveLength(3)
    for (const x of t) {
      expect(typeof x.id).toBe('string')
      expect(typeof x.title).toBe('string')
      expect(typeof x.style).toBe('string')
      expect(x.bpm).toBeGreaterThanOrEqual(100)
      expect(x.bpm).toBeLessThanOrEqual(140)
    }
    expect(t.map((x) => x.title)).toEqual(['Coastline Drive', 'Split Horizon', 'Last Wave'])
  })

  it('every public method is a safe no-op before unlock', async () => {
    const a = new AudioEngine()
    expect(() => {
      a.setVolumes({ master: 0.5, music: 2, sfx: -1, engine: 0.3 })
      a.startEngine({ cylinders: 8, idle: 900, redline: 8000, engineTone: 1 })
      a.updateEngine({ rpm: 3000, rpmNorm: 0.3, throttle: 1, load: 1, speed: 30, limiter: false, drift: 0, offroad: 0, rumble: 0, wind: 0, airborne: false, camera: 'chase' })
      a.sfx('checkpoint')
      a.sfx('pass', { pan: 0.5, speed: 40 })
      a.playMusic('coastline')
      a.duck(0.5, 1)
      a.pause()
      a.resume()
      a.stopMusic()
      a.stopEngine()
    }).not.toThrow()
    expect(a.volumes).toEqual({ master: 0.5, music: 1, sfx: 0, engine: 0.3 })
    expect(await a.unlock()).toBe(false) // no AudioContext in Node
    expect(await a.loadUserFiles([])).toEqual([])
  })

  it('knows every sfx name from the API contract', () => {
    for (const n of ['shift', 'backfire', 'wall', 'scrape', 'crash', 'bump', 'hit', 'pass', 'nearMiss', 'land', 'checkpoint', 'extend', 'countdown', 'go', 'goal', 'timeup', 'gameover', 'driftStart', 'uiMove', 'uiSelect', 'uiBack', 'horn']) {
      expect(SFX_NAMES).toContain(n)
    }
  })
})

describe('track data', () => {
  it('has unique ids and the requested tempi', () => {
    const ids = TRACKS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const [coast, split, last] = TRACKS
    expect(coast.bpm).toBeGreaterThanOrEqual(112)
    expect(coast.bpm).toBeLessThanOrEqual(120)
    expect(split.bpm).toBeGreaterThanOrEqual(118)
    expect(split.bpm).toBeLessThanOrEqual(126)
    expect(last.bpm).toBeGreaterThanOrEqual(124)
    expect(last.bpm).toBeLessThanOrEqual(132)
  })

  for (const track of TRACKS) {
    describe(track.title, () => {
      const c = compileTrack(track)

      it('validates with no errors', () => {
        expect(validateTrack(track)).toEqual([])
      })

      it('has intro, A, B and hook sections in the arrangement', () => {
        for (const s of ['intro', 'A', 'B', 'hook']) expect(track.arrangement).toContain(s)
        expect(track.arrangement[0]).toBe('intro')
        expect(track.loop).toBeGreaterThan(0) // the loop skips the intro
      })

      it('runs 1.5–2.5 minutes before looping, and the looped part is long too', () => {
        const sec = stepSeconds(track.bpm)
        const first = c.totalSteps * sec
        const loop = (c.totalSteps - c.loopStep) * sec
        expect(first).toBeGreaterThanOrEqual(90)
        expect(first).toBeLessThanOrEqual(150)
        expect(loop).toBeGreaterThanOrEqual(90)
      })

      it('has consistent section lengths for chords and every part', () => {
        for (const [name, sec] of Object.entries(track.sections)) {
          expect(Number.isInteger(sec.bars) && sec.bars > 0).toBe(true)
          const pc = parseChords(sec.chords)
          expect(sec.bars % pc.bars, `${name} chords`).toBe(0)
          for (const [key, part] of Object.entries(sec.parts)) {
            const def = track.instruments[key]
            expect(def, `${name}/${key} instrument`).toBeTruthy()
            if (def.type === 'drums') {
              for (const [voice, g] of Object.entries(part)) {
                expect(DRUM_VOICES).toContain(voice)
                expect(sec.bars % parseGrid(g).bars, `${name}/${key}.${voice}`).toBe(0)
              }
            } else {
              const src = typeof part === 'string' ? part : part.grid ?? part.seq ?? part.p
              const isGrid = part.grid !== undefined || (part.seq === undefined && ['ep', 'pad', 'stab', 'piano', 'pluck'].includes(def.type))
              const bars = isGrid ? parseGrid(src).bars : parseSeq(src).bars
              expect(sec.bars % bars, `${name}/${key}`).toBe(0)
            }
          }
        }
      })

      it('has well-formed chords (known symbols, whole-beat lengths, 4 beats per bar)', () => {
        for (const sec of Object.values(track.sections)) {
          const pc = parseChords(sec.chords)
          let pos = 0
          for (const seg of pc.list) {
            expect(seg.step).toBe(pos)
            expect(seg.len % 4).toBe(0) // whole beats
            expect(seg.chord.quality in QUALITIES).toBe(true)
            expect(seg.chord.third).not.toBeNull()
            expect(seg.chord.pcs.length).toBeGreaterThanOrEqual(3)
            pos += seg.len
          }
          expect(pos).toBe(pc.bars * STEPS_PER_BAR)
        }
      })

      it('keeps every note inside the MIDI range and instrument-sensible registers', () => {
        for (const list of c.events) {
          if (!list) continue
          for (const ev of list) {
            if (!ev.n) continue
            const type = track.instruments[ev.i].type
            for (const m of ev.n) {
              expect(Number.isInteger(m)).toBe(true)
              expect(m).toBeGreaterThanOrEqual(21)
              expect(m).toBeLessThanOrEqual(108)
              if (type === 'bass') expect(m).toBeLessThanOrEqual(60)
              if (MELODIC.has(type)) expect(m).toBeGreaterThanOrEqual(55)
            }
            expect(ev.d).toBeGreaterThanOrEqual(1)
            expect(ev.v).toBeGreaterThan(0)
            expect(ev.v).toBeLessThanOrEqual(1)
          }
        }
      })

      it('melodies fit the harmony (strong beats on chord tones, everything in the chord scale)', () => {
        let strong = 0
        let strongTone = 0
        let total = 0
        let inScale = 0
        for (const list of c.events) {
          if (!list) continue
          for (const ev of list) {
            if (!ev.n || !MELODIC.has(track.instruments[ev.i].type)) continue
            const chord = c.chordAt(ev.s)
            const scale = chordScale(chord)
            for (const m of ev.n) {
              total++
              if (scale.has(mod12(m))) inScale++
              if (ev.s % 8 === 0) {
                strong++
                if (chord.pcs.includes(mod12(m))) strongTone++
              }
            }
          }
        }
        expect(total).toBeGreaterThan(150)
        expect(inScale / total).toBeGreaterThanOrEqual(0.98)
        expect(strongTone / strong).toBeGreaterThanOrEqual(0.85)
      })

      it('bass lines outline the chords (≥ 90% chord/scale tones; approach notes allowed)', () => {
        let total = 0
        let good = 0
        for (const list of c.events) {
          if (!list) continue
          for (const ev of list) {
            if (!ev.n || track.instruments[ev.i].type !== 'bass') continue
            const scale = chordScale(c.chordAt(ev.s))
            total++
            if (scale.has(mod12(ev.n[0]))) good++
          }
        }
        expect(total).toBeGreaterThan(100)
        expect(good / total).toBeGreaterThanOrEqual(0.9)
      })

      it('mono instruments never overlap themselves', () => {
        const last = {}
        for (const list of c.events) {
          if (!list) continue
          for (const ev of list) {
            if (!MONO_TYPES.has(track.instruments[ev.i].type)) continue
            const prev = last[ev.i]
            if (prev) expect(prev.s + prev.d).toBeLessThanOrEqual(ev.s)
            last[ev.i] = ev
          }
        }
      })

      it('has a real melody (lead line varies in pitch and rhythm)', () => {
        const leadKeys = Object.entries(track.instruments)
          .filter(([, d]) => MELODIC.has(d.type))
          .map(([k]) => k)
        const pitches = new Set()
        const lengths = new Set()
        for (const list of c.events) if (list) for (const ev of list) if (leadKeys.includes(ev.i)) (pitches.add(ev.n[0]), lengths.add(ev.d))
        expect(pitches.size).toBeGreaterThanOrEqual(12)
        expect(lengths.size).toBeGreaterThanOrEqual(4)
      })
    })
  }
})

describe('pattern notation', () => {
  it('rejects bars with the wrong number of steps', () => {
    expect(() => parseGrid('x...x...x...x..')).toThrow()
    expect(() => parseSeq('C5:4 D5:4 E5:4')).toThrow()
    expect(() => parseChords('Cmaj7:3 G7:2')).toThrow()
  })

  it('parses ties across bars, chords and velocity marks', () => {
    const s = parseSeq('C5:12 E5+G5!:4 | -:4 ~A5*:12')
    expect(s.bars).toBe(2)
    expect(s.tokens.map((t) => t.kind)).toEqual(['notes', 'notes', 'hold', 'notes'])
    expect(s.tokens[1].notes).toHaveLength(2)
    expect(s.tokens[1].vel).toBe(1)
    expect(s.tokens[3].glide).toBe(true)
    expect(s.tokens[3].vel).toBeLessThan(0.5)
  })

  it('splits chord bars evenly or by explicit beats', () => {
    const p = parseChords('Am9 D9 | Gm6:3 C7:1')
    expect(p.list.map((x) => [x.chord.symbol, x.step, x.len])).toEqual([
      ['Am9', 0, 8],
      ['D9', 8, 8],
      ['Gm6', 16, 12],
      ['C7', 28, 4],
    ])
  })
})

describe('theory', () => {
  it('converts note names', () => {
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('Bb3')).toBe(58)
    expect(noteToMidi('F#5')).toBe(78)
  })

  it('parses extended and slash chords', () => {
    const c = parseChord('F#m11')
    expect(c.root).toBe(6)
    expect(c.minor).toBe(true)
    expect(c.pcs).toContain(mod12(6 + 17)) // B
    const s = parseChord('A/G')
    expect(s.root).toBe(9)
    expect(s.bass).toBe(7)
    expect(parseChord('A13sus4').third).toBe(5)
    expect(() => parseChord('H7')).toThrow()
  })

  it('voices chords inside the range with the right pitch classes and smooth leading', () => {
    const opts = { lo: 57, hi: 77, n: 4, rootless: true }
    let prev = null
    for (const sym of ['Dmaj9', 'Bm11', 'Gmaj9', 'A13sus4', 'F#m7', 'E7#9', 'Am7b5', 'D7b9']) {
      const ch = parseChord(sym)
      const v = voiceChord(ch, opts, prev)
      expect(v).toHaveLength(4)
      for (const m of v) {
        expect(m).toBeGreaterThanOrEqual(57)
        expect(m).toBeLessThanOrEqual(77)
        expect(ch.pcs).toContain(mod12(m))
      }
      if (prev) {
        const moved = v.reduce((a, m, i) => a + Math.abs(m - prev[i]), 0)
        expect(moved).toBeLessThanOrEqual(24)
      }
      prev = v
    }
  })

  it('chord scales include the chord tones', () => {
    const c = parseChord('Gm6')
    const s = chordScale(c)
    for (const pc of c.pcs) expect(s.has(pc)).toBe(true)
  })
})

describe('voice pool', () => {
  it('caps simultaneous voices and steals the oldest', () => {
    const pool = new VoicePool(24)
    const killed = []
    for (let i = 0; i < 40; i++) pool.add(i * 0.01, 10, () => killed.push(i))
    expect(pool.active).toBe(24)
    expect(killed).toEqual([...Array(16).keys()])
    pool.add(20, 21, () => {})
    expect(pool.active).toBe(1) // finished voices are pruned
  })
})

describe('pure-JS DSP renderers', () => {
  const SR = 22050

  it('renders every drum voice finite and within ±1', () => {
    for (const name of DRUM_NAMES) {
      const r = finiteAndBounded(renderDrum(name, SR))
      expect(r.ok, `${name} peak ${r.peak}`).toBe(true)
      expect(r.peak).toBeGreaterThan(0.1)
    }
  })

  it('renders sampled instrument notes', () => {
    for (const p of SAMPLER_PRESETS) {
      for (const m of [48, 67, 84]) {
        const a = renderSamplerNote(p, m, SR)
        const r = finiteAndBounded(a, 1.5)
        expect(r.ok, `${p}:${m} peak ${r.peak}`).toBe(true)
        expect(r.peak).toBeGreaterThan(0.02)
      }
    }
  })

  it('renders every jingle as clean stereo', () => {
    for (const [name, fn] of Object.entries(JINGLES)) {
      const [L, R] = fn(SR)
      expect(L.length).toBe(R.length)
      expect(finiteAndBounded(L).ok, name).toBe(true)
      expect(finiteAndBounded(R).ok, name).toBe(true)
    }
  })

  it('renders seamless surface loops and a decaying reverb IR', () => {
    for (const f of [renderSqueal, renderWind, renderRumble, renderGravel]) {
      const a = f(SR)
      expect(finiteAndBounded(a).ok).toBe(true)
      // loop seam: last→first sample step is no bigger than typical sample steps
      let maxStep = 0
      for (let i = 1; i < a.length; i++) maxStep = Math.max(maxStep, Math.abs(a[i] - a[i - 1]))
      expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThanOrEqual(maxStep + 1e-6)
    }
    const [L] = renderReverbIR(SR, { seconds: 1.5 })
    const head = L.slice(0, SR * 0.3).reduce((s, v) => s + v * v, 0)
    const tail = L.slice(L.length - SR * 0.3).reduce((s, v) => s + v * v, 0)
    expect(tail).toBeLessThan(head * 0.01)
  })
})
