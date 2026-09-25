<script setup>
import { computed } from 'vue'
import { store } from '../store.js'
import { useMenu, useGame } from '../nav.js'

const game = useGame()
const items = [
  { id: 'start', label: 'Start Game' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'settings', label: 'Settings' },
]
function go(i) {
  const id = items[i].id
  game.audio?.unlock?.()
  if (id === 'start') store.screen = 'mode'
  else store.screen = id
}
const { index } = useMenu(() => items.length, { select: go })
const device = computed(() => store.device)
</script>

<template>
  <div class="screen title-screen">
    <div class="logo">
      <div class="sun"></div>
      <h1><span class="w1">COAST</span><span class="w2">2</span><span class="w3">COAST</span></h1>
      <div class="tag">A fan-made tribute to the arcade classic OutRun 2006</div>
    </div>
    <div class="menu">
      <button v-for="(it, i) in items" :key="it.id" class="btn" :class="{ focus: index === i }" @mouseenter="index = i" @click="go(i)">
        <span>{{ it.label }}</span>
      </button>
    </div>
    <div class="footer-hint">
      <template v-if="device === 'touch'">Tap to select · steer with the left pad · GAS / BRAKE on the right · tap BRAKE while steering to drift</template>
      <template v-else-if="device === 'gamepad'">Ⓐ select · LS steer · RT gas · LT brake (tap to drift) · Ⓐ drift · LB/RB shift · Ⓨ camera</template>
      <template v-else>
        <span class="kbd">↑↓←→</span>/<span class="kbd">WASD</span> drive · <span class="kbd">↓</span> tap while steering = drift ·
        <span class="kbd">Shift</span> drift · <span class="kbd">Q</span>/<span class="kbd">E</span> gears · <span class="kbd">C</span> camera · <span class="kbd">Esc</span> pause
      </template>
    </div>
  </div>
</template>

<style scoped>
.title-screen { background: linear-gradient(180deg, rgba(11,16,38,0) 40%, rgba(11,16,38,.7)); justify-content: flex-end; padding-bottom: 90px; gap: 34px; }
.logo { position: absolute; top: 11vh; left: 0; right: 0; text-align: center; }
.sun { position: absolute; left: 50%; top: -30px; width: 190px; height: 190px; transform: translateX(-50%); border-radius: 50%;
  background: linear-gradient(#ffe36a, #ff7a1a 55%, #ff2d6a); opacity: .9; filter: blur(.5px);
  -webkit-mask: repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 18px); mask: repeating-linear-gradient(180deg, #000 0 14px, transparent 14px 18px); }
h1 { position: relative; margin: 0; font-size: clamp(56px, 11vw, 140px); font-weight: 900; font-style: italic; letter-spacing: -.02em; line-height: .95;
  filter: drop-shadow(0 6px 0 #4a0f00) drop-shadow(0 0 30px rgba(255,90,0,.45)); }
h1 span { background: linear-gradient(#ffffff 8%, #ffe14a 42%, #ff6a00 78%, #d4145a); -webkit-background-clip: text; background-clip: text; color: transparent; }
h1 .w2 { font-size: .7em; margin: 0 .12em; background: linear-gradient(#9ff3ff, #22a5ee); -webkit-background-clip: text; background-clip: text; }
.tag { position: relative; margin-top: 10px; font-size: clamp(11px, 1.6vw, 15px); letter-spacing: .3em; font-weight: 800; text-transform: uppercase; opacity: .9; text-shadow: 0 2px 6px rgba(0,0,0,.6); }
.menu { position: relative; z-index: 1; }
</style>
