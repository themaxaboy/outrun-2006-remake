// Time Attack ghost: records (t, stage index, s, x, yaw offset) at 10 Hz; the best run per goal is
// stored in localStorage. Playback is shown while the player is on the same stage as the ghost.
const KEY = 'or2r.ghost.v1.'
const HZ = 10
const STRIDE = 5

function encode(f32) {
  const u8 = new Uint8Array(f32.buffer)
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s)
}
function decode(b64) {
  const s = atob(b64)
  const u8 = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i)
  return new Float32Array(u8.buffer)
}

export class GhostRecorder {
  constructor() {
    this.data = []
    this.next = 0
  }
  sample(t, stageIdx, s, x, yaw) {
    if (t < this.next) return
    this.next = t + 1 / HZ
    this.data.push(t, stageIdx, s, x, yaw)
  }
  toGhost(meta) {
    return { ...meta, data: new Float32Array(this.data) }
  }
}

export function saveGhost(goalCol, ghost) {
  try {
    const prev = loadGhost(goalCol)
    if (prev && prev.time <= ghost.time) return false
    localStorage.setItem(KEY + goalCol, JSON.stringify({ ...ghost, data: encode(ghost.data) }))
    return true
  } catch { return false }
}

export function loadGhost(goalCol) {
  try {
    const raw = localStorage.getItem(KEY + goalCol)
    if (!raw) return null
    const g = JSON.parse(raw)
    g.data = decode(g.data)
    return g
  } catch { return null }
}

/** Fastest stored ghost across all goals. */
export function bestGhost() {
  let best = null
  for (let c = 0; c < 5; c++) {
    const g = loadGhost(c)
    if (g && (!best || g.time < best.time)) best = g
  }
  return best
}

/** Interpolated ghost state at time t → { stageIdx, s, x, yaw } or null when finished. */
export function ghostAt(ghost, t, out = {}) {
  const d = ghost.data
  const n = d.length / STRIDE
  if (!n) return null
  let i = Math.min(n - 2, Math.max(0, Math.floor(t * HZ)))
  while (i > 0 && d[i * STRIDE] > t) i--
  while (i < n - 2 && d[(i + 1) * STRIDE] < t) i++
  if (t > d[(n - 1) * STRIDE]) return null
  const a = i * STRIDE, b = (i + 1) * STRIDE
  const ta = d[a], tb = d[b]
  const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0
  out.stageIdx = d[a + 1]
  if (d[b + 1] !== d[a + 1]) {
    out.s = d[a + 2]; out.x = d[a + 3]; out.yaw = d[a + 4]
  } else {
    out.s = d[a + 2] + (d[b + 2] - d[a + 2]) * k
    out.x = d[a + 3] + (d[b + 3] - d[a + 3]) * k
    out.yaw = d[a + 4] + (d[b + 4] - d[a + 4]) * k
  }
  return out
}
