// Shared material for all instanced props: vertex colours + instance tint, wind sway
// (per-instance phase from its position) and night-time emissive windows/lamps.
import * as THREE from 'three'

export function createPropMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide })
  const uniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uNight: { value: 0 } }
  mat.userData.uniforms = uniforms
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float aSway;\nattribute float aEmit;\nvarying float vEmit;\nvarying vec3 vLocal;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
vec3 ip = vec3(0.0);
#endif
float ph = dot(ip, vec3(0.071, 0.0, 0.053));
float wv = sin(uTime * 1.55 + ph) + 0.45 * sin(uTime * 3.9 + ph * 1.7);
transformed.x += wv * aSway * 0.14 * uWind;
transformed.z += cos(uTime * 1.25 + ph) * aSway * 0.09 * uWind;
vEmit = aEmit;
vLocal = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vEmit;\nvarying vec3 vLocal;\nfloat pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float winLit = 0.0;
float isWin = step(0.5, vEmit) * step(vEmit, 0.6);
if (isWin > 0.5) {
  // procedural window grid for towers (aEmit = 0.55): frames by day, random lit rooms by night
  float hx = vLocal.x + vLocal.z;
  vec2 cell = vec2(floor(hx / 1.7), floor(vLocal.y / 2.3));
  vec2 f = vec2(fract(hx / 1.7), fract(vLocal.y / 2.3));
  float pane = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.82);
  diffuseColor.rgb *= mix(1.4, 0.45, pane);
  // sparse, varied occupancy (whole floors dark sometimes) so towers don't turn into white slabs
  float floorOn = step(0.3, pHash(vec2(cell.y, 3.1)));
  winLit = pane * floorOn * step(0.64, pHash(cell)) * (0.35 + 0.65 * pHash(cell + 7.0));
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, isWin * 0.8);')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
totalEmissiveRadiance += isWin > 0.5 ? vec3(1.0, 0.78, 0.5) * winLit * uNight * 1.1 : diffuseColor.rgb * vEmit * uNight * 3.0;`,
      )
  }
  mat.customProgramCacheKey = () => 'props-v1'
  return mat
}
