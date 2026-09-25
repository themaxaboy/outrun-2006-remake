<script setup>
import { store } from '../store.js'
import { useMenu, useGame } from '../nav.js'

const game = useGame()
const modes = [
  { id: 'outrun', name: 'OutRun', desc: 'Beat the clock through 5 of the 15 stages. Pick left or right at every fork, pass checkpoints for extra time and reach one of five goals.', icon: '⏱' },
  { id: 'timeattack', name: 'Time Attack', desc: 'Empty roads, no time limit. Chase your best time to each goal against your ghost.', icon: '👻' },
  { id: 'heart', name: 'Heart Attack', desc: 'Missions from your passenger. Coming in a later update.', icon: '♥', locked: true },
]
function pick(i) {
  const m = modes[i]
  if (m.locked) return
  store.mode = m.id
  store.screen = 'car'
}
const { index } = useMenu(() => modes.length, { select: pick, back: () => (store.screen = 'title') })
</script>

<template>
  <div class="screen dim">
    <h2 class="h-title">Select Mode</h2>
    <div class="cards">
      <button v-for="(m, i) in modes" :key="m.id" class="card" :class="{ focus: index === i, locked: m.locked }" @mouseenter="index = i" @click="pick(i)">
        <div class="icon">{{ m.icon }}</div>
        <div class="name">{{ m.name }}</div>
        <div class="desc">{{ m.desc }}</div>
        <div v-if="m.locked" class="lock">COMING SOON</div>
      </button>
    </div>
    <button class="back" @click="store.screen = 'title'">‹ Back</button>
  </div>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 260px)); gap: 18px; }
.card { position: relative; text-align: left; cursor: pointer; border: 2px solid rgba(255,255,255,.15); border-radius: 16px; padding: 22px 20px 26px; color: #fff; min-height: 230px;
  background: linear-gradient(160deg, rgba(20,40,110,.88), rgba(50,14,70,.85)); transition: transform .15s, border-color .15s, box-shadow .15s; font-family: var(--font-arcade); }
.card.focus, .card:hover { transform: translateY(-6px) scale(1.03); border-color: #ffb300; box-shadow: 0 0 34px rgba(255,140,0,.45); }
.card.locked { opacity: .5; }
.icon { font-size: 38px; }
.name { font-size: 28px; font-weight: 900; font-style: italic; text-transform: uppercase; margin: 8px 0; color: #ffd84a; }
.desc { font-size: 14px; line-height: 1.45; opacity: .9; }
.lock { position: absolute; top: 14px; right: 14px; font-size: 11px; letter-spacing: .15em; font-weight: 900; background: #000a; padding: 4px 8px; border-radius: 4px; }
.back { margin-top: 26px; background: none; border: 0; color: #fff; font: 800 italic 16px var(--font-arcade); opacity: .75; cursor: pointer; }
@media (max-width: 820px) { .cards { grid-template-columns: 1fr; width: min(420px, 92vw); } .card { min-height: 0; } }
</style>
