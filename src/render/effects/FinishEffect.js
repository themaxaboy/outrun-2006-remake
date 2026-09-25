// Exposure → ACES filmic tone mapping (same fit as three.js) → colour grade → vignette.
// One effect so grading happens in a known space and all of it merges into a single pass.
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragment = /* glsl */ `
uniform float exposure;
uniform float sat;
uniform float contrast;
uniform float temp;
uniform float lift;
uniform float vignette;
uniform float flash;

vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFilmic(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = IN * (color / 0.6);
  color = rrtOdt(color);
  return clamp(OUT * color, 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exposure;
  // white balance (in linear, before the curve)
  c *= vec3(1.0 + temp, 1.0, 1.0 - temp);
  c = acesFilmic(c);
  // grade in a perceptual-ish space
  vec3 g = pow(max(c, 0.0), vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  g = mix(vec3(l), g, sat);
  g = (g - 0.5) * contrast + 0.5;
  g = g + lift * (1.0 - g);
  vec2 q = uv - 0.5;
  float v = 1.0 - vignette * smoothstep(0.45, 0.95, length(q * vec2(1.1, 1.0)));
  g *= v;
  g = mix(g, vec3(1.0), flash);
  c = pow(max(g, 0.0), vec3(2.2));
  outputColor = vec4(c, inputColor.a);
}`

export class FinishEffect extends Effect {
  constructor() {
    super('FinishEffect', fragment, {
      uniforms: new Map([
        ['exposure', new Uniform(1)],
        ['sat', new Uniform(1.1)],
        ['contrast', new Uniform(1.05)],
        ['temp', new Uniform(0)],
        ['lift', new Uniform(0)],
        ['vignette', new Uniform(0.22)],
        ['flash', new Uniform(0)],
      ]),
    })
  }
  set(name, v) { this.uniforms.get(name).value = v }
}
