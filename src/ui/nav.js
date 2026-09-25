// Keyboard / gamepad menu navigation driven by the game's per-frame input edges
// (bus 'input:frame'), plus helpers for UI sounds.
import { ref, onMounted, onUnmounted, inject } from 'vue'
import { bus } from '../core/events.js'

export function useGame() { return inject('game') }

export function uiSound(game, name) { try { game?.audio?.sfx?.(name) } catch { /* audio optional */ } }

/**
 * @param count   () => number of focusable rows
 * @param handlers { select(i), back(), left(i), right(i) }
 */
export function useMenu(count, handlers = {}, { initial = 0, wrap = true } = {}) {
  const index = ref(initial)
  const game = useGame()
  let off = null
  const move = (d) => {
    const n = count()
    if (!n) return
    let i = index.value + d
    if (wrap) i = (i + n) % n
    else i = Math.max(0, Math.min(n - 1, i))
    if (i !== index.value) uiSound(game, 'uiMove')
    index.value = i
  }
  onMounted(() => {
    off = bus.on('input:frame', (inp) => {
      if (handlers.enabled && !handlers.enabled()) return
      if (inp.up) move(-1)
      if (inp.down) move(1)
      if (inp.left) handlers.left ? handlers.left(index.value) : null
      if (inp.right) handlers.right ? handlers.right(index.value) : null
      if (inp.confirm && handlers.select) { uiSound(game, 'uiSelect'); handlers.select(index.value) }
      if (inp.back && handlers.back) { uiSound(game, 'uiBack'); handlers.back() }
    })
  })
  onUnmounted(() => off && off())
  return { index, move }
}
