/**
 * Exercises a deployed Bookhand through the browser's real WebMCP runtime.
 *
 * The e2e suite covers the same ground against a local preview build; this is
 * for the deployment itself, where the answers can differ: the headers are
 * Cloudflare's, and whether storage is persistent depends on the origin.
 *
 * Usage: node scripts/check-live-webmcp.mjs [url]
 *
 * See docs/research/2026-09-01-webmcp-in-playwright.md for why the flag and the
 * JSON-string calling convention are what they are.
 */
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'https://bookhand.dev/'

const browser = await chromium.launch({ args: ['--enable-features=WebMCPTesting'] })
let failed = false
try {
  const page = await browser.newPage()
  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error).split('\n')[0]}`))
  page.on('requestfailed', (request) =>
    problems.push(`request failed: ${request.url().slice(0, 90)} ${request.failure()?.errorText}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 160)}`)
  })

  console.log(`checking ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded' })

  const runtime = await page.evaluate(() => typeof document.modelContext)
  if (runtime !== 'object') throw new Error(`no WebMCP runtime on the page (got ${runtime})`)

  const toolNames = () =>
    page.evaluate(async () => (await document.modelContext.getTools()).map((tool) => tool.name))

  const call = async (name, args) => {
    const raw = await page.evaluate(async ([name, args]) => {
      const tool = (await document.modelContext.getTools()).find((tool) => tool.name === name)
      if (!tool) throw new Error(`no tool ${name}`)
      // The real runtime takes the tool object and a JSON string, and answers
      // with a JSON string.
      return document.modelContext.executeTool(tool, JSON.stringify(args ?? {}))
    }, [name, args])
    const result = JSON.parse(raw)
    return {
      text: result.content.map((part) => part.text).join('\n'),
      structured: result.structuredContent ?? {},
      isError: !!result.isError,
    }
  }

  await page.waitForSelector('.book-open', { timeout: 30_000 })
  console.log('library tools:', (await toolNames()).join(', '))

  const listed = await call('list_books')
  console.log(listed.text)
  const storage = /Storage: (\w+)/.exec(listed.text)?.[1]
  if (storage !== 'persistent') {
    console.log(`NOTE storage is "${storage}", not persistent — the session-only fallback is live`)
  }

  console.log('\n' + (await call('open_book', { title: 'calculus' })).text)
  await page.waitForSelector('.reader-identity', { timeout: 20_000 })

  let reading = []
  for (let attempt = 0; attempt < 20; attempt += 1) {
    reading = await toolNames()
    if (reading.includes('get_reading_context')) break
    await page.waitForTimeout(500)
  }
  if (!reading.includes('get_reading_context')) throw new Error('reading tools never appeared')
  if (!reading.includes('search_book')) throw new Error('deployed build does not expose search_book')
  if (!reading.includes('edit_section')) throw new Error('deployed build does not expose edit_section')
  console.log('reading tools:', reading.join(', '))

  let search
  for (let attempt = 0; attempt < 60; attempt += 1) {
    search = await call('search_book', { query: 'infinitesimal increment', limit: 3 })
    const result = search.structured.search
    if (result?.availability === 'ready') break
    await page.waitForTimeout(500)
  }
  const searchResult = search?.structured.search
  if (search?.isError || searchResult?.availability !== 'ready') {
    throw new Error(`search_book did not become ready (got ${searchResult?.availability ?? 'no result'})`)
  }
  if (searchResult.outcome !== 'results' || !Array.isArray(searchResult.hits) || searchResult.hits.length === 0) {
    throw new Error('search_book returned no corpus-derived result for the live smoke query')
  }
  console.log(
    `live search: ${searchResult.availability} / ${searchResult.outcome} · ${searchResult.hits.length} hit(s)`,
  )

  // Persistence is the question an in-app browser can answer differently.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.book-open, .reader-identity', { timeout: 30_000 })
  const afterReload = await call('list_books')
  console.log('\nafter reload:', afterReload.text.split('\n')[0])
  if (afterReload.text.includes('library is empty')) throw new Error('the library did not survive a reload')

  if (problems.length) {
    failed = true
    console.log('\nproblems:')
    for (const problem of problems.slice(0, 10)) console.log(' -', problem)
  } else {
    console.log('\nno page errors, console errors, or failed requests')
  }
} catch (error) {
  failed = true
  console.error('FAILED:', error instanceof Error ? error.message : error)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
