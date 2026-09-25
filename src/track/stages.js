// The 15-stage pyramid (5 rows). Row r has r+1 stages; column 0 is the "easy" left edge,
// column r the "hard" right edge — like the original, left forks are gentler.
// All names are original to this remake.

export const START_TIME = 85 // seconds on the clock at the start line

/** time-of-day presets are defined in world/timeOfDay.js; weather: clear | rain | snow | mist */
export const STAGES = [
  { id: '0-0', name: 'Palm Shore', biome: 'coast', tod: 'morning', weather: 'clear', length: 5200, traffic: 6 },

  { id: '1-0', name: 'Mirror Lake', biome: 'lakeside', tod: 'lateMorning', weather: 'clear', length: 5400, traffic: 7 },
  { id: '1-1', name: 'Red Rock Pass', biome: 'canyon', tod: 'noon', weather: 'clear', length: 5400, traffic: 8 },

  { id: '2-0', name: 'Summit Road', biome: 'alpine', tod: 'noon', weather: 'clear', length: 5600, traffic: 8 },
  { id: '2-1', name: 'Lantern Gate', biome: 'temple', tod: 'afternoon', weather: 'clear', length: 5600, traffic: 9 },
  { id: '2-2', name: 'Neon Harbor', biome: 'metropolis', tod: 'dusk', weather: 'clear', length: 5600, traffic: 11 },

  { id: '3-0', name: 'Cliffside Run', biome: 'coast', tod: 'afternoon', weather: 'clear', length: 5900, traffic: 9 },
  { id: '3-1', name: 'Golden Pines', biome: 'lakeside', tod: 'golden', weather: 'clear', length: 5900, traffic: 10 },
  { id: '3-2', name: 'Mesa Sunset', biome: 'canyon', tod: 'sunset', weather: 'clear', length: 5900, traffic: 11 },
  { id: '3-3', name: 'Snowline', biome: 'alpine', tod: 'overcast', weather: 'snow', length: 5900, traffic: 12 },

  { id: '4-0', name: 'Temple Lights', biome: 'temple', tod: 'night', weather: 'clear', length: 6200, traffic: 10 },
  { id: '4-1', name: 'Rain City', biome: 'metropolis', tod: 'night', weather: 'rain', length: 6200, traffic: 13 },
  { id: '4-2', name: 'Sunset Bay', biome: 'coast', tod: 'sunset', weather: 'clear', length: 6200, traffic: 12 },
  { id: '4-3', name: 'Misty Lakes', biome: 'lakeside', tod: 'twilight', weather: 'mist', length: 6200, traffic: 14 },
  { id: '4-4', name: 'Starlight Canyon', biome: 'canyon', tod: 'starlight', weather: 'clear', length: 6200, traffic: 15 },
]

const byId = new Map(STAGES.map((s) => [s.id, s]))

export function getStage(id) {
  const s = byId.get(id)
  if (!s) throw new Error(`unknown stage ${id}`)
  return s
}

export function stageRowCol(id) {
  const [r, c] = id.split('-').map(Number)
  return { row: r, col: c }
}

/** Seconds added at the checkpoint that starts this stage (row 0 uses START_TIME instead). */
export function stageExtension(stage) {
  const { row, col } = stageRowCol(stage.id)
  // Harder (right-hand) routes are longer & twistier, so they give slightly more time.
  return Math.round(stage.length / 66 + col * 1.5 + row * 0.5)
}
