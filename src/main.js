import { createApp, markRaw } from 'vue'
import './style.css'
import App from './ui/App.vue'
import { Game } from './game/Game.js'
import { store } from './ui/store.js'
import { params } from './core/params.js'

async function boot() {
  const canvas = document.getElementById('gl')
  const ui = document.getElementById('ui')
  const game = markRaw(new Game(canvas, ui))
  const app = createApp(App, { game })
  app.provide('game', game)
  app.mount('#app')
  try {
    await game.init((p, label) => { store.loading = p; store.loadingLabel = label })
    store.ready = true
    if (params.race) {
      store.screen = 'race'
      await game.startRace({ mode: params.mode, carId: params.car || 'aurora' })
    }
  } catch (e) {
    console.error(e)
    store.error = String(e?.message || e)
  }
}

boot()
