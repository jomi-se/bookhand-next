import { expect, test, type Page } from '@playwright/test'

test.use({ launchOptions: { args: ['--enable-features=WebMCPTesting'] } })

interface SearchToolResult {
  readonly content: { readonly text: string }[]
  readonly structuredContent?: {
    readonly ok?: boolean
    readonly search?: {
      readonly availability?: 'unavailable' | 'partial' | 'ready'
      readonly outcome?: 'results' | 'no-results'
      readonly hits?: readonly { readonly text?: string; readonly startCfi?: string; readonly sectionIndex?: number }[]
    }
  }
  readonly isError?: boolean
}

async function callTool(page: Page, name: string, input: unknown): Promise<SearchToolResult> {
  return page.evaluate(async ([toolName, args]) => {
    const context = document.modelContext
    if (!context) throw new Error('WebMCP is unavailable')
    const tool = (await context.getTools()).find((candidate) => candidate.name === toolName)
    if (!tool) throw new Error(`Missing tool: ${toolName}`)
    return JSON.parse(await context.executeTool(tool, JSON.stringify(args))) as SearchToolResult
  }, [name, input] as const)
}

async function currentSection(page: Page): Promise<number | undefined> {
  const reading = await callTool(page, 'get_reading_context', {})
  const structured = reading.structuredContent as {
    readingContext?: { sectionIndex?: number }
  }
  return structured.readingContext?.sectionIndex
}

async function openBook(page: Page, title: string) {
  await page.goto('/')
  const row = page.locator('.book-open', { hasText: title })
  await expect(row).toBeVisible({ timeout: 20_000 })
  await row.click()
  await expect(page.locator('.reader')).toBeVisible()
  await expect
    .poll(() => page.evaluate(async () => (await document.modelContext?.getTools())?.map((tool) => tool.name) ?? []))
    .toContain('search_book')
}

test('ordinary Search and genuine WebMCP share bounded, non-navigating book retrieval', async ({ page }) => {
  await openBook(page, 'Calculus Made Easy')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Search this book' })).toBeVisible()
  await expect(page.getByLabel('Words or phrase')).toHaveAttribute('maxlength', '300')

  await page.getByLabel('Words or phrase').fill('zxqvplmn')
  await page.getByRole('button', { name: 'Search', exact: true }).last().click()
  await expect(page.getByText(/No passages found|Search is not ready yet/)).toBeVisible()

  const empty = await callTool(page, 'search_book', { query: '   ' })
  expect(empty.isError).toBe(true)
  expect(empty.structuredContent).toMatchObject({ ok: false })

  await expect
    .poll(async () => {
      const result = await callTool(page, 'search_book', { query: 'calculus', limit: 5 })
      return result.structuredContent?.search?.hits?.length ?? 0
    }, { timeout: 30_000 })
    .toBeGreaterThan(0)

  const before = await currentSection(page)
  const result = await callTool(page, 'search_book', { query: 'calculus', limit: 5 })
  expect(result.isError).not.toBe(true)
  expect(result.structuredContent).toMatchObject({
    ok: true,
    search: {
      availability: expect.stringMatching(/partial|ready/),
      outcome: expect.stringMatching(/results|no-results/),
      hits: expect.any(Array),
    },
  })
  expect(await currentSection(page)).toBe(before)

  await page.getByLabel('Words or phrase').fill('calculus')
  await page.getByRole('button', { name: 'Search', exact: true }).last().click()
  const firstHit = page.locator('.search-results button').first()
  await expect(firstHit).toBeVisible({ timeout: 20_000 })
  const expectedSection = Number.parseInt((await firstHit.getAttribute('data-section-index')) ?? '', 10)
  expect(Number.isInteger(expectedSection)).toBe(true)
  await firstHit.click()
  await expect.poll(() => currentSection(page)).toBe(expectedSection)
})

test('a bundled book becomes searchable automatically after it is opened', async ({ page }) => {
  await openBook(page, 'Flatland')

  await expect
    .poll(async () => {
      const result = await callTool(page, 'search_book', { query: 'Spaceland', limit: 5 })
      return result.structuredContent?.search
    }, { timeout: 30_000 })
    .toMatchObject({
      availability: expect.stringMatching(/partial|ready/),
      outcome: 'results',
      hits: expect.arrayContaining([
        expect.objectContaining({ text: expect.stringMatching(/Spaceland/i) }),
      ]),
    })
})
