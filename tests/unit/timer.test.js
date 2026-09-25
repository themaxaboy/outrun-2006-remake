import { describe, it, expect } from 'vitest'
import { RaceTimer, formatTime } from '../../src/game/timer.js'
import { Score } from '../../src/game/score.js'
import { stageExtension, getStage } from '../../src/track/stages.js'

describe('timer', () => {
  it('counts down, extends at checkpoints and carries time over', () => {
    const t = new RaceTimer(60)
    t.start()
    for (let i = 0; i < 50 * 10; i++) t.tick(0.1)
    expect(t.left).toBeCloseTo(10, 5)
    t.checkpoint(70)
    expect(t.left).toBeCloseTo(80, 5)
    expect(t.splits.length).toBe(1)
    expect(t.stageTime).toBe(0)
  })
  it('reports time-up exactly once and stops at 0', () => {
    const t = new RaceTimer(1)
    t.start()
    let ups = 0
    for (let i = 0; i < 30; i++) if (t.tick(0.1)) ups++
    expect(ups).toBe(1)
    expect(t.left).toBe(0)
    expect(t.over).toBe(true)
  })
  it('time attack mode does not count down', () => {
    const t = new RaceTimer(60, { countDown: false })
    t.start()
    for (let i = 0; i < 100; i++) expect(t.tick(1)).toBe(false)
    expect(t.total).toBe(100)
  })
  it('stage extensions are positive and grow on harder routes', () => {
    expect(stageExtension(getStage('1-0'))).toBeGreaterThan(60)
    expect(stageExtension(getStage('4-4'))).toBeGreaterThan(stageExtension(getStage('4-0')))
  })
  it('formats times', () => {
    expect(formatTime(83.456)).toBe(`1'23"46`)
  })
})

describe('score', () => {
  it('chains drifts and applies multipliers', () => {
    const s = new Score()
    s.driftStart()
    const a = s.driftEnd(100)
    s.tick(0.5, 0)
    s.driftStart()
    const b = s.driftEnd(100)
    expect(b).toBe(a * 2)
    s.tick(3, 0)
    s.driftStart()
    expect(s.multiplier).toBe(1)
  })
  it('broken drifts score nothing', () => {
    const s = new Score()
    s.driftStart()
    expect(s.driftEnd(500, true)).toBe(0)
  })
  it('goal bonus scales with remaining seconds', () => {
    const s = new Score()
    expect(s.goalBonus(10)).toBe(1000000)
  })
})
