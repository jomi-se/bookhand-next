import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, normalizePath, type Plugin } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
// @ts-expect-error -- build-time only, shared with the unit-test runner.
import { designContextSource } from './scripts/vite-design-context-plugin.mjs'
// @ts-expect-error -- build-time compatibility transform, intentionally plain JS.
import { foliatePersistentFrame } from './scripts/vite-foliate-persistent-frame-plugin.mjs'

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' blob:",
  "img-src 'self' blob: data:",
  "font-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "connect-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join('; ')

/**
 * The development policy, and only the development policy.
 *
 * Vite's React Fast Refresh injects an inline preamble, which the production
 * policy correctly refuses — so `npm run dev` did not boot at all, and the
 * first command anyone runs after cloning failed. Relaxing it here keeps the
 * shipped policy exactly as strict as it was: this never reaches a build, and
 * the preview server, which is what the deployment contract is tested against,
 * still serves the production string.
 */
function relaxForDevelopment(policy: string): string {
  return policy
    .replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
    .replace("connect-src 'self'", "connect-src 'self' ws: wss:")
}

const developmentContentSecurityPolicy = relaxForDevelopment(contentSecurityPolicy)

/**
 * The same relaxation for the meta tag, which the browser enforces alongside
 * the header. The tag is relaxed by rewriting its two directives rather than
 * by substituting the whole policy, because the tag deliberately omits
 * `frame-ancestors` — a directive meta tags cannot express.
 */
function developmentCsp(): Plugin {
  return {
    name: 'bookhand-development-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return relaxForDevelopment(html)
    },
  }
}

const testControlModuleId = 'virtual:bookhand-test-controls'
const resolvedTestControlModuleId = `\0${testControlModuleId}`
const workerTestControlModuleId = 'virtual:bookhand-worker-test-controls'
const resolvedWorkerTestControlModuleId = `\0${workerTestControlModuleId}`

function testControlBoundary(mode: string): Plugin {
  return {
    name: 'bookhand-test-control-boundary',
    resolveId(id) {
      if (id === testControlModuleId) return resolvedTestControlModuleId
      if (id === workerTestControlModuleId) return resolvedWorkerTestControlModuleId
    },
    load(id) {
      if (id === resolvedWorkerTestControlModuleId) {
        if (mode !== 'test-harness') return 'export const createStorageRuntimeHooks = () => ({})'
        const workerImplementation = normalizePath(
          resolve('tests/support/browser-worker-test-controls.ts'),
        )
        return `export { createStorageRuntimeHooks } from ${JSON.stringify(`/@fs/${workerImplementation}`)}`
      }
      if (id !== resolvedTestControlModuleId) return
      if (mode !== 'test-harness') {
        return 'export const prepareRuntimePorts = ports => ports; export const prepareStorageClient = client => client; export const prepareReaderOptions = options => options'
      }

      const implementation = normalizePath(
        resolve('tests/support/browser-test-controls.ts'),
      )
      return `export { prepareRuntimePorts, prepareStorageClient, prepareReaderOptions } from ${JSON.stringify(`/@fs/${implementation}`)}`
    },
  }
}

// https://vite.dev/config/
// `BOOKHAND_BASE` lets the same build serve from a subpath, such as a GitHub
// Pages project site, without any path being hard-coded in the application.
export default defineConfig(({ mode }) => ({
  base: process.env.BOOKHAND_BASE ?? '/',
  // This static deep import would otherwise be pre-bundled before the
  // fail-closed persistent-document lifetime transform can inspect it.
  optimizeDeps: { exclude: ['foliate-js/view.js'] },
  plugins: [
    foliatePersistentFrame(),
    react(),
    developmentCsp(),
    testControlBoundary(mode),
    designContextSource(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm',
          dest: 'assets',
          rename: { stripBase: true },
        },
        {
          src: 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-opfs-async-proxy.js',
          dest: 'assets',
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  // Workers are bundled in a separate plugin pipeline. Keep the test-only
  // index fault hooks behind the same mode boundary as the window controls.
  worker: {
    plugins: () => [testControlBoundary(mode)],
  },
  server: {
    headers: { 'Content-Security-Policy': developmentContentSecurityPolicy },
    allowedHosts: ['.ts.net'],
  },
  // The preview server is the honest one to test against: it serves the real
  // build under the real CSP. `.ts.net` is allowed so a phone on the same
  // tailnet can reach it over HTTPS during development.
  preview: {
    headers: { 'Content-Security-Policy': contentSecurityPolicy },
    allowedHosts: ['.ts.net'],
  },
}))
