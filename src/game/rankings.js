// Local high-score tables (top 10 per mode and goal) in localStorage.
const KEY = 'or2r.rank.v1'
const UNLOCK = 'or2r.unlock.v1'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

export function tableKey(mode, goalCol) {
  return `${mode}.${goalCol === null || goalCol === undefined ? 'X' : 'ABCDE'[goalCol]}`
}

/** Entries sorted: OutRun by score desc, Time Attack by time asc. */
export function getTable(mode, goalCol) {
  return (load()[tableKey(mode, goalCol)] || []).slice(0, 10)
}

export function qualifies(result) {
  if (result.mode === 'timeattack' && !result.goal) return false
  const t = getTable(result.mode, result.goalCol)
  if (t.length < 10) return true
  const last = t[t.length - 1]
  return result.mode === 'timeattack' ? result.totalTime < last.time : result.score > last.score
}

export function submit(result, name) {
  const data = load()
  const k = tableKey(result.mode, result.goalCol)
  const t = data[k] || []
  const entry = {
    name: (name || 'AAA').toUpperCase().slice(0, 3),
    score: result.score,
    time: result.totalTime,
    route: result.route,
    car: result.car,
    date: Date.now(),
  }
  t.push(entry)
  t.sort((a, b) => (result.mode === 'timeattack' ? a.time - b.time : b.score - a.score))
  data[k] = t.slice(0, 10)
  save(data)
  const rank = data[k].indexOf(entry)
  return rank
}

export function unlocks() {
  try { return JSON.parse(localStorage.getItem(UNLOCK)) || {} } catch { return {} }
}
export function unlock(key) {
  const u = unlocks()
  u[key] = true
  try { localStorage.setItem(UNLOCK, JSON.stringify(u)) } catch { /* ignore */ }
}
