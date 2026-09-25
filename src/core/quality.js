// Quality presets, GPU auto-detection and the dynamic-resolution controller.
//
// Dynamic resolution keys off *missed frames relative to the display's refresh interval*
// (a vsynced 60 Hz display always reports ~16.7 ms, so raw frame time can't show headroom).
// It scales down quickly when frames are missed and probes upward slowly, reverting on a miss.

export const PRESETS = {
  low: {
    id: 'low', label: 'Low', dprCap: 1.0, scaleMin: 0.55, scaleMax: 0.85, viewDist: 820, farFade: [600, 800],
    shadows: false, shadowMap: 0, aa: 'fxaa', msaa: 0, density: 0.45, speedBlur: false, bloomHalf: true, bloomLevels: 4,
    trafficScale: 0.7, carShadowBlob: true,
  },
  medium: {
    id: 'medium', label: 'Medium', dprCap: 1.5, scaleMin: 0.65, scaleMax: 1.0, viewDist: 1100, farFade: [820, 1080],
    shadows: true, shadowMap: 1024, aa: 'smaa', msaa: 0, density: 0.7, speedBlur: true, bloomHalf: false, bloomLevels: 5,
    trafficScale: 0.9, carShadowBlob: false,
  },
  high: {
    id: 'high', label: 'High', dprCap: 2.0, scaleMin: 0.75, scaleMax: 1.0, viewDist: 1500, farFade: [1100, 1480],
    shadows: true, shadowMap: 2048, aa: 'smaa', msaa: 0, density: 1.0, speedBlur: true, bloomHalf: false, bloomLevels: 6,
    trafficScale: 1, carShadowBlob: false,
  },
  ultra: {
    id: 'ultra', label: 'Ultra', dprCap: 2.0, scaleMin: 0.85, scaleMax: 1.0, viewDist: 2000, farFade: [1500, 1980],
    shadows: true, shadowMap: 4096, aa: 'smaa', msaa: 4, density: 1.3, speedBlur: true, bloomHalf: false, bloomLevels: 7,
    trafficScale: 1, carShadowBlob: false,
  },
}
export const PRESET_ORDER = ['low', 'medium', 'high', 'ultra']

export function gpuInfo(renderer) {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return String(r || '')
  } catch {
    return ''
  }
}

export function detectPreset(renderer) {
  const r = gpuInfo(renderer).toLowerCase()
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(r)) return 'low'
  if (touch) {
    if (/apple gpu|adreno \(tm\) (7[3-9]|8)|mali-g(7[1-9]|[89]\d|1\d\d)|immortalis/.test(r)) return 'medium'
    return 'low'
  }
  if (/rtx|radeon rx|radeon pro|arc a|apple m[1-9]|geforce gtx 1[06-9]|geforce gtx 16/.test(r)) return 'high'
  if (/intel|uhd|iris|radeon\(tm\) graphics|vega/.test(r)) return 'medium'
  return 'medium'
}

export class DynamicResolution {
  constructor(preset) {
    this.setPreset(preset)
    this.deltas = []
    this.refresh = 1000 / 60
    this.calibrated = false
    this.ema = 16.7
    this.lastChange = 0
    this.lastUp = -1e9
    this.upLockUntil = 0
    this.window = []
    this.enabled = true
  }

  setPreset(p) {
    this.min = p.scaleMin
    this.max = p.scaleMax
    this.scale = p.scaleMax
  }

  /** Feed the real rAF delta (ms). Returns a new scale when it should change, else null. */
  sample(deltaMs, now) {
    if (!this.enabled || deltaMs <= 0 || deltaMs > 250) return null
    if (!this.calibrated) {
      this.deltas.push(deltaMs)
      if (this.deltas.length >= 90) {
        const s = [...this.deltas].sort((a, b) => a - b)
        this.refresh = s[Math.floor(s.length * 0.3)] // fast-ish frames ≈ refresh interval
        this.calibrated = true
      }
      return null
    }
    const target = Math.max(this.refresh, 1000 / 60)
    this.ema += (deltaMs - this.ema) * 0.1
    const missed = deltaMs > target * 1.45
    this.window.push(missed ? 1 : 0)
    if (this.window.length > 40) this.window.shift()
    const misses = this.window.reduce((a, b) => a + b, 0)
    if (now - this.lastChange < 1000) return null
    // a miss right after an upward probe → revert and hold
    if (missed && now - this.lastUp < 1200) {
      this.upLockUntil = now + 12000
      return this._set(this.scale - 0.05, now)
    }
    if (misses >= 4 || this.ema > target * 1.12) {
      this.window.length = 0
      return this._set(this.scale - 0.08, now)
    }
    if (misses === 0 && this.window.length >= 40 && this.ema < target * 1.03 && now > this.upLockUntil && this.scale < this.max) {
      this.lastUp = now
      return this._set(this.scale + 0.05, now)
    }
    return null
  }

  _set(v, now) {
    const nv = Math.min(this.max, Math.max(this.min, Math.round(v * 100) / 100))
    if (nv === this.scale) return null
    this.scale = nv
    this.lastChange = now
    return nv
  }
}
