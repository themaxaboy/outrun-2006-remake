// Shared helpers for the e2e suite. Headless Chromium uses SwiftShader, so everything here is
// about correctness and budgets, never real frame rates.
export const IGNORED = [/KHR_parallel_shader_compile/, /PCFSoftShadowMap/, /GPU stall due to ReadPixels/, /AudioContext was not allowed/, /WebGL: INVALID_ENUM: getParameter/]

export function collectErrors(page) {
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    if (!IGNORED.some((r) => r.test(t))) errors.push(`console: ${t}`)
  })
  return errors
}

export async function waitReady(page, timeout = 120_000) {
  await page.waitForFunction(() => window.__game && window.__game.loop && window.__game.loop.running, null, { timeout })
}

export async function gameState(page) {
  return page.evaluate(() => {
    const g = window.__game
    return {
      state: g.state,
      stage: g.course.stage.id,
      s: g.car.s,
      kmh: g.car.v * 3.6,
      route: g.route.routeString,
      visited: [...g.route.visited],
      result: g.result || null,
      perf: { ...window.__perf.info },
      summary: window.__perf.summary(),
      heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1e6 : 0,
    }
  })
}
