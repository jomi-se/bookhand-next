import { expect, test, type Page } from '@playwright/test'

/**
 * The companion to `webmcp-agent.spec.ts`, deliberately without the
 * `WebMCPTesting` switch: this is the ordinary browser a person uses, where no
 * agent runtime exists at all. WebMCP is an addition to Bookhand, never a
 * dependency, so the reader must be whole here.
 */

async function openBook(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
  const row = page.locator('.book-open', { hasText: 'Calculus Made Easy' })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
}

test('the reader is unchanged when no agent runtime exists', async ({ page }) => {
  await openBook(page)
  expect(await page.evaluate(() => 'modelContext' in document)).toBe(false)

  await page.getByRole('button', { name: 'Study' }).click()
  await page.getByRole('button', { name: 'Add study block' }).click()
  await expect(page.getByRole('button', { name: /quotation/i })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Study' })).not.toContainText(
    'Agent activity',
  )
})

test('desktop reading controls stay visible and keyboard paging survives focused chrome', async ({
  page,
}) => {
  await openBook(page)

  const size = page.locator('.reader-zoom output')
  const beforeSize = Number.parseInt((await size.textContent()) ?? '', 10)
  await page.getByRole('button', { name: 'Increase text size' }).click()
  await expect(size).toHaveText(`${Math.min(200, beforeSize + 10)}%`)

  await page.getByRole('button', { name: 'Text settings' }).click()
  await page.getByRole('button', { name: 'Single', exact: true }).click()
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.getByRole('button', { name: 'Close text settings' }).click()
  await expect(page.locator('foliate-view')).toHaveAttribute('max-column-count', '1')

  const fraction = () =>
    page.evaluate(
      () =>
        (document.querySelector('foliate-view') as unknown as {
          lastLocation?: { fraction?: number }
        })?.lastLocation?.fraction ?? -1,
    )
  const next = page.getByRole('button', { name: 'Next page' })
  await next.click()
  const afterClick = await fraction()

  // The click leaves focus on the page button. ArrowRight must still work;
  // this is the ordinary keyboard sequence, not a body-focus test shortcut.
  await page.keyboard.press('ArrowRight')
  await expect.poll(fraction).toBeGreaterThan(afterClick)
  await page.waitForTimeout(500)
  const afterArrow = await fraction()
  await expect(next).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect.poll(fraction).toBeLessThan(afterArrow)
})
