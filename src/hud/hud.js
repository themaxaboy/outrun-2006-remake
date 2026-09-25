// In-race HUD. Built once as DOM; update() runs every frame but only touches the DOM when a
// displayed value changes (text) or via transforms (needles/bars) — no layout reads, no Vue.
import './hud.css'
import { createPyramidMap } from './pyramidMap.js'
import { formatTime } from '../game/timer.js'

const html = `
<div class="hud-top">
  <div class="hud-block hud-left">
    <div class="lbl">SCORE</div><div class="val score">0</div>
    <div class="lbl">STAGE <span class="stage-no">1</span></div><div class="val stage-name">—</div>
    <div class="lap"><span class="lbl">LAP</span> <span class="stage-time">0'00"00</span></div>
  </div>
  <div class="hud-time">
    <div class="lbl">TIME</div>
    <div class="time-val">85</div>
  </div>
  <div class="hud-block hud-right"><div class="pyr-wrap"></div></div>
</div>
<div class="hud-progress"><div class="bar"><div class="fill"></div></div><div class="lbl">NEXT CHECKPOINT</div></div>
<div class="hud-banner"><div class="big"></div><div class="small"></div></div>
<div class="hud-fork"><span class="arrow l">◀ <em></em></span><span class="arrow r"><em></em> ▶</span></div>
<div class="hud-drift"><div class="d-title">DRIFT <span class="mult"></span></div><div class="d-pts"></div></div>
<div class="hud-speedo">
  <svg viewBox="0 0 200 120" class="tach">
    <path class="tach-bg" d="M20,110 A90,90 0 0 1 180,110" />
    <path class="tach-fg" d="M20,110 A90,90 0 0 1 180,110" pathLength="100" />
    <path class="tach-red" d="M20,110 A90,90 0 0 1 180,110" pathLength="100" />
  </svg>
  <div class="spd"><span class="kmh">0</span><span class="unit">km/h</span></div>
  <div class="gear-wrap"><span class="gear">1</span><span class="trans">AT</span></div>
  <div class="slip"><div class="slip-fill"></div><span>SLIPSTREAM</span></div>
</div>
<div class="hud-countdown"></div>
`

export class HUD {
  constructor(parent = document.body) {
    this.el = document.createElement('div')
    this.el.className = 'hud hidden'
    this.el.innerHTML = html
    parent.appendChild(this.el)
    const q = (s) => this.el.querySelector(s)
    this.$ = {
      score: q('.score'), stageNo: q('.stage-no'), stageName: q('.stage-name'), stageTime: q('.stage-time'),
      time: q('.time-val'), timeWrap: q('.hud-time'), progress: q('.hud-progress .fill'), progressWrap: q('.hud-progress'),
      banner: q('.hud-banner'), bannerBig: q('.hud-banner .big'), bannerSmall: q('.hud-banner .small'),
      fork: q('.hud-fork'), forkL: q('.hud-fork .l em'), forkR: q('.hud-fork .r em'),
      drift: q('.hud-drift'), driftMult: q('.hud-drift .mult'), driftPts: q('.hud-drift .d-pts'),
      tach: q('.tach-fg'), kmh: q('.kmh'), gear: q('.gear'), trans: q('.trans'), slip: q('.slip-fill'), slipWrap: q('.slip'),
      countdown: q('.hud-countdown'),
    }
    this.pyr = createPyramidMap()
    q('.pyr-wrap').appendChild(this.pyr.el)
    this.cache = {}
    this.bannerT = 0
    this.driftT = 0
    this.visible = false
  }

  show(v) {
    this.visible = v
    this.el.classList.toggle('hidden', !v)
  }

  setText(key, el, v) {
    if (this.cache[key] !== v) {
      this.cache[key] = v
      el.textContent = v
    }
  }

  setStage(no, name, visited, current) {
    this.setText('stageNo', this.$.stageNo, String(no))
    this.setText('stageName', this.$.stageName, name)
    this.pyr.set(visited, current)
  }

  setTransmission(manual) { this.setText('trans', this.$.trans, manual ? 'MT' : 'AT') }

  banner(big, small = '', seconds = 2.2, cls = '') {
    this.$.bannerBig.textContent = big
    this.$.bannerSmall.textContent = small
    this.$.banner.className = 'hud-banner show ' + cls
    // restart CSS animation
    void this.$.banner.offsetWidth
    this.bannerT = seconds
  }

  countdown(text) {
    const el = this.$.countdown
    el.textContent = text
    el.classList.remove('pop')
    void el.offsetWidth
    el.classList.toggle('pop', !!text)
  }

  fork(show, left = '', right = '') {
    this.$.fork.classList.toggle('show', show)
    if (show) {
      this.setText('forkL', this.$.forkL, left)
      this.setText('forkR', this.$.forkR, right)
    }
  }

  drift(active, mult, pts) {
    if (active || pts > 0) {
      this.driftT = active ? 1.5 : this.driftT
      this.$.drift.classList.add('show')
      this.setText('driftMult', this.$.driftMult, mult > 1 ? '×' + mult : '')
      this.setText('driftPts', this.$.driftPts, pts > 0 ? pts.toLocaleString('en-US') : '')
    }
  }

  update(dt, s) {
    // s: { speedKmh, rpmNorm, gear, timeLeft, countDown, score, stageTime, progress, slip, slipActive, redline }
    if (!this.visible) return
    this.setText('kmh', this.$.kmh, String(Math.round(s.speedKmh)))
    this.setText('gear', this.$.gear, String(s.gear))
    const tach = Math.max(0, Math.min(100, s.rpmNorm * 100))
    const tachQ = Math.round(tach)
    if (this.cache.tach !== tachQ) {
      this.cache.tach = tachQ
      this.$.tach.style.strokeDashoffset = String(100 - tachQ)
    }
    const t = s.countDown ? Math.ceil(s.timeLeft) : Math.floor(s.stageTotal)
    this.setText('time', this.$.time, String(t))
    const warn = s.countDown && s.timeLeft < 10.5
    if (this.cache.warn !== warn) {
      this.cache.warn = warn
      this.$.timeWrap.classList.toggle('warn', warn)
    }
    this.setText('score', this.$.score, s.score.toLocaleString('en-US'))
    this.setText('stageTime', this.$.stageTime, formatTime(s.stageTime))
    const pq = Math.round(s.progress * 200) / 200
    if (this.cache.prog !== pq) {
      this.cache.prog = pq
      this.$.progress.style.transform = `scaleX(${pq})`
    }
    const sq = Math.round(s.slip * 50) / 50
    if (this.cache.slip !== sq) {
      this.cache.slip = sq
      this.$.slip.style.transform = `scaleX(${sq})`
      this.$.slipWrap.classList.toggle('on', s.slipActive)
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt
      if (this.bannerT <= 0) this.$.banner.classList.remove('show')
    }
    if (this.driftT > 0) {
      this.driftT -= dt
      if (this.driftT <= 0) this.$.drift.classList.remove('show')
    }
  }
}
