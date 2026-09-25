// Per-biome road "grammar" parameters used by roadgen.
// radii in metres, turns in degrees, grades as rise/run, elevations in metres.
export const ROAD_STYLES = {
  coast: {
    rMin: 330, rMax: 1100, turn: [22, 78], pStraight: 0.28, straight: [160, 460], pS: 0.4, tight: 0.12,
    gradeMax: 0.045, hill: [240, 560], elev: { abs: [7, 42] }, lanes: [4, 6], barrier: 0.45,
  },
  lakeside: {
    rMin: 300, rMax: 950, turn: [25, 80], pStraight: 0.25, straight: [150, 420], pS: 0.35, tight: 0.15,
    gradeMax: 0.03, hill: [220, 520], elev: { rel: [-6, 18], min: 4 }, lanes: [4, 5], barrier: 0.35,
  },
  canyon: {
    rMin: 290, rMax: 950, turn: [25, 85], pStraight: 0.38, straight: [220, 620], pS: 0.3, tight: 0.18,
    gradeMax: 0.055, hill: [200, 480], elev: { rel: [-20, 40], min: 6 }, lanes: [4, 4], barrier: 0.3,
  },
  alpine: {
    rMin: 175, rMax: 560, turn: [30, 100], pStraight: 0.14, straight: [120, 320], pS: 0.55, tight: 0.32,
    gradeMax: 0.065, hill: [180, 420], elev: { rel: [-10, 90], min: 12 }, lanes: [3, 4], barrier: 0.75,
  },
  temple: {
    rMin: 210, rMax: 650, turn: [25, 90], pStraight: 0.22, straight: [140, 380], pS: 0.45, tight: 0.22,
    gradeMax: 0.05, hill: [200, 460], elev: { rel: [-10, 40], min: 6 }, lanes: [3, 4], barrier: 0.4,
  },
  metropolis: {
    rMin: 260, rMax: 820, turn: [25, 85], pStraight: 0.34, straight: [200, 520], pS: 0.35, tight: 0.2,
    gradeMax: 0.035, hill: [260, 600], elev: { rel: [-5, 22], min: 8 }, lanes: [5, 6], barrier: 0.85,
  },
}
