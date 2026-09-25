// Guarded access to browser audio globals so every module can be imported in Node.

export const hasWindow = () => typeof window !== 'undefined'
export const hasDocument = () => typeof document !== 'undefined'

export function getAudioContextClass() {
  if (!hasWindow()) return null
  return window.AudioContext || window.webkitAudioContext || null
}

export function getOfflineAudioContextClass() {
  if (!hasWindow()) return null
  return window.OfflineAudioContext || window.webkitOfflineAudioContext || null
}

/** setTargetAtTime that tolerates non-finite input and old implementations. */
export function setParam(param, value, time, tau = 0.03) {
  if (!param || !Number.isFinite(value)) return
  try {
    param.setTargetAtTime(value, time, Math.max(0.001, tau))
  } catch {
    param.value = value
  }
}

/** Cancel future automation keeping the current value (cancelAndHold where available). */
export function holdParam(param, time) {
  if (!param) return
  try {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(time)
    else {
      const v = param.value
      param.cancelScheduledValues(time)
      param.setValueAtTime(v, time)
    }
  } catch {
    /* ignore */
  }
}

export function createPanner(ctx, pan = 0) {
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner()
    p.pan.value = Math.max(-1, Math.min(1, pan))
    return p
  }
  // Very old Safari: no StereoPanner — fall back to a pass-through gain.
  const g = ctx.createGain()
  g.pan = { value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }
  return g
}

