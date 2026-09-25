import { hexLin } from '../color.js'
export default {
  id: 'lakeside',
  label: 'Lakeside',
  terrain: { kind: 'lake', hillAmp: 42, hillScale: 1 / 300, farLevel: -9, water: 'lake' },
  palette: {
    shoulder: hexLin('#8a8a62'), sand: hexLin('#c9b98f'), grass: hexLin('#4f8a36'), grass2: hexLin('#7aa447'),
    rock: hexLin('#7c7a72'), dirt: hexLin('#7b6446'), snow: hexLin('#f4f6fa'),
  },
  water: { color: '#1f5b6b', shallow: '#4f9a8f', foam: false },
  barrier: 'wood',
  backdrop: { kind: 'mountains', color: '#5f7a8c', height: 260 },
  props: [
    { kind: 'pine', side: 'land', d: [7, 40], spacing: 9, jitter: 1, scale: [0.8, 1.5], collide: 0.45 },
    { kind: 'pine', side: 'land', d: [40, 180], spacing: 11, jitter: 1, scale: [0.9, 1.6], collide: 0 },
    { kind: 'broadleaf', side: 'both', d: [6, 30], spacing: 21, jitter: 1, scale: [0.8, 1.3], collide: 0.5 },
    { kind: 'shrub', side: 'both', d: [4, 20], spacing: 8, jitter: 1, scale: [0.6, 1.2], collide: 0 },
    { kind: 'cabin', side: 'land', d: [40, 120], spacing: 260, jitter: 1, scale: [1, 1.2], collide: 0 },
    { kind: 'sailboat', side: 'lake', d: [70, 300], spacing: 220, jitter: 1, scale: [0.7, 1.0], collide: 0, water: true },
    { kind: 'balloon', side: 'both', d: [80, 360], spacing: 520, jitter: 1, scale: [0.9, 1.3], collide: 0, air: [40, 120] },
    { kind: 'rock', side: 'lake', d: [10, 40], spacing: 45, jitter: 1, scale: [0.8, 2.2], collide: 0 },
  ],
}
