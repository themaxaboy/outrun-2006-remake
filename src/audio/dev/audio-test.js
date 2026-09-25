// Dev bench for the audio system (served by Vite at /src/audio/dev/audio-test.html).
import { audio } from '../audio.js'
import { installSelfTest, renderTrack, encodeWav } from '../selfTest.js'
import { SFX_NAMES } from '../sfx/sfxBank.js'

installSelfTest()
window.__audio = audio

// Local copies of the drivetrain numbers so this page doesn't depend on game code.
const CARS = {
  aurora: { cylinders: 8, idle: 950, redline: 8400, engineTone: 1.0 },
  vento: { cylinders: 6, idle: 950, redline: 8800, engineTone: 1.18 },
  stradale: { cylinders: 12, idle: 950, redline: 8000, engineTone: 0.86 },
  nebula: { cylinders: 8, idle: 950, redline: 9200, engineTone: 1.08 },
}

const $ = (id) => document.getElementById(id)
const status = () => {
  const s = audio.stats()
  $('status').textContent = `context: ${s.state} · ${s.sampleRate} Hz · engine: ${s.engine || '-'} · music: ${s.music || '-'} · voices ${s.voices}/${s.voiceCap} (stolen ${s.stolen}) · prewarm queue ${s.prewarmPending}`
}
setInterval(status, 250)

document.addEventListener('pointerdown', () => audio.unlock(), { capture: true })
document.addEventListener('keydown', () => audio.unlock(), { capture: true })
$('unlock').onclick = () => audio.unlock()
$('pause').onclick = () => audio.pause()
$('resume').onclick = () => audio.resume()
for (const [id, key] of [
  ['vMaster', 'master'],
  ['vMusic', 'music'],
  ['vSfx', 'sfx'],
  ['vEngine', 'engine'],
]) {
  $(id).oninput = (e) => audio.setVolumes({ [key]: Number(e.target.value) })
}

for (const t of audio.tracks) {
  const b = document.createElement('button')
  b.textContent = `${t.title} (${t.bpm} bpm, ${t.style})`
  b.onclick = () => audio.playMusic(t.id)
  $('tracks').appendChild(b)
  const o = document.createElement('option')
  o.value = t.id
  o.textContent = t.title
  $('wavTrack').appendChild(o)
}
$('stopMusic').onclick = () => audio.stopMusic()
$('duck').onclick = () => audio.duck(0.6, 1.5)
const renderUser = () => {
  $('userTracks').innerHTML = ''
  for (const u of audio.userTracks) {
    const b = document.createElement('button')
    b.textContent = u.title
    b.onclick = () => audio.playMusic(u.id)
    $('userTracks').appendChild(b)
  }
}
$('files').onchange = async (e) => {
  await audio.loadUserFiles(e.target.files)
  renderUser()
}
setInterval(() => {
  $('musicTime').textContent = audio.currentMusic ? ` ${audio.musicTime.toFixed(1)} s` : ''
}, 200)
setTimeout(renderUser, 1500)

// Engine controls
const state = { rpmNorm: 0, throttle: 0, drift: 0, speed: 0, rumble: 0, offroad: 0, limiter: false, camera: 'chase' }
const car = () => CARS[$('car').value]
$('engStart').onclick = async () => {
  await audio.unlock()
  audio.startEngine(car())
}
$('engStop').onclick = () => audio.stopEngine()
$('car').onchange = () => audio.startEngine(car())
for (const id of ['rpm', 'thr', 'drift', 'speed', 'rumble', 'offroad']) {
  $(id).oninput = (e) => {
    const v = Number(e.target.value)
    if (id === 'rpm') state.rpmNorm = v
    else if (id === 'thr') state.throttle = v
    else state[id] = v
  }
}
$('limiter').onchange = (e) => (state.limiter = e.target.checked)
$('camera').onchange = (e) => (state.camera = e.target.value)
let demo = 0
$('autoRev').onclick = () => (demo = demo ? 0 : performance.now())

function frame(t) {
  const c = car()
  if (demo) {
    // accelerate through the gears, lift, repeat
    const ph = ((t - demo) / 1000) % 9
    const gear = Math.min(4, Math.floor(ph / 1.8))
    const g = (ph % 1.8) / 1.8
    const lifting = ph > 7.6
    state.throttle = lifting ? 0 : 1
    state.rpmNorm = lifting ? Math.max(0.1, 0.95 - (ph - 7.6) * 0.5) : 0.35 + 0.62 * g
    state.speed = 10 + gear * 14 + g * 12
    if (!lifting && g < 0.02 && gear > 0 && !frame.shifted) {
      audio.sfx('shift', { dir: 1 })
      frame.shifted = true
    }
    if (g > 0.1) frame.shifted = false
  }
  const rpm = c.idle + state.rpmNorm * (c.redline - c.idle)
  audio.updateEngine({
    rpm,
    rpmNorm: state.rpmNorm,
    throttle: state.throttle,
    load: state.throttle,
    speed: state.speed,
    limiter: state.limiter,
    drift: state.drift,
    offroad: state.offroad,
    rumble: state.rumble,
    wind: 0,
    airborne: false,
    camera: state.camera,
  })
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// SFX buttons
for (const name of SFX_NAMES) {
  const b = document.createElement('button')
  b.textContent = name
  b.onclick = () => audio.sfx(name, { pan: (Math.random() - 0.5) * 1.6, speed: 40, intensity: 0.8, dir: 1 })
  $('sfx').appendChild(b)
}

$('selftest').onclick = async () => {
  $('report').textContent = 'running…'
  const r = await window.__audioSelfTest()
  $('report').textContent = JSON.stringify(r, null, 2)
}
$('wav').onclick = async () => {
  const id = $('wavTrack').value
  const buf = await renderTrack(id, { seconds: 30, fromStart: true })
  const blob = new Blob([encodeWav(buf)], { type: 'audio/wav' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${id}.wav`
  a.click()
}
