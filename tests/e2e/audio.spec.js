// Audio self-test in a real browser: renders every music track, the engine (worklet and
// fallback) at several rpms, the surface loops and every sfx with an OfflineAudioContext and
// checks the signal is present, finite and not clipping.
//
// window.__audioSelfTest is exposed by src/audio/audio.js (lazily) as soon as the game imports
// the audio module, and by the dev bench page /src/audio/dev/audio-test.html (dev server only).
// Set AUDIO_E2E_BASE_URL to point the spec at a dev server, e.g. http://localhost:5173.
import { test, expect } from '@playwright/test'

test.use({ baseURL: process.env.AUDIO_E2E_BASE_URL || 'http://localhost:4173' })

const CANDIDATES = ['/', '/src/audio/dev/audio-test.html']

async function findSelfTest(page) {
  for (const url of CANDIDATES) {
    const resp = await page.goto(url).catch(() => null)
    if (!resp || !resp.ok()) continue
    const found = await page
      .waitForFunction(() => typeof window.__audioSelfTest === 'function', null, { timeout: 8000 })
      .then(
        () => true,
        () => false,
      )
    if (found) return url
  }
  return null
}

test('audio self-test: music, engine and sfx render cleanly', async ({ page }) => {
  test.setTimeout(180_000)
  const url = await findSelfTest(page)
  test.skip(!url, 'window.__audioSelfTest is not exposed by this build (audio module not loaded)')

  // One retry in case a dev-server reload navigates the page mid-run.
  let report
  for (let attempt = 0; attempt < 2 && !report; attempt++) {
    try {
      report = await page.evaluate(() => window.__audioSelfTest())
    } catch (e) {
      if (attempt || !/context was destroyed|navigation/i.test(String(e))) throw e
      await findSelfTest(page)
    }
  }
  expect(report.errors).toEqual([])

  const kinds = (k) => report.results.filter((r) => r.kind === k)
  expect(kinds('music').map((r) => r.name).sort()).toEqual(['coastline', 'lastWave', 'splitHorizon'])
  expect(kinds('engine').length).toBeGreaterThanOrEqual(8)
  expect(kinds('sfx').length).toBeGreaterThanOrEqual(22)
  expect(kinds('loops').length).toBe(1)
  // the worklet path must be the one exercised when AudioWorklet is available
  expect(kinds('engine').some((r) => r.impl === 'worklet')).toBe(true)

  for (const r of report.results) {
    const label = `${r.kind}:${r.name}`
    expect(r.nan, `${label} has NaN/Inf samples`).toBe(0)
    expect(r.rms, `${label} is silent`).toBeGreaterThan(0.001)
    expect(r.peak, `${label} clips`).toBeLessThanOrEqual(1.2)
  }
  expect(report.ok).toBe(true)
})
