import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

// Short-lived isolated fixture: no existing preview, provider, auth or user tab.
// Execute the actual Vite production entry through page navigation, not CDP
// evaluation (which can bypass CSP). Observe before any application script runs.
const root = resolve('dist')
const headers = await readFile(resolve(root, '_headers'), 'utf8')
const policy = headers.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1]
assert.ok(policy?.includes("script-src 'self' 'wasm-unsafe-eval'"))
assert.ok(!policy.includes("'unsafe-eval'"))
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.epub': 'application/epub+zip', '.json': 'application/json',
}
const server = createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', policy)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  const pathname = new URL(request.url, 'http://fixture.invalid').pathname
  if (pathname === '/__csp-control.html') {
    response.setHeader('Content-Type', 'text/html')
    response.end('<!doctype html><script src="/__csp-control.js"></script>')
    return
  }
  if (pathname === '/__csp-control.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end('try { new Function("return 1")() } catch {}')
    return
  }
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end()
    return
  }
  try {
    const contents = await readFile(file)
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream')
    response.end(contents)
  } catch {
    response.writeHead(404).end()
  }
})

let browser
try {
  await new Promise((accept, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', accept)
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch()
  const context = await browser.newContext(process.argv.includes('--phone')
    ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }
    : {})
  const externalRequests = []
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      externalRequests.push(route.request().url())
      return route.abort()
    }
    return route.continue()
  })
  await context.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push({
        directive: event.effectiveDirective, blocked: event.blockedURI,
      })
    })
  })
  const control = await context.newPage()
  await control.goto(`${origin}/__csp-control.html`)
  await control.waitForFunction(() => window.__cspViolations.some(
    (event) => event.blocked === 'eval' && event.directive.startsWith('script-src'),
  ))
  await control.close()

  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const response = await page.goto(origin)
  assert.equal(response.status(), 200)
  await page.getByRole('heading', { name: 'Library', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'All books', exact: true }).waitFor()
  // CSP violations are dispatched asynchronously, even for caught probes.
  await page.waitForTimeout(200)
  assert.deepEqual(await page.evaluate(() => window.__cspViolations), [])
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(externalRequests, [])
  console.log('Production CSP verified: blocked-eval control detected; real app imports and library initialization have zero violations/errors')
} finally {
  await browser?.close()
  await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()))
}
