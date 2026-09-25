// Keyboard state. Steering is ramped (digital → analog) in input.js.
export class Keyboard {
  constructor(target = window) {
    this.down = new Set()
    this.edges = new Set()
    this.lastActive = 0
    this._kd = (e) => {
      if (e.repeat) return
      const c = e.code
      this.down.add(c)
      this.edges.add(c)
      this.lastActive = performance.now()
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c) && e.target === document.body) e.preventDefault()
    }
    this._ku = (e) => this.down.delete(e.code)
    this._blur = () => this.down.clear()
    target.addEventListener('keydown', this._kd)
    target.addEventListener('keyup', this._ku)
    window.addEventListener('blur', this._blur)
  }
  is(...codes) { return codes.some((c) => this.down.has(c)) }
  pressed(...codes) { return codes.some((c) => this.edges.has(c)) }
  endFrame() { this.edges.clear() }
}
