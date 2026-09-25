// Per-car design data (original designs). Each design is a function of the car definition
// (halfLength L, halfWidth W, wheelbase) so the body always matches the physics dims.
// Coordinates: metres, y up from the road, front toward -Z, origin between the axles.
import { band, smoothstep } from './curves.js'
import { extrudeX } from './parts.js'

// shader panel gaps: plane cuts through the body shell (see materials.enablePanelLines)
const zCut = (z, ax, ay, w = 0.0045) => ({ axis: 'z', at: z, a: ax, b: ay, w })
const yCut = (y, ax, az, w = 0.0045) => ({ axis: 'y', at: y, a: ax, b: az, w })
const xCut = (x, ay, az, w = 0.0045) => ({ axis: 'x', at: x, a: ay, b: az, w })
/** door outline (front cut, rear cut, sill) + a lid outline (front, rear, sides) */
function door(z0, z1, ySill, yTop, xIn = 0.6) {
  return [zCut(z0, [xIn, 1.2], [ySill, yTop]), zCut(z1, [xIn, 1.2], [ySill, yTop]), yCut(ySill, [xIn, 1.2], [z0, z1])]
}
function lid(z0, z1, halfW, yMin) {
  return [zCut(z0, [0, halfW], [yMin, 2]), zCut(z1, [0, halfW], [yMin, 2]), xCut(halfW, [yMin, 2], [z0, z1])]
}

function aurora(def) {
  const L = def.halfLength, WB = def.wheelbase
  const fa = -WB / 2, ra = WB / 2
  const R = 0.34
  // headlight frame: looking slightly down/in at the nose corner
  const HL = { d: [-0.3, -0.5, 1], o: [0.6, 0.53, -2.02] }
  return {
    id: 'aurora',
    wheelbase: WB,
    halfWidth: def.halfWidth,
    panels: [...door(-0.86, 0.2, 0.2, 0.86), ...lid(-2.06, -1.14, 0.5, 0.4), ...lid(1.66, 2.16, 0.48, 0.75)],
    wheels: {
      radius: R, width: 0.245, rearWidthScale: 1.22, rimRadius: 0.255, archR: [R + 0.038, R + 0.04], archLift: 0.012,
      inset: 0.022, style: 'twin5', rimColor: '#2e3136', lipColor: '#c7cacf', caliperColor: '#f2b705',
    },
    body: {
      zNose: -L, zTail: L,
      nose: { len: 0.15, m: 3.4, yc: 0.68 },
      tail: { len: 0.06, m: 4, yc: 0.55 },
      W: [[-L, 0.74], [-L + 0.18, 0.865], [-L + 0.45, 0.935], [fa - 0.1, 0.968], [fa, 0.972], [-1.0, 0.952], [-0.55, 0.918], [0.05, 0.918], [0.55, 0.952], [1.0, 0.98], [ra, 0.985], [1.8, 0.976], [L, 0.94]],
      top: [[-L, 0.43], [-L + 0.12, 0.49], [-L + 0.42, 0.565], [fa, 0.67], [-1.05, 0.75], [-0.6, 0.785], [0.0, 0.795], [0.6, 0.825], [1.1, 0.87], [1.6, 0.9], [2.05, 0.918], [L, 0.93]],
      mid: [[-L, 0.3], [-L + 0.4, 0.45], [fa, 0.56], [-0.5, 0.55], [0.5, 0.56], [ra, 0.6], [L, 0.6]],
      bot: [[-L, 0.15], [-L + 0.16, 0.1], [L - 0.7, 0.1], [L - 0.35, 0.17], [L - 0.08, 0.28], [L, 0.3]],
      nUp: [[-L, 3.0], [fa, 4.6], [-0.6, 4.2], [0.3, 4.2], [ra, 4.8], [L, 5.4]],
      nDn: [[-L, 3.0], [-L + 0.6, 5], [L - 0.6, 5], [L, 4.0]],
      tumble: [[-L, 0.03], [fa, 0.07], [0, 0.1], [ra, 0.08], [L, 0.06]],
      tuck: [[-L, 0.02], [0, 0.06], [L, 0.04]],
      crown: [[-L + 0.05, 0.01], [-L + 0.4, 0.08], [fa, 0.15], [-0.9, 0.09], [-0.55, 0.0], [0.4, 0.0], [0.9, 0.07], [ra, 0.11], [1.9, 0.07], [L, 0.03]],
      crownAt: 0.8,
      crownW: 0.18,
      scoops: [{ z0: 0.22, z1: 0.92, y0: 0.4, y1: 0.7, depth: 0.08, slant: 0.5, ez: 0.12, ey: 0.06, ramp: true }],
    },
    cabin: {
      z0: -1.08, zRoofF: -0.2, zRoofR: 0.38, zC: 0.6, z1: 1.62,
      roof: [[-1.08, 0.75], [-0.7, 0.95], [-0.2, 1.09], [0.1, 1.105], [0.38, 1.09], [0.85, 1.02], [1.25, 0.96], [1.62, 0.9]],
      W: [[-1.08, 0.79], [-0.6, 0.77], [0.0, 0.74], [0.5, 0.71], [1.0, 0.62], [1.62, 0.46]],
      tumble: [[-1.08, 0.1], [-0.5, 0.28], [0.4, 0.3], [1.0, 0.22], [1.62, 0.12]],
      n: [[-1.08, 2.3], [0, 3.0], [1.62, 2.6]],
      tc: 0.3, pillar: 0.05,
      roofMat: 'paint', pillarMat: 'paint', cPillarMat: 'paint', rearMat: 'glass',
    },
    parts: {
      splitter: { y: 0.075, thick: 0.016, off: 0.018, inset: 0.95 },
      skirts: { y: 0.1, h: 0.11, out: 0.035 },
      diffuser: { z0: L - 0.62, halfW: 0.62, yLow: 0.1, fins: 5 },
      mirrors: { z: -0.7, y: 0.88, x: 1.02, len: 0.2, h: 0.075, d: 0.12, stalkX: 0.84, stalkY: 0.8 },
      lip: { z: L - 0.1, span: 0.82, h: 0.035, len: 0.13 },
      exhausts: { pts: [[0.15, 0.37]], r: 0.052 },
    },
    decals: [
      // headlights: slim slanted units on the nose corners
      { frame: HL, shape: ['rquad', [[-0.24, -0.05], [0.2, -0.095], [0.24, 0.035], [-0.23, 0.05]], 5], g: 'glass', gap: 0.003, extrude: 0.006, mirror: true },
      { frame: HL, shape: ['strip', [[-0.22, 0.032], [0.0, 0.02], [0.215, 0.004], [0.2, -0.05]], 0.008], g: 'head', gap: 0.007, mirror: true },
      { frame: HL, shape: ['ellipse', 0.085, -0.035, 0.03, 0.03], g: 'chrome', gap: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', 0.085, -0.035, 0.02, 0.02], g: 'head', gap: 0.009, mirror: true },
      { frame: HL, shape: ['ellipse', -0.03, -0.022, 0.027, 0.027], g: 'chrome', gap: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', -0.03, -0.022, 0.018, 0.018], g: 'head', gap: 0.009, mirror: true },
      // front: central intake + big side intakes
      { frame: 'front', shape: ['rquad', [[-0.52, 0.15], [0.52, 0.15], [0.4, 0.31], [-0.4, 0.31]], 6], g: 'trim', gap: 0.004 },
      { frame: 'front', shape: ['rquad', [[0.54, 0.16], [0.82, 0.17], [0.78, 0.43], [0.58, 0.34]], 5], g: 'trim', gap: 0.004, mirror: true },
      ...[0.19, 0.23, 0.27].map((y) => ({ frame: 'front', shape: ['strip', [[-0.44, y], [0.44, y]], 0.007], g: 'glass', gap: 0.008, minDetail: 1 })),
      ...[0.22, 0.29].map((y) => ({ frame: 'front', shape: ['strip', [[0.6, y + 0.01], [0.78, y]], 0.006], g: 'glass', gap: 0.008, mirror: true, minDetail: 1 })),
      // hood vents
      { frame: 'top', shape: ['rquad', [[0.16, -1.8], [0.48, -1.76], [0.46, -1.62], [0.18, -1.66]], 5], g: 'trim', gap: 0.003, mirror: true },
      // side scoop
      { frame: 'side', shape: ['rquad', [[0.42, 0.44], [0.9, 0.47], [0.84, 0.66], [0.55, 0.68]], 5], g: 'trim', gap: 0.002, mirror: true },
      // rear: taillight bar in a smoked housing, black upper fascia with slats, black lower
      { frame: 'rear', shape: ['strip', [[-0.9, 0.84], [0, 0.84], [0.9, 0.84]], 0.036], g: 'trim', gap: 0.003, extrude: 0.005 },
      { frame: 'rear', shape: ['strip', [[-0.88, 0.845], [0, 0.845], [0.88, 0.845]], 0.024], g: 'tail', gap: 0.007 },
      { frame: 'rear', shape: ['strip', [[0.66, 0.812], [0.84, 0.812], [0.87, 0.78]], 0.009], g: 'tail', gap: 0.008, mirror: true },
      { frame: 'rear', shape: ['rquad', [[-0.66, 0.52], [0.66, 0.52], [0.7, 0.78], [-0.7, 0.78]], 8], g: 'trim', gap: 0.003 },
      ...[0.575, 0.63, 0.685].map((y) => ({ frame: 'rear', shape: ['strip', [[-0.6, y], [0.6, y]], 0.008], g: 'glass', gap: 0.007, minDetail: 1 })),
      { frame: 'rear', shape: ['rquad', [[-0.76, 0.32], [0.76, 0.32], [0.8, 0.47], [-0.8, 0.47]], 8], g: 'trim', gap: 0.003 },
      // engine louvres
      ...[1.72, 1.8, 1.88, 1.96].map((z) => ({ frame: 'top', shape: ['strip', [[-0.42, z], [0.42, z]], 0.018], g: 'trim', gap: 0.003, minDetail: 1 })),
    ],
  }
}

function vento(def) {
  const L = def.halfLength, WB = def.wheelbase
  const fa = -WB / 2, ra = WB / 2
  const R = 0.325
  const HL = { d: [-0.3, -0.62, 1], o: [0.63, 0.6, -1.72] }
  return {
    id: 'vento',
    wheelbase: WB,
    halfWidth: def.halfWidth,
    panels: [...door(-0.8, 0.25, 0.22, 0.8), ...lid(-1.86, -0.9, 0.55, 0.45), ...lid(1.58, 1.94, 0.5, 0.6)],
    wheels: {
      radius: R, width: 0.225, rearWidthScale: 1.15, rimRadius: 0.241, archR: [R + 0.04, R + 0.042], archLift: 0.012,
      inset: 0.028, style: 'ten', rimColor: '#c5c8cd', lipColor: '#e2e4e7', caliperColor: '#d4202a',
    },
    body: {
      zNose: -L, zTail: L,
      nose: { len: 0.17, m: 2.8, yc: 0.62 },
      tail: { len: 0.12, m: 3.0, yc: 0.55 },
      W: [[-L, 0.76], [-L + 0.2, 0.88], [fa - 0.1, 0.955], [fa, 0.965], [-0.7, 0.935], [0, 0.915], [0.6, 0.945], [ra, 0.972], [L - 0.25, 0.955], [L, 0.9]],
      top: [[-L, 0.46], [-L + 0.14, 0.525], [-L + 0.45, 0.59], [fa, 0.64], [-0.95, 0.7], [-0.7, 0.74], [-0.3, 0.75], [0.4, 0.76], [ra - 0.2, 0.795], [ra, 0.805], [L - 0.2, 0.815], [L, 0.815]],
      mid: [[-L, 0.34], [-L + 0.4, 0.46], [fa, 0.53], [0, 0.52], [ra, 0.56], [L, 0.56]],
      bot: [[-L, 0.17], [-L + 0.18, 0.12], [L - 0.45, 0.12], [L - 0.15, 0.2], [L, 0.27]],
      nUp: [[-L, 2.6], [fa, 3.2], [0, 2.9], [ra, 3.3], [L, 3.6]],
      nDn: [[-L, 3], [-L + 0.5, 4.5], [L - 0.5, 4.5], [L, 3.5]],
      tumble: 0.06,
      tuck: 0.05,
      crown: [[-L + 0.05, 0.01], [-L + 0.4, 0.08], [fa, 0.15], [-0.8, 0.09], [-0.45, 0.02], [0.3, 0.02], [0.8, 0.08], [ra, 0.12], [L - 0.3, 0.07], [L, 0.02]],
      crownAt: 0.8,
      crownW: 0.19,
      topFeatures: [
        // open cockpit
        { z0: -0.34, z1: 0.42, x1: 0.6, h: -0.36, ez: 0.06, ex: 0.07 },
        // speedster headrest humps
        { fn: (z, ax) => 0.1 * smoothstep(0.36, 0.52, z) * (1 - smoothstep(0.6, 1.55, z)) * band(ax, 0.17, 0.49, 0.1) },
      ],
      scoops: [{ z0: -0.88, z1: -0.56, y0: 0.4, y1: 0.62, depth: 0.03, slant: 0.25, ez: 0.07, ey: 0.05 }],
    },
    cabin: {
      type: 'screen', z0: -0.86, z1: -0.28,
      roof: [[-0.86, 0.72], [-0.28, 1.07]],
      W: [[-0.86, 0.8], [-0.28, 0.76]],
      tumble: 0.16, n: 2.3, tc: 0.3, pillar: 0.05, pillarMat: 'trim', headerMat: 'trim', header: 0.035,
    },
    parts: {
      splitter: { y: 0.085, thick: 0.014, off: 0.018, inset: 0.9 },
      skirts: { y: 0.115, h: 0.08, out: 0.022 },
      diffuser: { z0: L - 0.5, halfW: 0.5, yLow: 0.11, fins: 3, finH: 0.05 },
      mirrors: { z: -0.62, y: 0.84, x: 1.01, len: 0.18, h: 0.072, d: 0.1, stalkX: 0.84, stalkY: 0.76 },
      lip: { z: L - 0.14, span: 0.72, h: 0.022, len: 0.1, g: 'paint' },
      exhausts: { pts: [[0.09, 0.3]], r: 0.042 },
      cockpit: { seatX: 0.32, seatY: 0.42, seatZ: 0.26, wheelY: 0.72, wheelZ: -0.16, dash: { c: [0, 0.66, -0.34], size: [1.1, 0.14, 0.16] } },
    },
    decals: [
      // oval headlights on the fender noses
      { frame: HL, shape: ['ellipse', 0, 0, 0.17, 0.078, { rot: -0.18 }], g: 'glass', gap: 0.003, extrude: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', 0.04, -0.006, 0.1, 0.044, { rot: -0.18 }], g: 'chrome', gap: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', 0.04, -0.006, 0.066, 0.03, { rot: -0.18 }], g: 'head', gap: 0.009, mirror: true },
      { frame: HL, shape: ['strip', [[-0.16, 0.035], [-0.03, 0.06], [0.12, 0.05]], 0.007], g: 'head', gap: 0.008, mirror: true },
      // oval grille with chrome surround + side intakes
      { frame: 'front', shape: ['ellipse', 0, 0.27, 0.4, 0.105, { n: 2.6 }], g: 'chrome', gap: 0.003 },
      { frame: 'front', shape: ['ellipse', 0, 0.27, 0.385, 0.092, { n: 2.6 }], g: 'trim', gap: 0.005 },
      ...[0.245, 0.275, 0.305].map((y) => ({ frame: 'front', shape: ['strip', [[-0.34, y], [0.34, y]], 0.005], g: 'chrome', gap: 0.007, minDetail: 1 })),
      { frame: 'front', shape: ['rquad', [[0.52, 0.19], [0.72, 0.2], [0.7, 0.28], [0.55, 0.27]], 5], g: 'trim', gap: 0.004, mirror: true },
      // fender vents
      { frame: 'side', shape: ['rquad', [[-0.86, 0.45], [-0.62, 0.47], [-0.6, 0.58], [-0.8, 0.59]], 5], g: 'trim', gap: 0.003, mirror: true },
      ...[0.49, 0.52, 0.55].map((y) => ({ frame: 'side', shape: ['strip', [[-0.8, y + 0.01], [-0.63, y + 0.02]], 0.005], g: 'chrome', gap: 0.006, mirror: true, minDetail: 1 })),
      // twin round taillights per side
      ...[[0.56, 0.065], [0.76, 0.06]].flatMap(([x, r]) => [
        { frame: 'rear', shape: ['ellipse', x, 0.66, r + 0.012, r + 0.012], g: 'chrome', gap: 0.003, extrude: 0.006, mirror: true },
        { frame: 'rear', shape: ['ellipse', x, 0.66, r, r], g: 'tail', gap: 0.007, mirror: true },
        { frame: 'rear', shape: ['ellipse', x, 0.66, r * 0.35, r * 0.35], g: 'glass', gap: 0.009, mirror: true, minDetail: 1 },
      ]),
      // rear lower
      { frame: 'rear', shape: ['rquad', [[-0.6, 0.27], [0.6, 0.27], [0.62, 0.42], [-0.62, 0.42]], 8], g: 'trim', gap: 0.003 },
    ],
  }
}

function stradale(def) {
  const L = def.halfLength, WB = def.wheelbase
  const fa = -WB / 2, ra = WB / 2
  const R = 0.345
  const HL = { d: [-0.45, -0.75, 1], o: [0.66, 0.66, -1.95] }
  return {
    id: 'stradale',
    wheelbase: WB,
    halfWidth: def.halfWidth,
    panels: [...door(-0.95, 0.5, 0.22, 0.9), ...lid(-2.2, -0.52, 0.56, 0.45), ...lid(2.1, 2.3, 0.5, 0.7)],
    wheels: {
      radius: R, width: 0.255, rearWidthScale: 1.18, rimRadius: 0.256, archR: [R + 0.04, R + 0.042], archLift: 0.012,
      inset: 0.022, style: 'y5', rimColor: '#7d8087', lipColor: '#aeb1b6', caliperColor: '#1e5bd6', dish: 0.03,
    },
    body: {
      zNose: -L, zTail: L,
      nose: { len: 0.16, m: 3.2, yc: 0.62 },
      tail: { len: 0.07, m: 4, yc: 0.55 },
      W: [[-L, 0.74], [-L + 0.22, 0.875], [-L + 0.55, 0.935], [fa, 0.962], [-0.75, 0.935], [-0.1, 0.915], [0.6, 0.94], [ra, 0.978], [L - 0.35, 0.965], [L, 0.925]],
      top: [[-L, 0.5], [-L + 0.14, 0.57], [-L + 0.5, 0.645], [fa, 0.7], [-0.85, 0.745], [-0.42, 0.78], [0.2, 0.8], [0.9, 0.83], [ra, 0.86], [L - 0.35, 0.89], [L - 0.1, 0.91], [L, 0.91]],
      mid: [[-L, 0.36], [-L + 0.5, 0.5], [fa, 0.56], [0, 0.55], [ra, 0.6], [L, 0.62]],
      bot: [[-L, 0.18], [-L + 0.2, 0.12], [L - 0.6, 0.12], [L - 0.25, 0.2], [L - 0.05, 0.3], [L, 0.32]],
      nUp: [[-L, 2.8], [fa, 3.6], [-0.3, 3.2], [0.6, 3.2], [ra, 3.8], [L, 4.4]],
      nDn: [[-L, 3.2], [-L + 0.6, 5], [L - 0.6, 5], [L, 4]],
      tumble: [[-L, 0.03], [fa, 0.05], [0, 0.07], [ra, 0.06], [L, 0.05]],
      tuck: 0.05,
      crown: [[-L + 0.05, 0.01], [-L + 0.45, 0.07], [fa, 0.11], [-0.8, 0.08], [-0.4, 0.02], [0.4, 0.02], [0.9, 0.06], [ra, 0.085], [L - 0.35, 0.05], [L, 0.02]],
      crownAt: 0.8,
      crownW: 0.2,
      topFeatures: [
        // hood power bulge
        { fn: (z, ax) => 0.028 * smoothstep(-L + 0.25, -L + 0.8, z) * (1 - smoothstep(-0.75, -0.4, z)) * (1 - smoothstep(0.14, 0.32, ax)) },
      ],
      scoops: [{ z0: -0.98, z1: -0.55, y0: 0.4, y1: 0.6, depth: 0.028, slant: 0.2, ez: 0.08, ey: 0.05 }],
    },
    cabin: {
      z0: -0.46, zRoofF: 0.12, zRoofR: 0.62, zC: 0.95, z1: 2.08,
      roof: [[-0.46, 0.79], [-0.1, 1.05], [0.12, 1.19], [0.38, 1.225], [0.62, 1.205], [1.1, 1.11], [1.6, 1.0], [2.08, 0.915]],
      W: [[-0.46, 0.8], [0.0, 0.775], [0.6, 0.745], [1.2, 0.7], [1.7, 0.62], [2.08, 0.54]],
      tumble: [[-0.46, 0.12], [0.2, 0.25], [0.8, 0.26], [1.5, 0.2], [2.08, 0.12]],
      n: [[-0.46, 2.4], [0.3, 3.0], [1.4, 3.0], [2.08, 2.6]],
      tc: 0.3, pillar: 0.05,
      roofMat: 'paint', pillarMat: 'paint', cPillarMat: 'paint', rearMat: 'glass',
    },
    parts: {
      splitter: { y: 0.09, thick: 0.014, off: 0.02, inset: 0.94 },
      skirts: { y: 0.115, h: 0.09, out: 0.024, g: 'trim' },
      diffuser: { z0: L - 0.6, halfW: 0.55, yLow: 0.12, fins: 3, finH: 0.05 },
      mirrors: { z: -0.2, y: 0.9, x: 1.02, len: 0.2, h: 0.078, d: 0.11, stalkX: 0.84, stalkY: 0.82 },
      lip: { z: L - 0.07, span: 0.78, h: 0.04, len: 0.13, g: 'paint' },
      exhausts: { pts: [[0.5, 0.36], [0.63, 0.36]], r: 0.042 },
    },
    decals: [
      // swept headlights along the fender fronts
      { frame: HL, shape: ['rquad', [[-0.26, -0.04], [0.2, -0.1], [0.26, 0.03], [-0.25, 0.075]], 4], g: 'glass', gap: 0.003, extrude: 0.006, mirror: true },
      { frame: HL, shape: ['strip', [[-0.24, 0.058], [0.02, 0.03], [0.24, 0.006], [0.215, -0.07]], 0.01], g: 'head', gap: 0.007, mirror: true },
      { frame: HL, shape: ['ellipse', 0.12, -0.045, 0.036, 0.036], g: 'chrome', gap: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', 0.12, -0.045, 0.025, 0.025], g: 'head', gap: 0.009, mirror: true },
      { frame: HL, shape: ['ellipse', 0.025, -0.025, 0.033, 0.033], g: 'chrome', gap: 0.006, mirror: true },
      { frame: HL, shape: ['ellipse', 0.025, -0.025, 0.023, 0.023], g: 'head', gap: 0.009, mirror: true },
      { frame: HL, shape: ['ellipse', -0.075, -0.008, 0.03, 0.03], g: 'chrome', gap: 0.006, mirror: true, minDetail: 1 },
      { frame: HL, shape: ['ellipse', -0.075, -0.008, 0.021, 0.021], g: 'head', gap: 0.009, mirror: true, minDetail: 1 },
      // big grille with slats + side intakes
      { frame: 'front', shape: ['rquad', [[-0.46, 0.17], [0.46, 0.17], [0.38, 0.38], [-0.38, 0.38]], 5], g: 'chrome', gap: 0.003 },
      { frame: 'front', shape: ['rquad', [[-0.445, 0.18], [0.445, 0.18], [0.37, 0.37], [-0.37, 0.37]], 5], g: 'trim', gap: 0.005 },
      ...[0.215, 0.25, 0.285, 0.32].map((y) => ({ frame: 'front', shape: ['strip', [[-0.41, y], [0.41, y]], 0.005], g: 'chrome', gap: 0.007, minDetail: 1 })),
      { frame: 'front', shape: ['rquad', [[0.55, 0.19], [0.76, 0.2], [0.74, 0.3], [0.58, 0.29]], 5], g: 'trim', gap: 0.004, mirror: true },
      // hood louvres
      { frame: 'top', shape: ['rquad', [[0.3, -1.62], [0.56, -1.56], [0.56, -1.3], [0.3, -1.36]], 5], g: 'glass', gap: 0.003, mirror: true },
      ...[-1.53, -1.47, -1.41].map((z) => ({ frame: 'top', shape: ['strip', [[0.33, z], [0.53, z + 0.05]], 0.011], g: 'paint', gap: 0.006, mirror: true, minDetail: 1 })),
      // fender vent behind the front wheel
      { frame: 'side', shape: ['rquad', [[-0.95, 0.44], [-0.62, 0.46], [-0.6, 0.56], [-0.9, 0.57]], 5], g: 'trim', gap: 0.003, mirror: true },
      ...[0.475, 0.505, 0.535].map((y) => ({ frame: 'side', shape: ['strip', [[-0.9, y], [-0.63, y + 0.012]], 0.005], g: 'chrome', gap: 0.006, mirror: true, minDetail: 1 })),
      // twin taillight strips per side (L-shaped), smoked centre panel
      { frame: 'rear', shape: ['rquad', [[0.26, 0.72], [0.86, 0.7], [0.88, 0.83], [0.28, 0.84]], 6], g: 'trim', gap: 0.003, extrude: 0.005, mirror: true },
      { frame: 'rear', shape: ['strip', [[0.3, 0.805], [0.84, 0.8], [0.87, 0.72]], 0.013], g: 'tail', gap: 0.007, mirror: true },
      { frame: 'rear', shape: ['strip', [[0.42, 0.755], [0.8, 0.75]], 0.009], g: 'tail', gap: 0.007, mirror: true },
      { frame: 'rear', shape: ['strip', [[-0.3, 0.79], [0.3, 0.79]], 0.02], g: 'glass', gap: 0.004 },
      // rear lower + exhaust surrounds
      { frame: 'rear', shape: ['rquad', [[-0.74, 0.33], [0.74, 0.33], [0.78, 0.46], [-0.78, 0.46]], 8], g: 'trim', gap: 0.003 },
    ],
  }
}

function nebula(def) {
  const L = def.halfLength, WB = def.wheelbase
  const fa = -WB / 2, ra = WB / 2
  const R = 0.35
  const HL = { d: [-0.3, -0.7, 1], o: [0.62, 0.5, -1.98] }
  return {
    id: 'nebula',
    wheelbase: WB,
    halfWidth: def.halfWidth,
    panels: [...door(-0.9, 0.02, 0.2, 0.8), ...lid(-2.08, -1.22, 0.46, 0.3)],
    wheels: {
      radius: R, width: 0.255, rearWidthScale: 1.25, rimRadius: 0.266, archR: [R + 0.036, R + 0.038], archLift: 0.012,
      inset: 0.018, style: 'turbine', spokes: 7, rimColor: '#1b1d21', lipColor: '#3a3d43', hubColor: '#2a2c30', caliperColor: '#ff6b00', centerLock: true, dish: 0.045,
    },
    body: {
      zNose: -L, zTail: L,
      nose: { len: 0.13, m: 3.4, yc: 0.62 },
      tail: { len: 0.08, m: 3.8, yc: 0.5 },
      W: [[-L, 0.7], [-L + 0.2, 0.86], [-L + 0.5, 0.94], [fa, 0.975], [-0.95, 0.955], [-0.45, 0.905], [0.2, 0.91], [0.75, 0.965], [ra, 0.985], [L - 0.3, 0.978], [L, 0.95]],
      top: [[-L, 0.36], [-L + 0.12, 0.43], [-L + 0.45, 0.53], [fa, 0.6], [-1.0, 0.7], [-0.6, 0.745], [0.0, 0.76], [0.6, 0.79], [1.1, 0.84], [ra, 0.86], [L - 0.3, 0.88], [L, 0.88]],
      mid: [[-L, 0.26], [-L + 0.45, 0.42], [fa, 0.56], [-0.4, 0.5], [0.6, 0.53], [ra, 0.6], [L, 0.58]],
      bot: [[-L, 0.12], [-L + 0.15, 0.09], [L - 0.7, 0.09], [L - 0.3, 0.18], [L - 0.05, 0.28], [L, 0.3]],
      nUp: [[-L, 2.6], [fa, 4.2], [-0.5, 3.4], [0.4, 3.4], [ra, 4.4], [L, 5]],
      nDn: [[-L, 3], [-L + 0.6, 5.5], [L - 0.6, 5.5], [L, 4.5]],
      tumble: [[-L, 0.02], [fa, 0.06], [0, 0.1], [ra, 0.06], [L, 0.05]],
      tuck: 0.07,
      crown: [[-L + 0.04, 0.02], [-L + 0.4, 0.13], [fa, 0.2], [-0.95, 0.13], [-0.55, 0.02], [0.3, 0.0], [0.8, 0.06], [ra, 0.1], [L - 0.3, 0.07], [L, 0.03]],
      crownAt: 0.8,
      crownW: 0.16,
      topFeatures: [
        // central spine along the engine cover
        { fn: (z, ax) => 0.05 * smoothstep(0.7, 1.1, z) * (1 - smoothstep(L - 0.35, L - 0.05, z)) * (1 - smoothstep(0.03, 0.12, ax)) },
      ],
      scoops: [{ z0: 0.05, z1: 0.95, y0: 0.3, y1: 0.66, depth: 0.12, slant: 0.7, ez: 0.1, ey: 0.07, ramp: true }],
    },
    cabin: {
      z0: -1.12, zRoofF: -0.32, zRoofR: 0.3, zC: 0.52, z1: 1.35,
      roof: [[-1.12, 0.69], [-0.7, 0.9], [-0.3, 1.05], [0.0, 1.075], [0.3, 1.06], [0.8, 0.96], [1.35, 0.84]],
      W: [[-1.12, 0.74], [-0.6, 0.7], [0.0, 0.66], [0.6, 0.6], [1.0, 0.48], [1.35, 0.34]],
      tumble: [[-1.12, 0.15], [-0.4, 0.34], [0.4, 0.36], [1.0, 0.25], [1.35, 0.15]],
      n: [[-1.12, 2.2], [0, 2.4], [1.35, 2.2]],
      tc: 0.3, pillar: 0.04,
      roofMat: 'glass', pillarMat: 'trim', railMat: 'trim', cPillarMat: 'paint', rearMat: 'glass',
    },
    parts: {
      splitter: { y: 0.055, thick: 0.016, off: 0.05, inset: 0.99 },
      skirts: { y: 0.09, h: 0.1, out: 0.045 },
      diffuser: { z0: L - 0.75, halfW: 0.7, yLow: 0.09, fins: 6, finH: 0.09 },
      mirrors: { z: -0.72, y: 0.86, x: 1.0, len: 0.17, h: 0.065, d: 0.11, stalkX: 0.78, stalkY: 0.74, g: 'carbon', stalkG: 'carbon' },
      wing: {
        z: L - 0.42, chord: 0.36, span: 0.92, y: 1.2, aoa: 9, thick: 0.1, camber: 0.05,
        endplate: { front: 0.08, back: 0.06, below: 0.12, above: 0.06 },
        pylons: [{ x: 0.34, z: L - 0.52, swan: true }],
      },
      exhausts: { pts: [[0.0, 0.45]], r: 0.065, sx: 1.3, sy: 0.75, mirror: false },
    },
    custom: (ctx) => {
      // shark fin along the spine, rising toward the wing
      extrudeX(ctx.acc, 'paint', [[0.9, 0.8], [L - 0.22, 0.86], [L - 0.3, 1.0], [L - 0.52, 0.99], [1.3, 0.86]], -0.007, 0.014)
    },
    decals: [
      // quad LED slit headlights
      { frame: HL, shape: ['rquad', [[-0.19, -0.04], [0.19, -0.075], [0.2, 0.03], [-0.18, 0.045]], 5], g: 'glass', gap: 0.003, extrude: 0.006, mirror: true },
      ...[-0.12, -0.04, 0.04, 0.12].map((u, i) => ({ frame: HL, shape: ['rquad', [[u - 0.028, -0.03 - i * 0.008], [u + 0.028, -0.034 - i * 0.008], [u + 0.03, 0.012 - i * 0.008], [u - 0.026, 0.016 - i * 0.008]], 6], g: 'head', gap: 0.008, mirror: true })),
      { frame: HL, shape: ['strip', [[-0.17, 0.035], [0.18, 0.012]], 0.005], g: 'head', gap: 0.008, mirror: true },
      // front: wide intake, big corner ducts, carbon vanes
      { frame: 'front', shape: ['rquad', [[-0.56, 0.12], [0.56, 0.12], [0.44, 0.28], [-0.44, 0.28]], 6], g: 'trim', gap: 0.004 },
      { frame: 'front', shape: ['rquad', [[0.58, 0.13], [0.86, 0.14], [0.84, 0.36], [0.62, 0.3]], 5], g: 'trim', gap: 0.004, mirror: true },
      ...[0.17, 0.225].map((y) => ({ frame: 'front', shape: ['strip', [[-0.46, y], [0.46, y]], 0.008], g: 'carbon', gap: 0.008, minDetail: 1 })),
      // hood ducts
      { frame: 'top', shape: ['rquad', [[-0.3, -1.97], [0.3, -1.97], [0.22, -1.6], [-0.22, -1.6]], 5], g: 'carbon', gap: 0.003 },
      { frame: 'top', shape: ['rquad', [[-0.24, -1.9], [0.24, -1.9], [0.18, -1.66], [-0.18, -1.66]], 5], g: 'trim', gap: 0.006 },
      // side intake
      { frame: 'side', shape: ['rquad', [[0.2, 0.33], [0.95, 0.4], [0.9, 0.63], [0.45, 0.62]], 5], g: 'trim', gap: 0.002, mirror: true },
      // rear: thin full-width light blade + big black fascia
      { frame: 'rear', shape: ['strip', [[-0.9, 0.8], [0, 0.8], [0.9, 0.8]], 0.022], g: 'trim', gap: 0.003, extrude: 0.004 },
      { frame: 'rear', shape: ['strip', [[-0.88, 0.8], [0, 0.8], [0.88, 0.8]], 0.009], g: 'tail', gap: 0.007 },
      { frame: 'rear', shape: ['strip', [[0.7, 0.8], [0.9, 0.8], [0.93, 0.66]], 0.009], g: 'tail', gap: 0.008, mirror: true },
      { frame: 'rear', shape: ['rquad', [[-0.84, 0.3], [0.84, 0.3], [0.86, 0.74], [-0.86, 0.74]], 8], g: 'trim', gap: 0.003 },
      ...[0.62, 0.67].map((y) => ({ frame: 'rear', shape: ['strip', [[-0.74, y], [0.74, y]], 0.008], g: 'carbon', gap: 0.007, minDetail: 1 })),
    ],
  }
}

export const DESIGNS = { aurora, vento, stradale, nebula }
