// Merges keyboard, gamepad and touch into one analog InputState. The last-used device
// owns steering; throttle/brake take the max of all devices.
import { Keyboard } from './keyboard.js'
import { Gamepads } from './gamepad.js'
import { TouchControls, isTouchDevice } from './touch.js'
import { clamp, approach } from '../core/math.js'

export class Input {
  constructor({ touchParent } = {}) {
    this.kb = new Keyboard()
    this.pad = new Gamepads()
    this.touch = new TouchControls(touchParent)
    this.isTouch = isTouchDevice()
    this.kbSteer = 0
    this.activeDevice = this.isTouch ? 'touch' : 'keyboard'
    this.state = {
      steer: 0, throttle: 0, brake: 0, drift: false,
      shiftUp: false, shiftDown: false, camera: false, pause: false, confirm: false, back: false,
      up: false, down: false, left: false, right: false,
    }
    this.enabled = true
  }

  showTouch(v) { this.touch.setVisible(v && this.isTouch) }

  /** Call once per rendered frame. speedNorm (0..1) softens keyboard steering at speed. */
  update(dt, speedNorm = 0) {
    const kb = this.kb
    const pad = this.pad.poll()
    const st = this.state

    // keyboard steering ramp
    const left = kb.is('ArrowLeft', 'KeyA')
    const right = kb.is('ArrowRight', 'KeyD')
    const target = (right ? 1 : 0) - (left ? 1 : 0)
    const rise = 4.2 - 1.6 * speedNorm
    if (target === 0) this.kbSteer = approach(this.kbSteer, 0, 7 * dt)
    else {
      if (Math.sign(this.kbSteer) !== target && this.kbSteer !== 0) this.kbSteer = approach(this.kbSteer, 0, 12 * dt)
      this.kbSteer = approach(this.kbSteer, target, rise * dt)
    }
    const kbThrottle = kb.is('ArrowUp', 'KeyW') ? 1 : 0
    const kbBrake = kb.is('ArrowDown', 'KeyS') ? 1 : 0

    // active device
    const tKb = kb.lastActive, tPad = this.pad.lastActive, tTouch = this.touch.lastActive
    const newest = Math.max(tKb, tPad, tTouch)
    if (newest > 0) this.activeDevice = newest === tPad ? 'gamepad' : newest === tTouch ? 'touch' : 'keyboard'

    let steer = this.kbSteer
    if (this.activeDevice === 'gamepad' && pad.connected) steer = pad.steer
    else if (this.activeDevice === 'touch') steer = this.touch.state.steer
    st.steer = clamp(steer, -1, 1)
    st.throttle = Math.max(kbThrottle, pad.connected ? pad.throttle : 0, this.touch.throttle())
    st.brake = Math.max(kbBrake, pad.connected ? pad.brake : 0, this.touch.visible ? this.touch.state.brake : 0)
    st.drift = kb.is('ShiftLeft', 'ShiftRight', 'Space') || (pad.connected && pad.drift) || this.touch.state.drift
    st.shiftUp = kb.pressed('KeyE') || this.pad.pressed(5)
    st.shiftDown = kb.pressed('KeyQ') || this.pad.pressed(4)
    st.camera = kb.pressed('KeyC') || this.pad.pressed(3)
    st.pause = kb.pressed('Escape', 'KeyP') || this.pad.pressed(9)
    st.confirm = kb.pressed('Enter', 'Space') || this.pad.pressed(0)
    st.back = kb.pressed('Escape', 'Backspace') || this.pad.pressed(1)
    st.up = kb.pressed('ArrowUp', 'KeyW') || this.pad.pressed('dir_up')
    st.down = kb.pressed('ArrowDown', 'KeyS') || this.pad.pressed('dir_down')
    st.left = kb.pressed('ArrowLeft', 'KeyA') || this.pad.pressed('dir_left')
    st.right = kb.pressed('ArrowRight', 'KeyD') || this.pad.pressed('dir_right')
    kb.endFrame()
    return st
  }

  rumble(strong, weak, ms) { this.pad.rumble(strong, weak, ms) }
}
