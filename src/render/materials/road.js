// Road material: MeshStandardMaterial + procedural asphalt + analytic lane markings, curbs,
// fork gore chevrons and a wet variant. Markings are anti-aliased with fwidth().
import * as THREE from 'three'

export function createRoadMaterial(tex) {
  const albedo = tex.albedo.clone()
  const hr = tex.hr.clone()
  for (const t of [albedo, hr]) {
    t.repeat.set(0.22, 0.22)
    t.needsUpdate = true
  }
  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    roughnessMap: hr,
    bumpMap: hr,
    bumpScale: 0.6,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.45,
  })
  const uniforms = { uWet: { value: 0 }, uTime: { value: 0 } }
  mat.userData.uniforms = uniforms
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;\nvarying vec2 vRoadUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoad = aRoad;\nvRoadUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWet;
varying vec3 vRoad;
varying vec2 vRoadUv;
float mLine(float d, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, d); }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float hw = vRoad.x;
float toEnd = vRoad.y;
float median = vRoad.z;
float rx = vRoadUv.x;
float rs = vRoadUv.y;
float ax = abs(rx);
float aa = max(fwidth(rx), 0.004) * 1.1;
float aas = max(fwidth(rs), 0.004);
// tyre-worn lanes (darker, smoother bands)
float lanes = max(1.0, floor(2.0 * hw / 3.6 + 0.5));
float lw = 2.0 * hw / lanes;
float lx = (rx + hw) / lw;
float inLane = abs(fract(lx) - 0.5) * lw;
float wear = smoothstep(0.9, 0.35, abs(inLane - 0.95)) * step(ax, hw);
diffuseColor.rgb *= 1.0 - 0.13 * wear;
float paint = 0.0;
// edge lines
paint += mLine(abs(ax - (hw - 0.32)), 0.11, aa);
// lane dividers (dashed); fade at chunk AA distance
float fx = abs(fract(lx + 0.5) - 0.5) * lw;
float inner = step(0.5, lx) * step(lx, lanes - 0.5);
float dash = smoothstep(0.0, aas * 2.0, fract(rs / 16.0) - 0.0) * (1.0 - smoothstep(0.42 - aas / 16.0, 0.42, fract(rs / 16.0)));
float forkZone = step(toEnd, 700.0);
paint += mLine(fx, 0.075, aa) * inner * dash * (1.0 - forkZone * step(abs(rx), 0.5));
// fork: solid centre double line, then chevron gore toward the median nose
float gore = 0.0;
if (toEnd < 700.0) {
  float cl = mLine(abs(ax - 0.18), 0.07, aa);
  paint += cl * step(260.0, toEnd);
  float gw = mix(1.9, 0.0, smoothstep(0.0, 260.0, toEnd));
  float inGore = step(ax, gw) * step(toEnd, 260.0);
  float chev = step(0.5, fract((rs + ax * 1.6) / 3.2));
  gore = inGore;
  paint += inGore * chev;
  paint += mLine(abs(ax - gw), 0.1, aa) * step(toEnd, 260.0);
}
// branch median edge (yellow)
float yellow = 0.0;
if (median != 0.0) {
  yellow = mLine(abs(rx * median - (hw - 0.32)), 0.12, aa);
}
paint = clamp(paint, 0.0, 1.0);
vec3 paintCol = vec3(0.78, 0.78, 0.74);
diffuseColor.rgb = mix(diffuseColor.rgb, paintCol, paint * 0.92);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.55, 0.05), yellow * 0.9);
// rumble curbs
float curb = smoothstep(hw - aa, hw + aa, ax);
vec3 curbCol = mix(vec3(0.62, 0.035, 0.03), vec3(0.8, 0.8, 0.78), step(0.5, fract(rs / 4.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, curbCol, curb);
float markMask = max(max(paint, curb), yellow);
diffuseColor.rgb *= 1.0 - uWet * 0.38 * (1.0 - markMask);
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, markMask);
roughnessFactor = mix(roughnessFactor, 0.12 + 0.2 * texelRoughness.r, uWet);`,
      )
  }
  mat.customProgramCacheKey = () => 'road-v1'
  return mat
}
