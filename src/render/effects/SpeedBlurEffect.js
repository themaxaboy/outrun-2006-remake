// Radial speed blur toward a vanishing point; strength driven by speed / drift / slipstream.
import { Effect, EffectAttribute } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

const fragment = /* glsl */ `
uniform float strength;
uniform vec2 center;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 dir = uv - center;
  float d = length(dir);
  float amt = strength * smoothstep(0.12, 0.8, d);
  if (amt < 0.0005) { outputColor = inputColor; return; }
  vec3 acc = inputColor.rgb;
  float w = 1.0;
  for (int i = 1; i < 6; i++) {
    float t = float(i) / 5.0 * amt;
    float wi = 1.0 - float(i) * 0.12;
    acc += texture2D(inputBuffer, uv - dir * t).rgb * wi;
    w += wi;
  }
  outputColor = vec4(acc / w, inputColor.a);
}`

export class SpeedBlurEffect extends Effect {
  constructor() {
    super('SpeedBlurEffect', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ['strength', new Uniform(0)],
        ['center', new Uniform(new Vector2(0.5, 0.56))],
      ]),
    })
  }
  set strength(v) { this.uniforms.get('strength').value = v }
  get strength() { return this.uniforms.get('strength').value }
}
