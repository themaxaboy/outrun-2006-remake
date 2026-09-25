// Trauma-based camera shake (smooth noise, decays over time).
export class Shake {
  constructor() { this.trauma = 0; this.t = 0; this.rumble = 0 }
  add(a) { this.trauma = Math.min(1, this.trauma + a) }
  update(dt) {
    this.t += dt
    this.trauma = Math.max(0, this.trauma - dt * 1.6)
    const k = this.trauma * this.trauma + this.rumble
    const t = this.t
    return {
      x: k * (Math.sin(t * 37.1) * 0.6 + Math.sin(t * 71.3) * 0.4) * 0.12,
      y: k * (Math.sin(t * 43.7 + 1.3) * 0.6 + Math.sin(t * 83.9) * 0.4) * 0.1,
      r: k * Math.sin(t * 29.3 + 2.1) * 0.02,
    }
  }
}
