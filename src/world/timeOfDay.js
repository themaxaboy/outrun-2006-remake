// Lighting/atmosphere presets per time of day. Colours are sRGB hex (converted to linear on use).
// sunAz is relative to the stage's initial heading (0 = straight ahead), so e.g. sunsets sit in
// front of the player the way the original's big skies did.
export const TOD = {
  morning: {
    sunEl: 14, sunAz: 55, sun: '#ffd9a8', sunI: 3.2, zenith: '#3f7fd6', horizon: '#bfd7ee', ground: '#6d7a6a', hemiI: 0.55,
    fog: '#c3d6e8', fogSun: '#ffe2b8', fogDensity: 0.00042, exposure: 1.0, cloud: 0.35, cloudColor: '#ffffff', stars: 0, night: 0,
    envI: 1.0, grade: { sat: 1.12, temp: 0.04, contrast: 1.05, lift: 0.0 }, bloom: 0.7,
  },
  lateMorning: {
    sunEl: 32, sunAz: 40, sun: '#fff0d6', sunI: 3.6, zenith: '#2f74d6', horizon: '#b7d3ef', ground: '#6d7a6a', hemiI: 0.6,
    fog: '#bcd3ea', fogSun: '#fff0d8', fogDensity: 0.00038, exposure: 1.0, cloud: 0.3, cloudColor: '#ffffff', stars: 0, night: 0,
    envI: 1.0, grade: { sat: 1.12, temp: 0.02, contrast: 1.06, lift: 0.0 }, bloom: 0.6,
  },
  noon: {
    sunEl: 58, sunAz: 20, sun: '#fff6e8', sunI: 4.0, zenith: '#2366c9', horizon: '#aecdee', ground: '#707a6a', hemiI: 0.65,
    fog: '#b4cde9', fogSun: '#fff4e2', fogDensity: 0.00036, exposure: 0.95, cloud: 0.28, cloudColor: '#ffffff', stars: 0, night: 0,
    envI: 1.0, grade: { sat: 1.14, temp: 0.0, contrast: 1.08, lift: 0.0 }, bloom: 0.55,
  },
  afternoon: {
    sunEl: 30, sunAz: -35, sun: '#ffe7c2', sunI: 3.6, zenith: '#2c6bcf', horizon: '#c4d6ea', ground: '#6f7466', hemiI: 0.6,
    fog: '#c6d5e6', fogSun: '#ffe0b0', fogDensity: 0.0004, exposure: 1.0, cloud: 0.4, cloudColor: '#fff8ee', stars: 0, night: 0,
    envI: 1.0, grade: { sat: 1.12, temp: 0.05, contrast: 1.06, lift: 0.0 }, bloom: 0.6,
  },
  golden: {
    sunEl: 11, sunAz: -20, sun: '#ffb36b', sunI: 3.0, zenith: '#3a62a8', horizon: '#f2c48f', ground: '#6b5f50', hemiI: 0.5,
    fog: '#e8c29a', fogSun: '#ffb870', fogDensity: 0.00048, exposure: 1.05, cloud: 0.45, cloudColor: '#ffd6a8', stars: 0, night: 0.1,
    envI: 0.95, grade: { sat: 1.18, temp: 0.12, contrast: 1.08, lift: 0.01 }, bloom: 0.8,
  },
  sunset: {
    sunEl: 3.5, sunAz: -8, sun: '#ff8a4a', sunI: 2.6, zenith: '#2d3f7a', horizon: '#ff9e63', ground: '#5a4a48', hemiI: 0.42,
    fog: '#e99a72', fogSun: '#ff8f4a', fogDensity: 0.00052, exposure: 1.1, cloud: 0.5, cloudColor: '#ffb07a', stars: 0.05, night: 0.35,
    envI: 0.9, grade: { sat: 1.22, temp: 0.16, contrast: 1.1, lift: 0.015 }, bloom: 1.0,
  },
  dusk: {
    sunEl: -2, sunAz: 10, sun: '#ff7a5a', sunI: 1.1, zenith: '#1d2552', horizon: '#c86a7a', ground: '#3a3444', hemiI: 0.35,
    fog: '#7c5a78', fogSun: '#ff8a6a', fogDensity: 0.00055, exposure: 1.25, cloud: 0.45, cloudColor: '#d88a9a', stars: 0.25, night: 0.75,
    envI: 0.8, grade: { sat: 1.2, temp: 0.02, contrast: 1.1, lift: 0.02 }, bloom: 1.2,
  },
  night: {
    sunEl: 35, sunAz: 150, moon: true, sun: '#9fb4ff', sunI: 0.55, zenith: '#050a1c', horizon: '#1b2240', ground: '#10121a', hemiI: 0.28,
    fog: '#141a33', fogSun: '#2a3160', fogDensity: 0.0006, exposure: 1.6, cloud: 0.25, cloudColor: '#39426a', stars: 1, night: 1,
    envI: 0.7, grade: { sat: 1.15, temp: -0.06, contrast: 1.12, lift: 0.015 }, bloom: 1.5,
  },
  starlight: {
    sunEl: 20, sunAz: -120, moon: true, sun: '#b2c2ff', sunI: 0.45, zenith: '#03061a', horizon: '#1a1a3a', ground: '#0e0d16', hemiI: 0.25,
    fog: '#121430', fogSun: '#2a2a58', fogDensity: 0.00045, exposure: 1.7, cloud: 0.1, cloudColor: '#303660', stars: 1.2, night: 1,
    envI: 0.65, grade: { sat: 1.1, temp: -0.08, contrast: 1.1, lift: 0.02 }, bloom: 1.4,
  },
  twilight: {
    sunEl: -4, sunAz: -30, sun: '#c690ff', sunI: 0.7, zenith: '#131a45', horizon: '#6a5a8f', ground: '#26263a', hemiI: 0.32,
    fog: '#5b5a80', fogSun: '#a07ab8', fogDensity: 0.0009, exposure: 1.35, cloud: 0.35, cloudColor: '#8a7ab0', stars: 0.5, night: 0.85,
    envI: 0.8, grade: { sat: 1.08, temp: -0.04, contrast: 1.05, lift: 0.025 }, bloom: 1.2,
  },
  overcast: {
    sunEl: 28, sunAz: 10, sun: '#e4e8ef', sunI: 1.4, zenith: '#7f8ea3', horizon: '#c9d1dc', ground: '#8a8f96', hemiI: 0.95,
    fog: '#c7ced8', fogSun: '#e9edf2', fogDensity: 0.0009, exposure: 1.05, cloud: 0.9, cloudColor: '#e8ecf2', stars: 0, night: 0.15,
    envI: 1.1, grade: { sat: 0.95, temp: -0.03, contrast: 1.02, lift: 0.02 }, bloom: 0.45,
  },
}

export function getTOD(id) { return TOD[id] || TOD.noon }
