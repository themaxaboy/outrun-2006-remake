import { describe, it, expect } from 'vitest'
import { Route, BRANCH_OFFSET } from '../../src/track/route.js'
import { STAGES } from '../../src/track/stages.js'
import { children, routeStages } from '../../src/track/pyramid.js'
import { RNG } from '../../src/core/rng.js'
import { DS } from '../../src/track/course.js'

function hashCourse(c) {
  let h = 0
  for (let i = 0; i < c.n; i += 7) h = (h * 31 + Math.round(c.px[i] * 100) + Math.round(c.pz[i] * 100) * 7 + Math.round(c.py[i] * 100) * 13) | 0
  return h
}

describe('rng', () => {
  it('same seed → same sequence', () => {
    const a = new RNG('abc'), b = new RNG('abc'), c = new RNG('abd')
    const sa = [a.next(), a.next(), a.next()]
    expect([b.next(), b.next(), b.next()]).toEqual(sa)
    expect(c.next()).not.toBe(sa[0])
  })
})

describe('pyramid', () => {
  it('has 15 stages, row r has r+1 stages', () => {
    expect(STAGES.length).toBe(15)
    for (let r = 0; r < 5; r++) expect(STAGES.filter((s) => s.id.startsWith(r + '-')).length).toBe(r + 1)
  })
  it('children map (r,c) → (r+1,c),(r+1,c+1)', () => {
    expect(children('0-0')).toEqual(['1-0', '1-1'])
    expect(children('2-1')).toEqual(['3-1', '3-2'])
    expect(children('4-2')).toBeNull()
  })
  it('routes resolve to goals', () => {
    expect(routeStages('LLLL').at(-1)).toBe('4-0')
    expect(routeStages('RRRR').at(-1)).toBe('4-4')
    expect(routeStages('LRLR').at(-1)).toBe('4-2')
  })
})

describe('road generation', () => {
  it('is deterministic per seed', () => {
    const a = new Route({ seed: 'x' }), b = new Route({ seed: 'x' }), c = new Route({ seed: 'y' })
    expect(hashCourse(a.current)).toBe(hashCourse(b.current))
    expect(hashCourse(a.current)).not.toBe(hashCourse(c.current))
  })

  it('every route is C1-continuous across sections and fork joins', () => {
    for (const route of ['LLLL', 'RRRR', 'LRLR', 'RLRL']) {
      const r = new Route({ seed: 'or2r' })
      for (let row = 0; row < 5; row++) {
        const c = r.current
        // continuity inside the course: neighbouring samples
        for (let i = 1; i < c.n; i++) {
          const d = Math.hypot(c.px[i] - c.px[i - 1], c.py[i] - c.py[i - 1], c.pz[i] - c.pz[i - 1])
          expect(Math.abs(d - DS)).toBeLessThan(0.05)
          expect(Math.abs(c.hd[i] - c.hd[i - 1])).toBeLessThan(0.02)
        }
        if (row === 4) break
        const [L, R] = r.ensureChildren(c)
        for (const [kid, side] of [[L, -1], [R, 1]]) {
          const end = c.world(c.length, side * BRANCH_OFFSET, 0)
          const start = kid.world(0, 0, 0)
          expect(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z)).toBeLessThan(0.05)
          expect(Math.abs(kid.hd[0] - c.sample(c.length).heading)).toBeLessThan(1e-3)
        }
        r.commit(route[row] === 'R' ? 1 : -1)
      }
    }
  })

  it('fork re-parameterisation keeps world position continuous', () => {
    const r = new Route()
    const c = r.current
    for (const x of [-9, -3, 3, 9]) {
      const before = c.world(c.length, x, 0)
      const kids = r.ensureChildren(c)
      const kid = x < 0 ? kids[0] : kids[1]
      const xNew = x + (x < 0 ? BRANCH_OFFSET : -BRANCH_OFFSET)
      const after = kid.world(0, xNew, 0)
      expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(0.05)
    }
  })

  it('stays within sane curvature and elevation', () => {
    const r = new Route()
    const c = r.current
    for (let i = 0; i < c.n; i++) {
      expect(Math.abs(c.kp[i])).toBeLessThan(1 / 150)
      expect(c.py[i]).toBeGreaterThan(-5)
      expect(Math.abs(Math.tan(c.pt[i]))).toBeLessThan(0.08)
    }
  })
})
