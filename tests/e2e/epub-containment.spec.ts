import { expect, test } from '@playwright/test'

const configuredOrigin = (baseURL: string | undefined) =>
  new URL(baseURL ?? 'http://127.0.0.1:4173').origin

/**
 * Drives the malicious sentinel corpus through the real production build.
 *
 * Note what is asserted. A blocked request still raises a request event, so
 * counting attempts would be misleading in both directions: it fails when the
 * policy is working, and it would pass if a book only ever exfiltrated through
 * a channel Playwright reports late. What matters is that no off-origin request
 * ever completed, and that each was refused by policy rather than by a failure
 * to resolve `bookhand.invalid`, which would prove nothing about a real host.
 */
test('an imported book cannot script, exfiltrate, or reach the application', async ({ page, baseURL }) => {
  const origin = configuredOrigin(baseURL)
  const offOriginFailures = new Map<string, string>()
  const offOriginResponses: string[] = []
  const isLocal = (url: string) =>
    url.startsWith(origin) || url.startsWith(`blob:${origin}`) || url.startsWith('data:')

  page.on('requestfailed', (request) => {
    if (!isLocal(request.url())) {
      offOriginFailures.set(request.url(), request.failure()?.errorText ?? 'unknown')
    }
  })
  page.on('response', (response) => {
    if (!isLocal(response.url())) offOriginResponses.push(response.url())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()

  await page.locator('input[type=file]').setInputFiles('tests/fixtures/epub/malicious-book.epub')

  const row = page.locator('.book-open', { hasText: 'Bookhand Malicious Sentinel Corpus' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()

  // Containment that erased ordinary packaged content would be a broken reader,
  // not a safe one, so the readable sentinel must survive.
  const bookText = () =>
    page.evaluate(() => {
      const view = document.querySelector('foliate-view') as unknown as {
        renderer?: { getContents?: () => { doc: Document }[] }
      }
      return view?.renderer?.getContents?.()[0]?.doc?.body?.textContent ?? ''
    })
  await expect.poll(bookText, { timeout: 15_000 }).toContain('blocked attacks did not erase')

  // Neither the packaged script nor the inline script reached the application.
  expect(
    await page.evaluate(() => document.documentElement.dataset.bookhandParentMutation),
  ).toBeUndefined()

  // The top-navigation and popup sentinels did not move the reader anywhere.
  expect(page.url().startsWith(origin)).toBe(true)
  expect(page.context().pages()).toHaveLength(1)

  // Nothing off-origin ever completed, and every attempt was refused by policy.
  expect(offOriginResponses).toEqual([])
  expect([...offOriginFailures.keys()].length).toBeGreaterThan(0)
  for (const [url, reason] of offOriginFailures) {
    expect(reason, `${url} was refused for ${reason}, not by policy`).toBe('csp')
  }
})

/**
 * VAL-LOCAL-FIRST: reading must work with every non-origin route severed, so
 * the claim "nothing leaves your browser" is a property of the product rather
 * than a description of what happens to be reachable during a demo.
 */
test('the bundled book reads with every non-origin route severed', async ({ page, baseURL }) => {
  const origin = configuredOrigin(baseURL)
  await page.route('**', (route) => {
    const url = route.request().url()
    const local =
      url.startsWith(origin) || url.startsWith(`blob:${origin}`) || url.startsWith('data:')
    return local ? route.continue() : route.abort()
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()

  const row = page.locator('.book-open', { hasText: 'Calculus Made Easy' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()

  const bookText = () =>
    page.evaluate(() => {
      const view = document.querySelector('foliate-view') as unknown as {
        renderer?: { getContents?: () => { doc: Document }[] }
      }
      return view?.renderer?.getContents?.()[0]?.doc?.body?.textContent ?? ''
    })
  await expect.poll(bookText, { timeout: 20_000 }).not.toBe('')

  // Navigation and the footer keep working with no network at all.
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect(page.locator('.toc-item').first()).toBeVisible()
  await page.locator('.toc-item', { hasText: 'CHAPTER X.' }).first().click()
  await expect(page.locator('.reader-identity')).toContainText('CHAPTER X')
})
