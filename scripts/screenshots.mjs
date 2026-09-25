// Captures the README showcase screenshots from a running build (npm run build && npm run preview).
//   node scripts/screenshots.mjs [name ...]      (BASE_URL defaults to http://localhost:4173)
// Headless Chromium renders through SwiftShader: slow, but the output matches a GPU render.
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const OUT = 'docs/screenshots'
const W = 1600
const H = 900

const SHOTS = [
  { name: 'sunset-coast', q: 'stage=4-2&s=2400&v=200&car=aurora&notraffic', settle: 6 },
  { name: 'drift', q: 'stage=2-0&v=190&car=nebula&notraffic', paint: '#ff6a00', drift: true },
  { name: 'fork', q: 'stage=0-0&s=4700&v=190&car=vento&route=R', paint: '#2a9d8f', settle: 6 },
  { name: 'night-city', q: 'stage=4-1&s=2400&v=190&car=nebula', paint: '#e8e8e8', settle: 8 },
]

const only = process.argv.slice(2)
const url = (q) => `${BASE}/?autotest&preset=high&${q}`

async function ready(page, minFrames = 4) {
  await page.waitForFunction(() => window.__game?.loop?.running, null, { timeout: 180_000 })
  await page.waitForFunction((n) => window.__game.chunks.complete && window.__game.frameNo > n, minFrames, { timeout: 180_000 })
}

async function framesLater(page, n) {
  const f0 = await page.evaluate(() => window.__game.frameNo)
  await page.waitForFunction((t) => window.__game.frameNo >= t, f0 + n, { timeout: 300_000 })
}

/** s just before the first tight bend on a stage, so the autopilot brake-taps into a slide. */
async function findBend(page) {
  return page.evaluate(() => {
    const c = window.__game.course
    for (let i = Math.floor(600 / 2); i < c.n - 100; i++) if (Math.abs(c.kp[i]) > 1 / 300) return Math.max(400, i * 2 - 170)
    return 1200
  })
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
fs.mkdirSync(OUT, { recursive: true })

for (const shot of SHOTS) {
  if (only.length && !only.includes(shot.name)) continue
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  page.on('pageerror', (e) => console.error(`[${shot.name}] pageerror:`, e.message))
  let q = `ff=2&${shot.q}`
  if (shot.drift) {
    // locate a tight bend first, then start 170 m before it
    await page.goto(url(`ff=2&${shot.q}&s=300`))
    await ready(page, 1)
    q = `ff=3&${shot.q}&s=${await findBend(page)}`
  }
  await page.goto(url(q))
  await ready(page)
  if (shot.paint) await page.evaluate((c) => window.__game.rig.setPaint(c), shot.paint)
  if (shot.drift) {
    // wait for a proper powerslide (angle + some smoke/skid build-up); seed one if the AI hasn't slid
    const t0 = Date.now()
    let ok = false
    while (Date.now() - t0 < 240_000) {
      ok = await page.evaluate(() => {
        const car = window.__game.car
        return car.fsm === 2 && Math.abs(car.beta) > 0.3 && car.driftTime > 0.55
      })
      if (ok) break
      const idle = await page.evaluate(() => window.__game.car.fsm === 0 && window.__game.car.v > 40)
      if (idle && Date.now() - t0 > 120_000) {
        await page.evaluate(() => {
          const g = window.__game, car = g.car
          const k = g.course.sample(car.s + 40).k
          car.fsm = 1; car.fsmT = 0; car.driftDir = k >= 0 ? 1 : -1; car.driftTime = 0; car.beta = car.driftDir * 0.2
        })
      }
      await page.waitForTimeout(300)
    }
    if (!ok) console.warn('[drift] no natural drift captured — using the latest frame')
  } else {
    await framesLater(page, shot.settle || 6)
  }
  const file = `${OUT}/${shot.name}.jpg`
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 })
  const st = await page.evaluate(() => ({ stage: window.__game.course.stage.id, s: Math.round(window.__game.car.s), fsm: window.__game.car.fsm }))
  console.log(`✓ ${file}`, JSON.stringify(st), `${Math.round(fs.statSync(file).size / 1024)} KB`)
  await page.close()
}

await browser.close()
