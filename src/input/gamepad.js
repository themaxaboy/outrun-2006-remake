// Gamepad API polling (standard mapping, with an axis fallback for odd pads).
export const PAD_DEADZONE = 0.12

export function shapeStick(x, dead = PAD_DEADZONE, curve = 1.5) {
  const a = Math.abs(x)
  if (a < dead) return 0
  const t = (a - dead) / (1 - dead)
  return Math.sign(x) * Math.pow(t, curve)
}

export class Gamepads {
  constructor() {
    this.state = { connected: false, steer: 0, throttle: 0, brake: 0, drift: false, up: false, down: false, left: false, right: false }
    this.prevButtons = []
    this.pressedSet = new Set()
    this.lastActive = 0
    this.pad = null
  }

  poll() {
    this.pressedSet.clear()
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let pad = null
    for (const p of pads) if (p && p.connected) { pad = p; break }
    this.pad = pad
    const st = this.state
    st.connected = !!pad
    if (!pad) return st
    const b = (i) => (pad.buttons[i] ? pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0) : 0)
    const lx = pad.axes[0] || 0
    const dpadX = b(15) - b(14)
    st.steer = dpadX !== 0 ? dpadX : shapeStick(lx)
    if (pad.mapping === 'standard') {
      st.throttle = b(7)
      st.brake = b(6)
    } else {
      // non-standard: try axes 2/5 as triggers (range -1..1 → 0..1)
      const rt = pad.axes.length > 5 ? (pad.axes[5] + 1) / 2 : 0
      const lt = pad.axes.length > 2 ? (pad.axes[2] + 1) / 2 : 0
      st.throttle = Math.max(b(7), rt > 0.05 ? rt : 0)
      st.brake = Math.max(b(6), lt > 0.05 ? lt : 0)
    }
    st.drift = b(0) > 0.5 || b(2) > 0.5
    st.up = b(12) > 0.5 || (pad.axes[1] || 0) < -0.6
    st.down = b(13) > 0.5 || (pad.axes[1] || 0) > 0.6
    st.left = b(14) > 0.5 || lx < -0.6
    st.right = b(15) > 0.5 || lx > 0.6
    // edges
    for (let i = 0; i < pad.buttons.length; i++) {
      const v = b(i) > 0.5
      if (v && !this.prevButtons[i]) this.pressedSet.add(i)
      this.prevButtons[i] = v
    }
    for (const [name, on] of [['up', st.up], ['down', st.down], ['left', st.left], ['right', st.right]]) {
      const k = 'dir_' + name
      if (on && !this.prevButtons[k]) this.pressedSet.add(k)
      this.prevButtons[k] = on
    }
    if (Math.abs(lx) > 0.3 || st.throttle > 0.1 || st.brake > 0.1 || this.pressedSet.size) this.lastActive = performance.now()
    return st
  }

  pressed(i) { return this.pressedSet.has(i) }

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    const act = this.pad?.vibrationActuator
    if (act && act.playEffect) act.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {})
  }
}
