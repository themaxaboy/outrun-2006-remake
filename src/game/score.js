// Score keeping (pure). Speed points, drift combos (chained within a window), near misses,
// slipstream passes and the remaining-time bonus at the goal.
export const SCORE = {
  perKmhSecond: 1.2,
  driftK: 0.9, // points per (m/s · rad · s)
  chainWindow: 1.6,
  nearMiss: 5000,
  slipPass: 2000,
  goalPerSecond: 100000 / 10, // per remaining second (×10 → per 0.1 s shown)
}

export class Score {
  constructor() {
    this.points = 0
    this.chain = 0
    this.chainT = 99
    this.multiplier = 1
    this.driftLive = 0
    this.lastDriftPoints = 0
    this.nearMisses = 0
    this.bestDrift = 0
    this.driftCount = 0
  }
  tick(dt, speed) {
    this.points += speed * 3.6 * dt * SCORE.perKmhSecond
    this.chainT += dt
    if (this.chainT > SCORE.chainWindow && this.driftLive === 0) { this.chain = 0; this.multiplier = 1 }
  }
  driftStart() {
    if (this.chainT <= SCORE.chainWindow) this.chain++
    else this.chain = 1
    this.multiplier = Math.min(8, this.chain)
    this.driftLive = 1
  }
  driftUpdate(raw) { this.driftLiveRaw = raw }
  driftEnd(raw, broken = false) {
    this.driftLive = 0
    this.chainT = 0
    if (broken) { this.chain = 0; this.multiplier = 1; this.lastDriftPoints = 0; return 0 }
    const pts = Math.round(raw * SCORE.driftK * 10) * this.multiplier
    this.points += pts
    this.lastDriftPoints = pts
    this.bestDrift = Math.max(this.bestDrift, pts)
    this.driftCount++
    return pts
  }
  nearMiss() { this.nearMisses++; this.points += SCORE.nearMiss; return SCORE.nearMiss }
  slipPass() { this.points += SCORE.slipPass; return SCORE.slipPass }
  goalBonus(secondsLeft) {
    const b = Math.round(secondsLeft * SCORE.goalPerSecond * 10)
    this.points += b
    return b
  }
  get value() { return Math.floor(this.points) }
}
