import { expect, test } from '@playwright/test'

const testControlNames = [
  'force-opfs-initialization-failure',
  'delay-stale-open',
  'leave-book-open-unresolved',
  'leave-library-list-unresolved',
  'fail-library-list-immediately',
  'fail-section-load',
  'dump-raw-state',
  'indexPauseAfterCommittedBatch',
  'indexFailBeforeChunk',
] as const
test('production cannot activate validation-only controls', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin
  const consoleErrors: string[] = []
  const offOriginRequests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  // Book covers are rendered from same-origin blob URLs, which never leave the
  // browser. Only a genuinely non-origin destination counts as an escape.
  const isLocal = (url: string) =>
    url.startsWith(origin) ||
    url.startsWith(`blob:${origin}`) ||
    url.startsWith('data:')
  page.on('request', (request) => {
    if (!isLocal(request.url())) offOriginRequests.push(request.url())
  })

  const response = await page.goto(
    `/?${testControlNames.map((name) => `${name}=1`).join('&')}`,
  )
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
  // The bundled book must reach the catalog through the real worker, so this
  // also proves the production path runs with every control name attempted.
  await expect(page.getByRole('heading', { name: 'All books' })).toBeVisible()

  const policy = response?.headers()['content-security-policy'] ?? ''
  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'")
  expect(policy).toContain("connect-src 'self'")
  expect(policy).toContain("object-src 'none'")
  expect(policy).toContain("form-action 'none'")
  expect(policy).toContain("frame-ancestors 'self'")

  const result = await page.evaluate((names) => {
    for (const name of names) {
      window.postMessage({ type: name, enabled: true }, location.origin)
      window.dispatchEvent(new CustomEvent(name, { detail: { enabled: true } }))
    }
    const testWindow = window as typeof window & {
      __BOOKHAND_TEST_CONTROLS__?: unknown
    }
    return {
      global: testWindow.__BOOKHAND_TEST_CONTROLS__,
      dataset: { ...document.documentElement.dataset },
    }
  }, testControlNames)

  expect(result.global).toBeUndefined()
  expect(result.dataset).toEqual({})
  expect(offOriginRequests).toEqual([])
  expect(consoleErrors).toEqual([])
})
