// On-screen touch controls: drag-steer pad on the left, GAS/BRAKE/DRIFT on the right.
// Auto-gas is on by default (like many mobile racers); a quick BRAKE tap still starts a drift.
export function isTouchDevice() {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches
}

export class TouchControls {
  constructor(parent = document.body) {
    this.state = { steer: 0, throttle: 0, brake: 0, drift: false, active: false }
    this.autoGas = true
    this.visible = false
    this.lastActive = 0
    this.el = document.createElement('div')
    this.el.className = 'touch-controls'
    this.el.innerHTML = `
      <div class="tc-steer"><div class="tc-knob"></div><span>STEER</span></div>
      <div class="tc-right">
        <button class="tc-btn tc-drift" aria-label="Drift">DRIFT</button>
        <button class="tc-btn tc-brake" aria-label="Brake">BRAKE</button>
        <button class="tc-btn tc-gas" aria-label="Gas">GAS</button>
      </div>`
    parent.appendChild(this.el)
    this.steerEl = this.el.querySelector('.tc-steer')
    this.knob = this.el.querySelector('.tc-knob')
    this._steerId = null
    this._steerX0 = 0
    const on = (el, name, down, up) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); down(e); this.lastActive = performance.now() })
      el.addEventListener('pointermove', (e) => { if (name === 'steer') this._move(e) })
      const end = (e) => { e.preventDefault(); up(e) }
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
    }
    on(this.steerEl, 'steer', (e) => { this._steerId = e.pointerId; this._steerX0 = e.clientX; this._move(e) }, () => { this._steerId = null; this.state.steer = 0; this._knob(0) })
    on(this.el.querySelector('.tc-gas'), 'gas', () => { this.state.throttle = 1; this.autoGasHeld = true }, () => { this.state.throttle = 0; this.autoGasHeld = false })
    on(this.el.querySelector('.tc-brake'), 'brake', () => { this.state.brake = 1 }, () => { this.state.brake = 0 })
    on(this.el.querySelector('.tc-drift'), 'drift', () => { this.state.drift = true }, () => { this.state.drift = false })
    this.setVisible(false)
  }

  _move(e) {
    if (e.pointerId !== this._steerId) return
    const dx = e.clientX - this._steerX0
    const s = Math.max(-1, Math.min(1, dx / 60))
    this.state.steer = s
    this._knob(s)
  }

  _knob(s) { this.knob.style.transform = `translateX(${s * 48}px)` }

  setVisible(v) {
    this.visible = v
    this.el.style.display = v ? '' : 'none'
  }

  /** throttle including auto-gas (released while braking) */
  throttle() {
    if (!this.visible) return 0
    if (this.autoGas) return this.state.brake > 0.5 ? 0 : 1
    return this.state.throttle
  }
}
