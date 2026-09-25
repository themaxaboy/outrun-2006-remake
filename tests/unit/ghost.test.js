import { describe, it, expect } from 'vitest'
import { GhostRecorder, ghostAt } from '../../src/game/ghost.js'

describe('ghost', () => {
  it('records at 10 Hz and interpolates', () => {
    const r = new GhostRecorder()
    for (let t = 0; t <= 10; t += 1 / 120) r.sample(t, t < 5 ? 0 : 1, t * 50, Math.sin(t), 0)
    const g = r.toGhost({ time: 10 })
    expect(g.data.length / 5).toBeGreaterThan(95)
    expect(g.data.length / 5).toBeLessThan(105)
    const a = ghostAt(g, 2.05)
    expect(a.stageIdx).toBe(0)
    expect(a.s).toBeCloseTo(102.5, 0)
    expect(ghostAt(g, 7).stageIdx).toBe(1)
    expect(ghostAt(g, 20)).toBeNull()
  })
})
