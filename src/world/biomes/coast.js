import { hexLin } from '../color.js'
export default {
  id: 'coast',
  label: 'Coast',
  terrain: { kind: 'coast', hillAmp: 34, hillScale: 1 / 380, farLevel: -3, water: 'sea' },
  palette: {
    shoulder: hexLin('#d8c49a'), sand: hexLin('#e6d3a6'), grass: hexLin('#7fa64a'), grass2: hexLin('#a9b85c'),
    rock: hexLin('#9a8a78'), dirt: hexLin('#b49467'), snow: hexLin('#f4f6fa'),
  },
  water: { color: '#1b6f9a', shallow: '#3fc1c9', foam: true },
  barrier: 'guardrail',
  backdrop: { kind: 'islands', color: '#6f8fa8', height: 90 },
  props: [
    { kind: 'palm', side: 'both', d: [5, 16], spacing: 17, jitter: 0.6, scale: [0.85, 1.25], collide: 0.5 },
    { kind: 'palm', side: 'both', d: [22, 70], spacing: 26, jitter: 0.9, scale: [0.8, 1.3], collide: 0 },
    { kind: 'shrub', side: 'both', d: [4, 30], spacing: 11, jitter: 1, scale: [0.7, 1.4], collide: 0 },
    { kind: 'rock', side: 'sea', d: [18, 60], spacing: 34, jitter: 1, scale: [1, 3], collide: 0 },
    { kind: 'villa', side: 'land', d: [45, 160], spacing: 170, jitter: 1, scale: [0.9, 1.3], collide: 0 },
    { kind: 'lamp', side: 'both', d: [2.8, 2.8], spacing: 60, jitter: 0, scale: [1, 1], collide: 0.35, onBarrier: true },
  ],
}
