<script setup>
import { store } from '../store.js'
import { useMenu, useGame } from '../nav.js'

const game = useGame()
const items = [
  { id: 'resume', label: 'Resume' },
  { id: 'restart', label: 'Restart' },
  { id: 'camera', label: 'Change Camera' },
  { id: 'settings', label: 'Settings' },
  { id: 'quit', label: 'Quit to Title' },
]
function act(i) {
  const id = items[i].id
  if (id === 'resume') game.resume()
  else if (id === 'restart') { game.resume(); game.restart() }
  else if (id === 'camera') { game.cam.cycle(); game.saveSettings({ camera: game.cam.mode }) }
  else if (id === 'settings') store.overlay = 'settings'
  else if (id === 'quit') { game.quitToTitle(); store.screen = 'title' }
}
const { index } = useMenu(() => items.length, { select: act, back: () => game.resume(), enabled: () => !store.overlay })
</script>

<template>
  <div class="screen dark pause">
    <h2 class="h-title">Paused</h2>
    <div class="menu">
      <button v-for="(it, i) in items" :key="it.id" class="btn" :class="{ focus: index === i }" @mouseenter="index = i" @click="act(i)"><span>{{ it.label }}</span></button>
    </div>
  </div>
</template>
