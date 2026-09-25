<script setup>
import { store } from './store.js'
const props = defineProps({ game: Object })
function start() {
  store.screen = 'race'
  props.game.startRace({ mode: 'outrun', carId: 'aurora' })
}
</script>

<template>
  <div v-if="!store.ready" class="loading">
    <div class="bar"><div class="fill" :style="{ transform: `scaleX(${store.loading})` }"></div></div>
    <div class="lbl">{{ store.error || 'Loading ' + store.loadingLabel + '…' }}</div>
  </div>
  <div v-else-if="store.screen === 'title'" class="title" @click="start">
    <h1>COAST <span>TO</span> COAST</h1>
    <p>Press to start</p>
  </div>
</template>

<style scoped>
.loading { position: fixed; inset: 0; display: grid; place-content: center; gap: 12px; background: #0b1026; }
.bar { width: 280px; height: 6px; background: rgba(255,255,255,.15); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, #ff6a00, #ffd84a); transform-origin: 0 50%; }
.lbl { text-align: center; font-size: 12px; opacity: .7; }
.title { position: fixed; inset: 0; display: grid; place-content: center; text-align: center; cursor: pointer; }
h1 { font-size: 64px; font-style: italic; font-weight: 900; margin: 0; }
</style>
