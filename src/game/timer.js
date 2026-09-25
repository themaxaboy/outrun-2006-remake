// Checkpoint timer (pure). The clock counts down; each checkpoint adds the next stage's time and
// leftover time carries over — exactly the OutRun loop.
import { START_TIME } from '../track/stages.js'

export class RaceTimer {
  constructor(start = START_TIME, { countDown = true } = {}) {
    this.countDown = countDown
    this.left = start
    this.total = 0
    this.stageTime = 0
    this.splits = []
    this.over = false
    this.running = false
  }
  start() { this.running = true }
  stop() { this.running = false }
  tick(dt) {
    if (!this.running || this.over) return false
    this.total += dt
    this.stageTime += dt
    if (!this.countDown) return false
    this.left -= dt
    if (this.left <= 0) {
      this.left = 0
      this.over = true
      this.running = false
      return true // time up this tick
    }
    return false
  }
  /** Stage cleared: record the split, add extension. Returns seconds added. */
  checkpoint(ext) {
    this.splits.push(this.stageTime)
    this.stageTime = 0
    if (this.countDown) this.left += ext
    return ext
  }
  finish() {
    this.splits.push(this.stageTime)
    this.running = false
  }
}

export function formatTime(t, decimals = 2) {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  const ss = s.toFixed(decimals).padStart(decimals ? 3 + decimals : 2, '0')
  return `${m}'${ss.replace('.', '"')}`
}
