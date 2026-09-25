// Fixed-timestep simulation (default 120 Hz) with render interpolation.
// In "virtual" mode (e2e/bench) each rendered frame advances a fixed number of sim steps,
// so tests are deterministic no matter how slow the (software) renderer is.

export class Loop {
  constructor({ step, render, fixedDt = 1 / 120, maxFrameDt = 0.1 }) {
    this.step = step
    this.render = render
    this.fixedDt = fixedDt
    this.maxFrameDt = maxFrameDt
    this.acc = 0
    this.last = 0
    this.running = false
    this.timeScale = 1
    this.virtual = false
    this.virtualStepsPerFrame = 2 // 2 × 1/120 = 1/60 s per rendered frame
    this.frameDt = 1 / 60
    this.stepCost = 0 // ms of the last frame's sim work
    this._raf = 0
    this._tick = this._tick.bind(this)
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this._raf = requestAnimationFrame(this._tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this._raf)
  }

  _tick(now) {
    if (!this.running) return
    this._raf = requestAnimationFrame(this._tick)
    let dt = (now - this.last) / 1000
    this.last = now
    if (dt > this.maxFrameDt) dt = this.maxFrameDt
    if (dt < 0) dt = 0
    this.frameDt = dt

    const t0 = performance.now()
    let steps = 0
    if (this.virtual) {
      for (let i = 0; i < this.virtualStepsPerFrame; i++) this.step(this.fixedDt)
      steps = this.virtualStepsPerFrame
      this.acc = 0
      dt = this.fixedDt * this.virtualStepsPerFrame
    } else {
      this.acc += dt * this.timeScale
      while (this.acc >= this.fixedDt && steps < 24) {
        this.step(this.fixedDt)
        this.acc -= this.fixedDt
        steps++
      }
      if (steps >= 24) this.acc = 0
    }
    this.stepCost = performance.now() - t0
    const alpha = this.virtual ? 1 : this.acc / this.fixedDt
    this.render(alpha, dt, now)
  }
}
