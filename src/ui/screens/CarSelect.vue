<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { store } from '../store.js'
import { useMenu, useGame, uiSound } from '../nav.js'
import { CARS } from '../../vehicle/carDefs.js'

const game = useGame()
const unlocked = ref(game.rankings.unlocks())
const carIndex = ref(Math.max(0, CARS.findIndex((c) => c.id === store.carId)))
const car = computed(() => CARS[carIndex.value])
const locked = computed(() => car.value.unlock && !unlocked.value.nebula)
const colorIndex = ref(0)
const finishes = ['metallic', 'pearl', 'matte', 'solid']
const finishIndex = ref(Math.max(0, finishes.indexOf(store.finish)))
const manual = ref(store.manual)
const loading = ref(false)

async function apply() {
  loading.value = true
  await game.setShowroomCar(car.value.id, car.value.colors[colorIndex.value], finishes[finishIndex.value])
  loading.value = false
}

function cycle(row, d) {
  if (row === 0) { carIndex.value = (carIndex.value + d + CARS.length) % CARS.length; colorIndex.value = 0 }
  else if (row === 1) colorIndex.value = (colorIndex.value + d + 6) % car.value.colors.length
  else if (row === 2) finishIndex.value = (finishIndex.value + d + finishes.length) % finishes.length
  else if (row === 3) manual.value = !manual.value
  else return
  uiSound(game, 'uiMove')
}

function confirm() {
  if (locked.value) { uiSound(game, 'uiBack'); return }
  store.carId = car.value.id
  store.color = car.value.colors[colorIndex.value]
  store.finish = finishes[finishIndex.value]
  store.manual = manual.value
  game.saveSettings({ manual: manual.value })
  store.screen = 'music'
}

const { index } = useMenu(() => 5, {
  select: (i) => (i === 4 ? confirm() : cycle(i, 1)),
  left: (i) => cycle(i, -1),
  right: (i) => cycle(i, 1),
  back: () => (store.screen = 'mode'),
}, { initial: 0, wrap: false })

watch([carIndex, colorIndex, finishIndex], apply)
onMounted(async () => {
  await game.enterShowroom(car.value.id, car.value.colors[colorIndex.value], finishes[finishIndex.value])
})
onUnmounted(() => game.exitShowroom())
const statKeys = ['speed', 'accel', 'handling', 'drift']
</script>

<template>
  <div class="screen car-screen">
    <h2 class="h-title top">Select Car</h2>
    <div class="nav-arrows">
      <button class="arrow" @click="cycle(0, -1)">‹</button>
      <button class="arrow" @click="cycle(0, 1)">›</button>
    </div>
    <div class="panel info">
      <div class="row head" :class="{ focus: index === 0 }" @mouseenter="index = 0">
        <div>
          <div class="name">{{ car.name }}</div>
          <div class="blurb">{{ car.blurb }}</div>
        </div>
        <div class="top-speed"><b>{{ Math.round(car.vmax * 3.6) }}</b> km/h</div>
      </div>
      <div class="stats">
        <div v-for="k in statKeys" :key="k" class="stat"><span>{{ k.toUpperCase() }}</span><div class="bar"><i :style="{ width: car.stats[k] * 20 + '%' }"></i></div></div>
      </div>
      <div class="opt" :class="{ focus: index === 1 }" @mouseenter="index = 1">
        <span class="lbl">COLOUR</span>
        <div class="swatches">
          <button v-for="(c, i) in car.colors" :key="c" class="sw" :class="{ on: i === colorIndex }" :style="{ background: c }" @click="colorIndex = i" :aria-label="'colour ' + (i + 1)"></button>
        </div>
      </div>
      <div class="opt" :class="{ focus: index === 2 }" @mouseenter="index = 2">
        <span class="lbl">FINISH</span>
        <div class="chips"><button v-for="(f, i) in finishes" :key="f" class="chip" :class="{ on: i === finishIndex }" @click="finishIndex = i">{{ f }}</button></div>
      </div>
      <div class="opt" :class="{ focus: index === 3 }" @mouseenter="index = 3">
        <span class="lbl">GEARBOX</span>
        <div class="chips">
          <button class="chip" :class="{ on: !manual }" @click="manual = false">Auto</button>
          <button class="chip" :class="{ on: manual }" @click="manual = true">Manual</button>
        </div>
      </div>
      <button class="btn go" :class="{ focus: index === 4, locked }" @mouseenter="index = 4" @click="confirm">
        <span>{{ locked ? '🔒 Reach any goal to unlock' : 'Choose ›' }}</span>
      </button>
    </div>
    <div v-if="loading" class="loading-car">building car…</div>
  </div>
</template>

<style scoped>
.car-screen { justify-content: flex-end; background: linear-gradient(180deg, transparent 55%, rgba(11,16,38,.6)); }
.top { position: absolute; top: 16px; left: 24px; font-size: clamp(26px, 4vw, 44px); }
.nav-arrows { position: absolute; top: 42%; left: 0; right: 0; display: flex; justify-content: space-between; padding: 0 3vw; pointer-events: none; }
.arrow { pointer-events: auto; width: 56px; height: 56px; border-radius: 50%; border: 2px solid rgba(255,255,255,.5); background: rgba(0,0,0,.3); color: #fff; font-size: 34px; line-height: 0; cursor: pointer; }
.info { width: min(620px, 94vw); display: flex; flex-direction: column; gap: 12px; }
.head { justify-content: space-between; align-items: flex-start; padding: 4px 8px; border-radius: 8px; border: 1px solid transparent; }
.name { font-size: 30px; font-weight: 900; font-style: italic; color: #ffd84a; }
.blurb { font-size: 13px; opacity: .85; max-width: 420px; }
.top-speed { font-size: 13px; opacity: .8; white-space: nowrap; } .top-speed b { font-size: 26px; font-style: italic; }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; padding: 0 8px; }
.opt { display: flex; align-items: center; gap: 14px; padding: 6px 8px; border-radius: 8px; border: 1px solid transparent; }
.focus.opt, .focus.head { border-color: rgba(255,179,0,.7); background: rgba(255,140,0,.12); }
.lbl { width: 76px; font-size: 12px; font-weight: 900; letter-spacing: .15em; opacity: .85; }
.swatches { display: flex; gap: 8px; }
.sw { width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); cursor: pointer; }
.sw.on { border-color: #fff; box-shadow: 0 0 0 3px #ff8a00; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { padding: 5px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,.35); background: rgba(0,0,0,.25); color: #fff; font: 800 12px var(--font-arcade); text-transform: uppercase; letter-spacing: .08em; cursor: pointer; }
.chip.on { background: #ff8a00; border-color: #ffd84a; color: #1b0b00; }
.go { text-align: center; }
.loading-car { position: absolute; top: 45%; left: 0; right: 0; text-align: center; opacity: .7; letter-spacing: .2em; font-size: 12px; }
</style>
