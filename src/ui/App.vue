<script setup>
import { onMounted, onUnmounted } from 'vue'
import './ui.css'
import { store } from './store.js'
import { bus } from '../core/events.js'
import Title from './screens/Title.vue'
import ModeSelect from './screens/ModeSelect.vue'
import CarSelect from './screens/CarSelect.vue'
import MusicSelect from './screens/MusicSelect.vue'
import Pause from './screens/Pause.vue'
import Results from './screens/Results.vue'
import Ranking from './screens/Ranking.vue'
import Settings from './screens/Settings.vue'

const props = defineProps({ game: Object })
const offs = []
let deviceTimer = 0

onMounted(() => {
  const g = props.game
  store.manual = !!g.settings.manual
  offs.push(bus.on('race:paused', () => { store.paused = true }))
  offs.push(bus.on('race:resumed', () => { store.paused = false; store.overlay = null }))
  offs.push(bus.on('race:start', () => { store.paused = false; store.screen = 'race' }))
  offs.push(bus.on('race:quit', () => { store.paused = false }))
  const finish = (r) => { store.lastResult = r; store.paused = false; store.screen = 'results' }
  offs.push(bus.on('race:goal', finish))
  offs.push(bus.on('race:gameover', finish))
  const unlock = () => g.audio?.unlock?.()
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  deviceTimer = setInterval(() => { if (g.input) store.device = g.input.activeDevice }, 500)
})
onUnmounted(() => { offs.forEach((f) => f()); clearInterval(deviceTimer) })
</script>

<template>
  <div v-if="!store.ready" class="loading">
    <div class="load-logo">COAST <b>2</b> COAST</div>
    <div class="bar"><div class="fill" :style="{ transform: `scaleX(${store.loading})` }"></div></div>
    <div class="lbl">{{ store.error ? 'Error: ' + store.error : 'Building ' + store.loadingLabel + '…' }}</div>
  </div>
  <template v-else>
    <Transition name="fade" mode="out-in">
      <Title v-if="store.screen === 'title'" key="title" />
      <ModeSelect v-else-if="store.screen === 'mode'" key="mode" />
      <CarSelect v-else-if="store.screen === 'car'" key="car" />
      <MusicSelect v-else-if="store.screen === 'music'" key="music" />
      <Results v-else-if="store.screen === 'results'" key="results" />
      <Ranking v-else-if="store.screen === 'ranking'" key="ranking" />
      <Settings v-else-if="store.screen === 'settings'" key="settings" />
    </Transition>
    <Pause v-if="store.screen === 'race' && store.paused && !store.overlay" />
    <Settings v-if="store.overlay === 'settings'" />
    <button v-if="store.screen === 'race' && !store.paused && store.device === 'touch'" class="pause-btn" @click="game.pause()" aria-label="Pause">❚❚</button>
  </template>
</template>

<style scoped>
.loading { position: fixed; inset: 0; display: grid; place-content: center; gap: 14px; background: radial-gradient(ellipse at 50% 70%, #3a1450, #0b1026 70%); text-align: center; }
.load-logo { font: 900 italic 44px var(--font-arcade); background: linear-gradient(#fff, #ffd84a 45%, #ff6a00); -webkit-background-clip: text; background-clip: text; color: transparent; }
.load-logo b { background: linear-gradient(#9ff3ff, #22a5ee); -webkit-background-clip: text; background-clip: text; }
.bar { width: 280px; height: 6px; margin: 0 auto; background: rgba(255,255,255,.15); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #ff6a00, #ffd84a); transform-origin: 0 50%; transition: transform .2s; }
.lbl { font-size: 12px; opacity: .7; letter-spacing: .1em; }
.pause-btn { position: fixed; top: max(12px, env(safe-area-inset-top)); right: calc(50% - 150px); width: 44px; height: 44px; border-radius: 50%; border: 2px solid rgba(255,255,255,.5); background: rgba(0,0,0,.35); color: #fff; font-size: 14px; z-index: 11; }
</style>
