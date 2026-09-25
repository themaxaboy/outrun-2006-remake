<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { store } from '../store.js'
import { useMenu, useGame } from '../nav.js'

const game = useGame()
const audio = game.audio
const builtIn = audio?.tracks || []
const user = ref(audio?.userTracks || [])
const fileInput = ref(null)
const entries = computed(() => [
  ...builtIn.map((t) => ({ id: t.id, title: t.title, sub: `${t.style || ''} · ${t.bpm} BPM` })),
  ...user.value.map((t) => ({ id: t.id, title: t.title, sub: 'your track' })),
  { id: '__load', title: 'Load your own…', sub: 'MP3 / OGG / WAV from your device' },
  { id: '__none', title: 'No music', sub: 'engine & road only' },
])
let previewTimer = 0
function preview(i) {
  clearTimeout(previewTimer)
  const e = entries.value[i]
  previewTimer = setTimeout(() => {
    if (!audio) return
    if (e.id.startsWith('__')) audio.stopMusic?.(0.4)
    else audio.playMusic?.(e.id)
  }, 250)
}
async function onFiles(ev) {
  const files = ev.target.files
  if (!files?.length || !audio?.loadUserFiles) return
  await audio.unlock?.()
  user.value = await audio.loadUserFiles(files)
  user.value = audio.userTracks || user.value
}
function pick(i) {
  const e = entries.value[i]
  if (e.id === '__load') { fileInput.value?.click(); return }
  store.music = e.id === '__none' ? null : e.id
  store.screen = 'race'
  game.startRace({ mode: store.mode, carId: store.carId, color: store.color, finish: store.finish, manual: store.manual, music: store.music })
}
const { index } = useMenu(() => entries.value.length, { select: pick, back: () => (store.screen = 'car') })
watch(index, preview)
onMounted(async () => { await audio?.unlock?.(); preview(index.value) })
onUnmounted(() => clearTimeout(previewTimer))
</script>

<template>
  <div class="screen dim">
    <h2 class="h-title">Select Music</h2>
    <div class="h-sub">Magical sounds for the open road — all original</div>
    <div class="radio panel">
      <div class="dial"><span v-for="n in 24" :key="n" /></div>
      <button v-for="(e, i) in entries" :key="e.id" class="track" :class="{ focus: index === i }" @mouseenter="index = i" @click="pick(i)">
        <span class="no">{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="t"><b>{{ e.title }}</b><small>{{ e.sub }}</small></span>
        <span v-if="index === i && !e.id.startsWith('__')" class="eq"><i /><i /><i /><i /></span>
      </button>
    </div>
    <input ref="fileInput" type="file" accept="audio/*" multiple hidden @change="onFiles" />
    <div class="footer-hint">Highlight to preview · select to start</div>
  </div>
</template>

<style scoped>
.radio { width: min(560px, 94vw); display: flex; flex-direction: column; gap: 6px; }
.dial { display: flex; justify-content: space-between; margin-bottom: 8px; opacity: .5; }
.dial span { width: 2px; height: 10px; background: #fff; }
.dial span:nth-child(4n) { height: 16px; background: #ffd84a; }
.track { display: flex; align-items: center; gap: 14px; padding: 10px 14px; border-radius: 10px; border: 1px solid transparent; background: rgba(0,0,0,.18); color: #fff; cursor: pointer; text-align: left; font-family: var(--font-arcade); }
.track.focus, .track:hover { border-color: #ffb300; background: linear-gradient(90deg, rgba(255,106,0,.55), rgba(255,179,0,.2)); }
.no { font: 900 italic 22px var(--font-arcade); color: #9ff3ff; width: 34px; }
.t { display: flex; flex-direction: column; flex: 1; } .t b { font-size: 18px; font-style: italic; } .t small { opacity: .75; font-size: 12px; }
.eq { display: flex; gap: 3px; align-items: flex-end; height: 18px; }
.eq i { width: 4px; background: #ffd84a; animation: eq .6s infinite alternate; }
.eq i:nth-child(2) { animation-delay: .15s } .eq i:nth-child(3) { animation-delay: .3s } .eq i:nth-child(4) { animation-delay: .45s }
@keyframes eq { from { height: 4px } to { height: 18px } }
</style>
