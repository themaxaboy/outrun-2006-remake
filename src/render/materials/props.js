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
        '#include <common>\nuniform float uTime;\nuniform float uWind;\nattribute float aSway;\nattribute float aEmit;\nvarying float vEmit;',
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
vEmit = aEmit;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vEmit;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit * uNight * 3.0;',
      )
  }
  mat.customProgramCacheKey = () => 'props-v1'
  return mat
}
