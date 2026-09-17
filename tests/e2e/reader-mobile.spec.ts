import { devices, expect, test, type Page } from '@playwright/test'

/**
 * The reader as a phone actually meets it. Everything here was found by
 * driving a Pixel 7 profile against the production build, and every assertion
 * corresponds to something that was measurably wrong before W3:
 * `VAL-MOBILE-CHROME`, `VAL-MOBILE-GESTURES`, `VAL-MOBILE-PANELS`,
 * `VAL-MOBILE-THEME`, `VAL-MOBILE-ACCESSIBILITY`.
 */
test.use({ ...devices['Pixel 7'] })

async function openChapter(page: Page) {
  await page.goto('/')
  const row = page.locator('.book-open', { hasText: 'Calculus Made Easy' })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await page.getByRole('button', { name: 'Contents', exact: true }).click()
  await page.locator('.toc-item', { hasText: 'CHAPTER V.' }).first().click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const view = document.querySelector('foliate-view') as unknown as {
          renderer?: { getContents?: () => { doc: Document }[] }
        }
        return view?.renderer?.getContents?.()[0]?.doc?.body?.textContent?.length ?? 0
      }),
    )
    .toBeGreaterThan(200)
}

const fraction = (page: Page) =>
  page.evaluate(
    () =>
      (document.querySelector('foliate-view') as unknown as {
        lastLocation?: { fraction: number }
      })?.lastLocation?.fraction ?? -1,
  )

/** Where the tap zones are: the outer quarters, and the middle. */
async function tapAt(page: Page, across: number) {
  const box = await page.locator('.reader-surface').boundingBox()
  if (!box) throw new Error('no book host')
  await page.touchscreen.tap(box.x + box.width * across, box.y + box.height / 2)
  await page.waitForTimeout(800)
}

test('the book gets the whole width of the phone, at every turn', async ({ page }) => {
  await openChapter(page)

  const geometry = () =>
    page.evaluate(() => ({
      viewport: window.innerWidth,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      host: Math.round(document.querySelector('.reader-surface')!.getBoundingClientRect().width),
      rails: getComputedStyle(document.querySelector('.page-step')!).display,
    }))

  const first = await geometry()
  expect(first.overflow).toBe(0)
  // The side rails used to take 21% of the screen for something touch does
  // better; the contract asks for at least 92% at this width.
  expect(first.host / first.viewport).toBeGreaterThanOrEqual(0.92)
  expect(first.rails).toBe('none')

  // The reading column used to take twelve different widths across a book
  // whose figures are wider than the phone. It must now take exactly one.
  const widths = new Set<number>()
  for (let turn = 0; turn < 12; turn += 1) {
    await page.evaluate(() =>
      (document.querySelector('foliate-view') as unknown as { next(): void }).next(),
    )
    await page.waitForTimeout(120)
    widths.add((await geometry()).host)
  }
  expect([...widths]).toEqual([first.host])
})

test('text zoom stays visible in compact chrome', async ({ page }) => {
  await openChapter(page)

  const size = page.locator('.reader-zoom output')
  await expect(page.getByRole('button', { name: 'Decrease text size' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Increase text size' })).toBeVisible()
  const before = Number.parseInt((await size.textContent()) ?? '0', 10)
  await page.getByRole('button', { name: 'Increase text size' }).click()
  await expect(size).toHaveText(`${Math.min(200, before + 10)}%`)

  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    chromeHeight: document.querySelector('.reader-chrome')!.getBoundingClientRect().height,
  }))
  expect(geometry.overflow).toBe(0)
  expect(geometry.chromeHeight).toBeLessThan(80)
})

test('tapping the edges turns the page and tapping the middle recalls the chrome', async ({
  page,
}) => {
  await openChapter(page)
  const reader = page.locator('.reader')

  const start = await fraction(page)
  await tapAt(page, 0.9)
  const forward = await fraction(page)
  expect(forward).toBeGreaterThan(start)

  await tapAt(page, 0.1)
  expect(await fraction(page)).toBeCloseTo(start, 5)

  // A completed page turn lets the chrome recede.
  await expect(reader).toHaveAttribute('data-chrome', 'hidden')

  // The middle half is how it comes back, and it must not turn a page doing it.
  const held = await fraction(page)
  await tapAt(page, 0.5)
  await expect(reader).toHaveAttribute('data-chrome', 'shown')
  expect(await fraction(page)).toBeCloseTo(held, 5)

  await tapAt(page, 0.5)
  await expect(reader).toHaveAttribute('data-chrome', 'hidden')
  expect(await fraction(page)).toBeCloseTo(held, 5)
})

test('the chrome stays while a panel is open, and comes back when it closes', async ({ page }) => {
  await openChapter(page)
  const reader = page.locator('.reader')
  await expect(reader).toHaveAttribute('data-chrome', 'shown')

  await page.getByRole('button', { name: 'Study', exact: true }).click()
  // Well past the idle timeout: a panel is what is in the way, not the chrome.
  await page.waitForTimeout(3_200)
  await expect(reader).toHaveAttribute('data-chrome', 'shown')

  await page.keyboard.press('Escape')
  await expect(reader).toHaveAttribute('data-chrome', 'shown')
})

test('a panel replaces the book, takes focus, and gives it back', async ({ page }) => {
  await openChapter(page)

  for (const name of ['Contents', 'Study', 'Text settings']) {
    const invoker = page.getByRole('button', { name, exact: true })
    await invoker.click()

    const state = await page.evaluate(() => ({
      // Tutor stays mounted while closed so its conversation can survive a
      // panel switch. Count the active surface, not hidden stateful panels.
      headers: document.querySelectorAll('.reader-panel:not([hidden]) .panel-head').length,
      panels: document.querySelectorAll('.reader-panel:not([hidden])').length,
      footerShown: getComputedStyle(document.querySelector('.reader-footer')!).display !== 'none',
      bookShown:
        getComputedStyle(document.querySelector('.reader-book-area')!).visibility !== 'hidden',
      focusedTag: document.activeElement?.tagName,
    }))
    expect(state).toEqual({
      headers: 1,
      panels: 1,
      footerShown: false,
      bookShown: false,
      focusedTag: 'H2',
    })

    // Arrow keys in a panel must not page a book nobody can see.
    const before = await fraction(page)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    expect(await fraction(page)).toBeCloseTo(before, 5)

    await page.keyboard.press('Escape')
    await expect(invoker).toBeFocused()
  }
})

test('every theme reaches the book itself, not only the shell', async ({ page }) => {
  await openChapter(page)

  for (const theme of ['Light', 'Sepia', 'Dark']) {
    await page.getByRole('button', { name: 'Text settings' }).click()
    await page.getByRole('button', { name: theme, exact: true }).click()
    await page.getByRole('button', { name: 'Apply' }).click()
    await page.getByRole('button', { name: 'Close text settings' }).click()

    // The book carried its own copy of the palettes, and they had drifted.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const view = document.querySelector('foliate-view') as unknown as {
            renderer?: { getContents?: () => { doc: Document }[] }
          }
          const doc = view?.renderer?.getContents?.()[0]?.doc
          if (!doc) return { shell: 'a', book: 'b' }
          return {
            shell: getComputedStyle(document.querySelector('.reader')!).backgroundColor,
            book: doc.defaultView!.getComputedStyle(doc.body).backgroundColor,
          }
        }),
      )
      .toEqual(await matchingColours(page))
  }
})

/** Both halves of the comparison come from the page, so the assertion is equality. */
async function matchingColours(page: Page) {
  const shell = await page.evaluate(
    () => getComputedStyle(document.querySelector('.reader')!).backgroundColor,
  )
  return { shell, book: shell }
}

test('the mathematics stays visible in the dark theme', async ({ page }) => {
  await openChapter(page)
  await page.getByRole('button', { name: 'Text settings' }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('button', { name: 'Close text settings' }).click()

  // Every equation in this book is a black glyph image. Unmodified, they are
  // not dim on a dark page — they are invisible.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const view = document.querySelector('foliate-view') as unknown as {
          renderer?: { getContents?: () => { doc: Document }[] }
        }
        const doc = view?.renderer?.getContents?.()[0]?.doc
        const glyph = doc?.querySelector('img[data-tex]')
        return glyph ? doc!.defaultView!.getComputedStyle(glyph).filter : 'no glyph'
      }),
    )
    .toBe('invert(1)')
})

test('Foliate is configured for the phone it is on', async ({ page }) => {
  await openChapter(page)
  expect(
    await page.evaluate(() => {
      const view = document.querySelector('foliate-view')!
      return {
        margin: view.getAttribute('margin'),
        columns: view.getAttribute('max-column-count'),
        animated: view.hasAttribute('animated'),
      }
    }),
  ).toEqual({ margin: '20px', columns: '1', animated: true })
})
