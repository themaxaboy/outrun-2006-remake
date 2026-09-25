<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { store } from '../store.js'
import { useGame, uiSound } from '../nav.js'
import { bus } from '../../core/events.js'
import { getStage } from '../../track/stages.js'
import { formatTime } from '../../game/timer.js'

const game = useGame()
const r = computed(() => store.lastResult || {})
const qualifies = ref(false)
const letters = ref(['A', 'A', 'A'])
const cursor = ref(0)
const rank = ref(-1)
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .'.split('')

onMounted(() => {
  qualifies.value = game.rankings.qualifies(r.value)
  const last = localStorage.getItem('or2r.lastName')
  if (last && last.length === 3) letters.value = last.split('')
})

function change(d) {
  const i = ABC.indexOf(letters.value[cursor.value])
  letters.value[cursor.value] = ABC[(i + d + ABC.length) % ABC.length]
  uiSound(game, 'uiMove')
}
function submit() {
  const name = letters.value.join('')
  try { localStorage.setItem('or2r.lastName', name) } catch { /* ignore */ }
  rank.value = game.rankings.submit(r.value, name)
  qualifies.value = false
  uiSound(game, 'uiSelect')
}
function next() {
  if (qualifies.value) {
    if (cursor.value < 2) { cursor.value++; uiSound(game, 'uiMove') } else submit()
    return
  }
  store.rankingFocus = { mode: r.value.mode, goal: r.value.goalCol }
  game.quitToTitle()
  store.screen = 'ranking'
}
let off
onMounted(() => {
  off = bus.on('input:frame', (inp) => {
    if (qualifies.value) {
      if (inp.up) change(1)
      if (inp.down) change(-1)
      if (inp.left && cursor.value > 0) cursor.value--
      if (inp.right && cursor.value < 2) cursor.value++
    }
    if (inp.confirm) next()
  })
})
onUnmounted(() => off && off())
const stages = computed(() => (r.value.stages || []).map((id, i) => ({ id, name: getStage(id).name, split: r.value.splits?.[i] })))
</script>

<template>
  <div class="screen dark results">
    <h2 class="h-title">{{ r.goal ? 'Goal ' + 'ABCDE'[r.goalCol] + '!' : 'Game Over' }}</h2>
    <div class="panel sheet">
      <div class="big-row">
        <div v-if="r.mode !== 'timeattack'"><span class="lbl">SCORE</span><b>{{ (r.score || 0).toLocaleString('en-US') }}</b></div>
        <div><span class="lbl">TOTAL TIME</span><b>{{ formatTime(r.totalTime || 0) }}</b></div>
      </div>
      <ol class="route">
        <li v-for="(s, i) in stages" :key="s.id"><span class="no">{{ i + 1 }}</span><span class="nm">{{ s.name }}</span><span class="sp">{{ s.split !== undefined ? formatTime(s.split) : '—' }}</span></li>
      </ol>
      <div class="mini">
        <span>Best drift <b>{{ (r.bestDrift || 0).toLocaleString('en-US') }}</b></span>
        <span>Near misses <b>{{ r.nearMisses || 0 }}</b></span>
        <span>Crashes <b>{{ r.crashes || 0 }}</b></span>
        <span>Distance <b>{{ ((r.distance || 0) / 1000).toFixed(1) }} km</b></span>
      </div>
      <div v-if="qualifies" class="entry">
        <div class="lbl">NEW RECORD — ENTER YOUR INITIALS</div>
        <div class="letters">
          <button v-for="(l, i) in letters" :key="i" class="letter" :class="{ on: cursor === i }" @click="cursor = i; change(1)">{{ l }}</button>
          <button class="ok" @click="submit">OK</button>
        </div>
      </div>
      <div v-else-if="rank >= 0" class="ranked">Ranked #{{ rank + 1 }}!</div>
    </div>
    <button class="btn cont" @click="next"><span>{{ qualifies ? 'Enter ›' : 'Continue ›' }}</span></button>
  </div>
</template>

<style scoped>
.sheet { width: min(560px, 94vw); display: flex; flex-direction: column; gap: 14px; }
.big-row { display: flex; justify-content: space-around; text-align: center; }
.big-row b { display: block; font-size: 34px; font-style: italic; color: #ffd84a; }
.lbl { font-size: 11px; letter-spacing: .2em; font-weight: 900; opacity: .8; }
.route { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.route li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; padding: 6px 10px; background: rgba(0,0,0,.2); border-radius: 6px; font-weight: 800; font-style: italic; }
.route .no { color: #9ff3ff; } .route .sp { font-variant-numeric: tabular-nums; }
.mini { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 13px; opacity: .9; justify-content: center; }
.entry { text-align: center; }
.letters { display: flex; gap: 10px; justify-content: center; margin-top: 8px; }
.letter { width: 54px; height: 64px; font: 900 italic 38px var(--font-arcade); color: #fff; background: rgba(0,0,0,.35); border: 2px solid rgba(255,255,255,.3); border-radius: 8px; cursor: pointer; }
.letter.on { border-color: #ffb300; box-shadow: 0 0 18px rgba(255,160,0,.6); animation: blink .6s infinite alternate; }
@keyframes blink { to { color: #ffd84a } }
.ok { padding: 0 16px; font: 900 18px var(--font-arcade); background: #ff8a00; border: 0; border-radius: 8px; cursor: pointer; }
.ranked { text-align: center; font-size: 22px; font-weight: 900; font-style: italic; color: #7dffb2; }
.cont { width: auto; margin-top: 18px; }
</style>
