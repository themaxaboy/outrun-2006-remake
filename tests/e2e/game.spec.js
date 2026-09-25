import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import { collectErrors, waitReady, gameState } from './helpers.js'

const budgets = JSON.parse(fs.readFileSync(new URL('../../bench/budgets.json', import.meta.url)))

test('boots to the title screen without errors', async ({ page }) => {
  const errors = collectErrors(page)
  await page.goto('/')
  await waitReady(page)
  await expect(page.locator('.title-screen h1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible()
  await page.waitForTimeout(2000)
  const st = await gameState(page)
  expect(st.state).toBe('attract')
  expect(errors).toEqual([])
})

test('menu flow: title → mode → car → music → race → pause → quit', async ({ page }) => {
  test.setTimeout(240_000)
  const errors = collectErrors(page)
  await page.goto('/?preset=low')
  await waitReady(page)
  await page.getByRole('button', { name: 'Start Game' }).click()
  await page.locator('.card', { hasText: 'OutRun' }).click()
  await expect(page.locator('.car-screen')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).toBe('showroom')
  await page.locator('.car-screen .go').click()
  await expect(page.locator('.radio')).toBeVisible()
  await page.locator('.track', { hasText: 'No music' }).click()
  await expect.poll(() => page.evaluate(() => window.__game.state), { timeout: 60_000 }).toMatch(/countdown|race/)
  await expect(page.locator('.hud')).toBeVisible()
  await page.evaluate(() => window.__game.pause())
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.getByRole('button', { name: 'Quit to Title' }).click()
  await expect(page.locator('.title-screen')).toBeVisible()
  expect(errors).toEqual([])
})

test('autopilot drives LRLR through four forks to goal C (virtual time)', async ({ page }) => {
  test.setTimeout(420_000)
  const errors = collectErrors(page)
  await page.goto('/?autotest&ff=100&preset=low&route=LRLR&notraffic')
  await waitReady(page)
  let geoAtStage3 = null
  let heapStart = null
  for (let i = 0; i < 150; i++) {
    await page.waitForTimeout(2500)
    const st = await gameState(page)
    heapStart ??= st.heapMB
    if (st.visited.length === 3 && geoAtStage3 === null) geoAtStage3 = st.perf.geometries
    if (st.visited.length === 5 && st.s > 3000) {
      // no geometry/texture leak: pools plateau once a fork has been streamed
      expect(st.perf.geometries).toBeLessThanOrEqual(Math.ceil(geoAtStage3 * 1.1) + 6)
      if (st.heapMB && heapStart) expect(st.heapMB - heapStart).toBeLessThan(30)
    }
    if (['goal', 'gameover', 'timeup'].includes(st.state)) break
  }
  const st = await gameState(page)
  expect(st.visited).toEqual(['0-0', '1-0', '2-1', '3-1', '4-2'])
  expect(st.state).toBe('goal')
  expect(st.result.goalCol).toBe(2)
  expect(errors).toEqual([])
})

for (const preset of ['low', 'high']) {
  test(`renderer budgets hold on ${preset} (traffic, stage 1)`, async ({ page }) => {
    test.setTimeout(180_000)
    const errors = collectErrors(page)
    await page.goto(`/?autotest&ff=8&preset=${preset}&s=2000`)
    await waitReady(page)
    await page.waitForTimeout(15_000)
    const st = await gameState(page)
    const b = budgets[preset]
    expect(st.perf.maxCalls).toBeLessThanOrEqual(b.calls)
    expect(st.perf.maxTriangles).toBeLessThanOrEqual(b.triangles)
    expect(st.summary.upd95).toBeLessThan(b.updateMs95 * 4) // SwiftShader shares the CPU; keep a loose bound
    expect(errors).toEqual([])
  })
}
