import { hexLin } from '../color.js'
export default {
  id: 'canyon',
  label: 'Canyon',
  terrain: { kind: 'canyon', hillAmp: 95, hillScale: 1 / 260, farLevel: -4, water: null },
  palette: {
    shoulder: hexLin('#c2894f'), sand: hexLin('#d69a5c'), grass: hexLin('#9b8a4a'), grass2: hexLin('#b9a15a'),
    rock: hexLin('#b0562e'), dirt: hexLin('#c7743f'), snow: hexLin('#f4f6fa'), band: hexLin('#8c3f22'),
  },
  water: null,
  barrier: 'guardrail',
  backdrop: { kind: 'mesas', color: '#b0643a', height: 170 },
  props: [
    { kind: 'cactus', side: 'both', d: [6, 40], spacing: 23, jitter: 1, scale: [0.7, 1.4], collide: 0.4 },
    { kind: 'rock', side: 'both', d: [8, 70], spacing: 19, jitter: 1, scale: [0.8, 3.5], collide: 0.9 },
    { kind: 'deadtree', side: 'both', d: [8, 50], spacing: 60, jitter: 1, scale: [0.8, 1.3], collide: 0.3 },
    { kind: 'shrub', side: 'both', d: [4, 40], spacing: 12, jitter: 1, scale: [0.4, 0.9], collide: 0, tint: 'dry' },
    { kind: 'balloon', side: 'both', d: [90, 380], spacing: 360, jitter: 1, scale: [1, 1.4], collide: 0, air: [60, 170] },
    { kind: 'sign', side: 'both', d: [6, 6], spacing: 420, jitter: 0, scale: [1, 1], collide: 0.4 },
  ],
}
