import { hexLin } from '../color.js'
export default {
  id: 'alpine',
  label: 'Alpine',
  terrain: { kind: 'alpine', hillAmp: 210, hillScale: 1 / 330, farLevel: -30, water: null },
  palette: {
    shoulder: hexLin('#7d8a5a'), sand: hexLin('#a39a82'), grass: hexLin('#5a8a3a'), grass2: hexLin('#8aac4f'),
    rock: hexLin('#7b7872'), dirt: hexLin('#6f5d44'), snow: hexLin('#f2f5fa'),
  },
  water: null,
  barrier: 'guardrail',
  backdrop: { kind: 'peaks', color: '#8ea3bf', height: 420, snowcaps: true },
  props: [
    { kind: 'pine', side: 'both', d: [6, 60], spacing: 7, jitter: 1, scale: [0.8, 1.7], collide: 0.45 },
    { kind: 'pine', side: 'both', d: [60, 260], spacing: 10, jitter: 1, scale: [1, 1.9], collide: 0 },
    { kind: 'rock', side: 'both', d: [6, 60], spacing: 30, jitter: 1, scale: [0.8, 2.6], collide: 0.9 },
    { kind: 'chalet', side: 'both', d: [40, 110], spacing: 320, jitter: 1, scale: [1, 1.2], collide: 0 },
  ],
}
