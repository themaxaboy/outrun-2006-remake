// Frame statistics + optional overlay (?perf=1). Exposed on window.__perf for e2e/bench.
export class Perf {
  constructor({ overlay = false } = {}) {
    this.frames = []
    this.updates = []
    this.maxSamples = 240
    this.info = { calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 }
    this.extra = {}
    this.el = null
    if (overlay) {
      this.el = document.createElement('pre')
      this.el.className = 'perf-overlay'
      document.body.appendChild(this.el)
    }
    this._last = 0
    if (typeof window !== 'undefined') window.__perf = this
  }

  frame(deltaMs, updateMs, renderer) {
    this.frames.push(deltaMs)
    this.updates.push(updateMs)
    if (this.frames.length > this.maxSamples) { this.frames.shift(); this.updates.shift() }
    const r = renderer.info
    this.info.calls = r.render.calls
    this.info.triangles = r.render.triangles
    this.info.geometries = r.memory.geometries
    this.info.textures = r.memory.textures
    this.info.programs = r.programs ? r.programs.length : 0
    this.info.maxCalls = Math.max(this.info.maxCalls || 0, r.render.calls)
    this.info.maxTriangles = Math.max(this.info.maxTriangles || 0, r.render.triangles)
    const now = performance.now()
    if (this.el && now - this._last > 250) {
      this._last = now
      const s = this.summary()
      this.el.textContent =
        `FPS ${s.fps.toFixed(0)}  avg ${s.avg.toFixed(1)}ms  p99 ${s.p99.toFixed(1)}ms\n` +
        `update p95 ${s.upd95.toFixed(2)}ms\n` +
        `calls ${this.info.calls}  tris ${(this.info.triangles / 1000).toFixed(0)}k\n` +
        `geo ${this.info.geometries}  tex ${this.info.textures}  prog ${this.info.programs}\n` +
        Object.entries(this.extra).map(([k, v]) => `${k} ${v}`).join('\n')
    }
  }

  static pct(arr, p) {
    if (!arr.length) return 0
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(s.length * p))]
  }

  summary() {
    const avg = this.frames.reduce((a, b) => a + b, 0) / Math.max(1, this.frames.length)
    return {
      fps: 1000 / Math.max(avg, 0.001),
      avg,
      p99: Perf.pct(this.frames, 0.99),
      upd95: Perf.pct(this.updates, 0.95),
      ...this.info,
    }
  }

  reset() { this.frames.length = 0; this.updates.length = 0; this.info.maxCalls = 0; this.info.maxTriangles = 0 }
}
