// Owns the chain of Course instances the player drives: the current stage, its two fork
// children (generated as the fork comes into view) and the previous stage (still visible behind).
import { getStage } from './stages.js'
import { children } from './pyramid.js'
import { generateProgram, BRANCH_LANES, LANE_W } from './roadgen.js'
import { Course } from './course.js'

export const BRANCH_OFFSET = (BRANCH_LANES * LANE_W) / 2 // child centreline offset at the split

export class Route {
  constructor({ seed = 'or2r', startStage = '0-0', startPose = { x: 0, y: 14, z: 0, heading: 0 } } = {}) {
    this.seed = seed
    this.root = this.makeCourse(getStage(startStage), 'start', startPose)
    this.root.D0 = 0
    this.current = this.root
    this.previous = null
    this.visited = [this.root.stage.id]
  }

  makeCourse(stage, entry, pose) {
    const program = generateProgram(stage, { entry, startElev: pose.y, seed: this.seed })
    return new Course(stage, program, pose)
  }

  /** Generate both fork branches of `course` (idempotent). Returns [L, R] or null at a goal. */
  ensureChildren(course = this.current) {
    if (course.goal) return null
    if (course.children) return course.children
    const ids = children(course.stage.id)
    const end = course.endPose()
    const mk = (id, side) => {
      const d = side === 'L' ? -BRANCH_OFFSET : BRANCH_OFFSET
      const pose = { x: end.x + end.nx * d, y: end.y, z: end.z + end.nz * d, heading: end.heading }
      const c = this.makeCourse(getStage(id), side, pose)
      c.parent = course
      c.side = side
      c.D0 = course.D0 + course.length
      return c
    }
    const L = mk(ids[0], 'L')
    const R = mk(ids[1], 'R')
    L.sibling = R
    R.sibling = L
    course.children = [L, R]
    return course.children
  }

  /**
   * The player crossed the end of the current course at lateral offset x.
   * Returns { course, side, dx } where x_new = x + dx.
   */
  commit(x) {
    const kids = this.ensureChildren(this.current)
    if (!kids) return null
    const side = x < 0 ? 'L' : 'R'
    const child = side === 'L' ? kids[0] : kids[1]
    this.previous = this.current
    this.current = child
    this.visited.push(child.stage.id)
    return { course: child, side, dx: side === 'L' ? BRANCH_OFFSET : -BRANCH_OFFSET }
  }

  get routeString() {
    return this.visited.slice(1).map((id, i) => {
      const prevCol = Number(this.visited[i].split('-')[1])
      return Number(id.split('-')[1]) > prevCol ? 'R' : 'L'
    }).join('')
  }
}
