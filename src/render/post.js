// Post stack (pmndrs/postprocessing): [SpeedBlur + Bloom + Finish(ACES, grade, vignette)] → [SMAA|FXAA]
import * as THREE from 'three'
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, FXAAEffect, SMAAPreset } from 'postprocessing'
import { SpeedBlurEffect } from './effects/SpeedBlurEffect.js'
import { FinishEffect } from './effects/FinishEffect.js'

export class PostFX {
  constructor(renderer, scene, camera, preset) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
    this.composer = null
    this.build(preset)
  }

  build(preset) {
    if (this.composer) this.composer.dispose()
    const renderer = this.renderer
    this.preset = preset
    const composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: preset.msaa || 0,
    })
    composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 0.92,
      luminanceSmoothing: 0.25,
      intensity: 0.7,
      radius: 0.72,
      levels: preset.bloomLevels || 6,
    })
    if (preset.bloomHalf) this.bloom.resolution.scale = 0.5
    this.speed = new SpeedBlurEffect()
    this.finish = new FinishEffect()
    const effects = preset.speedBlur ? [this.speed, this.bloom, this.finish] : [this.bloom, this.finish]
    const main = new EffectPass(this.camera, ...effects)
    main.dithering = true
    composer.addPass(main)
    if (preset.aa === 'smaa') composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })))
    else if (preset.aa === 'fxaa') composer.addPass(new EffectPass(this.camera, new FXAAEffect()))
    this.composer = composer
    this.hasSpeed = !!preset.speedBlur
  }

  setSize(w, h) { this.composer.setSize(w, h, false) }

  applyLook(look) {
    this.finish.set('exposure', look.exposure)
    this.finish.set('sat', look.sat)
    this.finish.set('contrast', look.contrast)
    this.finish.set('temp', look.temp)
    this.finish.set('lift', look.lift)
    this.bloom.intensity = look.bloom
  }

  render(dt) { this.composer.render(dt) }
}
