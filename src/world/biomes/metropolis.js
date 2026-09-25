import { hexLin } from '../color.js'
export default {
  id: 'metropolis',
  label: 'Metropolis',
  terrain: { kind: 'city', hillAmp: 0, hillScale: 1 / 400, farLevel: -2, water: null },
  palette: {
    shoulder: hexLin('#5d5f63'), sand: hexLin('#77787a'), grass: hexLin('#4d6a3a'), grass2: hexLin('#667a44'),
    rock: hexLin('#6b6d70'), dirt: hexLin('#55565a'), snow: hexLin('#f4f6fa'), pavement: hexLin('#6a6c70'),
  },
  water: null,
  barrier: 'concrete',
  backdrop: { kind: 'skyline', color: '#3c4a63', height: 260 },
  props: [
    { kind: 'tower', side: 'both', d: [34, 120], spacing: 38, jitter: 1, scale: [0.8, 1.8], collide: 0 },
    { kind: 'tower', side: 'both', d: [120, 300], spacing: 55, jitter: 1, scale: [1, 2.4], collide: 0 },
    { kind: 'streetlight', side: 'both', d: [2.8, 2.8], spacing: 34, jitter: 0, scale: [1, 1], collide: 0.3, onBarrier: true },
    { kind: 'palm', side: 'both', d: [8, 14], spacing: 30, jitter: 0.5, scale: [0.9, 1.1], collide: 0.5 },
    { kind: 'billboard', side: 'both', d: [14, 24], spacing: 240, jitter: 1, scale: [1, 1.2], collide: 0 },
  ],
}
