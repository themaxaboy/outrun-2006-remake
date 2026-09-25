<script setup>
import { computed, ref } from 'vue'
import { store } from '../store.js'
import { useMenu, useGame } from '../nav.js'
import { formatTime } from '../../game/timer.js'
import { getCar } from '../../vehicle/carDefs.js'

const game = useGame()
const modes = [{ id: 'outrun', label: 'OutRun' }, { id: 'timeattack', label: 'Time Attack' }]
const mode = ref(store.rankingFocus?.mode === 'timeattack' ? 1 : 0)
const goal = ref(store.rankingFocus?.goal ?? 0)
const rows = computed(() => game.rankings.getTable(modes[mode.value].id, goal.value))
useMenu(() => 2, {
  left: () => (goal.value = (goal.value + 4) % 5),
  right: () => (goal.value = (goal.value + 1) % 5),
  select: () => (mode.value = 1 - mode.value),
  back: () => (store.screen = 'title'),
})
</script>

<template>
  <div class="screen dark">
    <h2 class="h-title">Ranking</h2>
    <div class="tabs">
      <button v-for="(m, i) in modes" :key="m.id" class="tab" :class="{ on: mode === i }" @click="mode = i">{{ m.label }}</button>
    </div>
    <div class="tabs goals">
      <button v-for="g in 5" :key="g" class="tab" :class="{ on: goal === g - 1 }" @click="goal = g - 1">GOAL {{ 'ABCDE'[g - 1] }}</button>
    </div>
    <div class="panel table">
      <div v-if="!rows.length" class="empty">No records yet — be the first!</div>
      <div v-for="(e, i) in rows" :key="i" class="entry" :class="{ top: i === 0 }">
        <span class="pos">{{ i + 1 }}</span>
        <span class="nm">{{ e.name }}</span>
        <span class="val">{{ mode === 1 ? formatTime(e.time) : e.score.toLocaleString('en-US') }}</span>
        <span class="car">{{ getCar(e.car).name }}</span>
        <span class="route">{{ e.route }}</span>
      </div>
    </div>
    <button class="btn back" @click="store.screen = 'title'"><span>‹ Back</span></button>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; justify-content: center; }
.tab { padding: 7px 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,.3); background: rgba(0,0,0,.3); color: #fff; font: 900 italic 14px var(--font-arcade); cursor: pointer; }
.tab.on { background: #ff8a00; color: #1b0b00; border-color: #ffd84a; }
.table { width: min(640px, 94vw); min-height: 200px; display: flex; flex-direction: column; gap: 4px; }
.entry { display: grid; grid-template-columns: 34px 60px 1fr 1fr 70px; gap: 10px; padding: 6px 10px; border-radius: 6px; background: rgba(0,0,0,.2); font-weight: 800; font-style: italic; align-items: center; }
.entry.top { background: linear-gradient(90deg, rgba(255,179,0,.4), rgba(0,0,0,.2)); }
.pos { color: #9ff3ff; font-size: 18px; } .val { font-variant-numeric: tabular-nums; color: #ffd84a; } .car, .route { font-size: 12px; opacity: .8; }
.empty { text-align: center; opacity: .7; padding: 40px 0; }
.back { width: auto; margin-top: 16px; }
</style>
