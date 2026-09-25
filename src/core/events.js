// Minimal event bus for discrete game ↔ UI events (never per-frame data).
export class Emitter {
  constructor() { this._h = new Map() }
  on(type, fn) {
    if (!this._h.has(type)) this._h.set(type, new Set())
    this._h.get(type).add(fn)
    return () => this.off(type, fn)
  }
  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p) })
    return off
  }
  off(type, fn) { this._h.get(type)?.delete(fn) }
  emit(type, payload) {
    const set = this._h.get(type)
    if (set) for (const fn of [...set]) fn(payload)
  }
}

export const bus = new Emitter()
