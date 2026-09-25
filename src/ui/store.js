// Menu-level reactive state only (never per-frame race data).
import { reactive } from 'vue'

export const store = reactive({
  ready: false,
  loading: 0,
  loadingLabel: '',
  error: null,
  screen: 'title', // title | mode | car | music | race | results | ranking | settings
  overlay: null, // 'settings' while paused
  paused: false,
  device: 'keyboard',
  mode: 'outrun',
  carId: 'aurora',
  color: null,
  finish: 'metallic',
  manual: false,
  music: null,
  lastResult: null,
  rankingFocus: null,
})
