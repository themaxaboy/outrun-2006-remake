// Deterministic fly-through benchmark: autopilot across a stage per preset, reporting
// draw calls, triangles and CPU update time. Writes bench/results.json.
import { test } from '@playwright/test'
import fs from 'node:fs'
import { waitReady, gameState } from './helpers.js'

const results = {}
test.describe.configure({ mode: 'serial' })

for (const preset of ['low', 'medium', 'high', 'ultra']) {
  for (const stage of ['0-0', '2-1', '4-1']) {
    test(`bench ${preset} ${stage}`, async ({ page }) => {
      test.setTimeout(180_000)
      await page.goto(`/?bench&ff=6&preset=${preset}&stage=${stage}&s=1500`)
      await waitReady(page)
      await page.waitForTimeout(3000)
      await page.evaluate(() => window.__perf.reset())
      await page.waitForTimeout(12_000)
      const st = await gameState(page)
      results[`${preset}/${stage}`] = {
        maxCalls: st.perf.maxCalls,
        maxTriangles: st.perf.maxTriangles,
        geometries: st.perf.geometries,
        textures: st.perf.textures,
        programs: st.perf.programs,
        updateP95ms: +st.summary.upd95.toFixed(2),
        softwareFps: +st.summary.fps.toFixed(1), // SwiftShader — NOT representative of GPU hardware
      }
    })
  }
}

test.afterAll(() => {
  fs.mkdirSync('bench', { recursive: true })
  fs.writeFileSync('bench/results.json', JSON.stringify(results, null, 2))
  console.table(results)
})
