import { hexLin } from '../color.js'
export default {
  id: 'temple',
  label: 'Old Capital',
  terrain: { kind: 'temple', hillAmp: 48, hillScale: 1 / 320, farLevel: -8, water: null },
  palette: {
    shoulder: hexLin('#8f8a6a'), sand: hexLin('#b7a883'), grass: hexLin('#4d7d3a'), grass2: hexLin('#7a9b45'),
    rock: hexLin('#7e776d'), dirt: hexLin('#7f6247'), snow: hexLin('#f4f6fa'),
  },
  water: null,
  barrier: 'stone',
  backdrop: { kind: 'mountains', color: '#6c7d86', height: 230 },
  props: [
    { kind: 'blossom', side: 'both', d: [6, 26], spacing: 14, jitter: 1, scale: [0.8, 1.25], collide: 0.5 },
    { kind: 'maple', side: 'both', d: [8, 60], spacing: 15, jitter: 1, scale: [0.8, 1.3], collide: 0.5 },
    { kind: 'lantern', side: 'both', d: [3.6, 3.6], spacing: 36, jitter: 0, scale: [1, 1], collide: 0.35 },
    { kind: 'pagoda', side: 'both', d: [45, 140], spacing: 420, jitter: 1, scale: [1, 1.4], collide: 0 },
    { kind: 'torii', side: 'span', d: [0, 0], spacing: 900, jitter: 0, scale: [1, 1], collide: 0 },
    { kind: 'bamboo', side: 'both', d: [5, 22], spacing: 7, jitter: 1, scale: [0.8, 1.3], collide: 0 },
  ],
}
