// Terrain & generic vertex-coloured world material with world-space detail noise
// (two scales blended to hide tiling). Also used by barriers / far ground.
import * as THREE from 'three'

export function createTerrainMaterial(detail, { roughness = 0.94, strength = 0.55, side = THREE.FrontSide, metalness = 0 } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness, side })
  const uniforms = { uDetail: { value: detail }, uDetailStrength: { value: strength } }
  mat.userData.uniforms = uniforms
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailStrength;\nvarying vec3 vWPos;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 dA = texture2D(uDetail, vWPos.xz * 0.11).rgb;
vec3 dB = texture2D(uDetail, vWPos.xz * 0.013 + 0.37).rgb;
float det = (dA.r - 0.5) * 0.9 + (dB.g - 0.5) * 1.2 + (dA.b - 0.5) * 0.5;
diffuseColor.rgb *= 1.0 + det * uDetailStrength;`,
      )
  }
  mat.customProgramCacheKey = () => 'terrain-v1-' + strength
  return mat
}
