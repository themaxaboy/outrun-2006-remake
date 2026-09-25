<script setup>
import { reactive } from 'vue'
import { store } from '../store.js'
import { useMenu, useGame, uiSound } from '../nav.js'
import { PRESET_ORDER, PRESETS } from '../../core/quality.js'

const game = useGame()
const s = reactive({
  preset: game.preset.id,
  volume: { ...game.settings.volume },
  camera: game.cam.mode,
  autoGas: game.settings.autoGas,
  showFps: !!game.settings.showFps,
})
const cams = ['chase', 'far', 'bumper']
const rows = [
  { key: 'preset', label: 'Graphics' },
  { key: 'master', label: 'Master volume' },
  { key: 'music', label: 'Music volume' },
  { key: 'sfx', label: 'Effects volume' },
  { key: 'engine', label: 'Engine volume' },
  { key: 'camera', label: 'Camera' },
  { key: 'autoGas', label: 'Auto-accelerate (touch)' },
  { key: 'showFps', label: 'Show FPS' },
  { key: 'close', label: 'Done' },
]
function adjust(i, d) {
  const k = rows[i].key
  if (k === 'preset') {
    const j = (PRESET_ORDER.indexOf(s.preset) + d + PRESET_ORDER.length) % PRESET_ORDER.length
    s.preset = PRESET_ORDER[j]
    game.setPreset(s.preset)
  } else if (['master', 'music', 'sfx', 'engine'].includes(k)) {
    s.volume[k] = Math.round(Math.min(1, Math.max(0, s.volume[k] + d * 0.1)) * 10) / 10
    game.saveSettings({ volume: { ...s.volume } })
    game.audio?.setVolumes?.(s.volume)
  } else if (k === 'camera') {
    s.camera = cams[(cams.indexOf(s.camera) + d + 3) % 3]
    game.cam.mode = s.camera
    game.saveSettings({ camera: s.camera })
  } else if (k === 'autoGas') {
    s.autoGas = !s.autoGas
    game.input.touch.autoGas = s.autoGas
    game.saveSettings({ autoGas: s.autoGas })
  } else if (k === 'showFps') {
    s.showFps = !s.showFps
    game.perf.setOverlay(s.showFps)
    game.saveSettings({ showFps: s.showFps })
  } else return
  uiSound(game, 'uiMove')
}
function close() {
  if (store.overlay === 'settings') store.overlay = null
  else store.screen = 'title'
}
const { index } = useMenu(() => rows.length, {
  left: (i) => adjust(i, -1),
  right: (i) => adjust(i, 1),
  select: (i) => (rows[i].key === 'close' ? close() : adjust(i, 1)),
  back: close,
})
function value(k) {
  if (k === 'preset') return PRESETS[s.preset].label
  if (k in s.volume) return Math.round(s.volume[k] * 100) + '%'
  if (k === 'camera') return s.camera
  if (k === 'autoGas' || k === 'showFps') return s[k] ? 'On' : 'Off'
  return ''
}
</script>

<template>
  <div class="screen dark settings">
    <h2 class="h-title">Settings</h2>
    <div class="panel list">
      <div v-for="(r, i) in rows" :key="r.key" class="item" :class="{ focus: index === i, done: r.key === 'close' }" @mouseenter="index = i" @click="r.key === 'close' ? close() : adjust(i, 1)">
        <span class="k">{{ r.label }}</span>
        <span v-if="r.key !== 'close'" class="v"><button class="step" @click.stop="adjust(i, -1)">‹</button>{{ value(r.key) }}<button class="step" @click.stop="adjust(i, 1)">›</button></span>
      </div>
      <div class="gpu">GPU: {{ game.gpu || 'unknown' }}</div>
    </div>
  </div>
</template>

<style scoped>
.settings { z-index: 20; }
.list { width: min(520px, 94vw); display: flex; flex-direction: column; gap: 4px; }
.item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; font-weight: 800; }
.item.focus { border-color: #ffb300; background: rgba(255,140,0,.15); }
.item.done { justify-content: center; font-style: italic; font-size: 18px; color: #ffd84a; }
.v { display: flex; align-items: center; gap: 8px; text-transform: capitalize; font-style: italic; color: #9ff3ff; min-width: 150px; justify-content: space-between; }
.step { background: rgba(255,255,255,.12); border: 0; color: #fff; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 0; }
.gpu { font-size: 10px; opacity: .5; margin-top: 8px; text-align: center; }
</style>
