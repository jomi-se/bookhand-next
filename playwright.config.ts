import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.BOOKHAND_E2E_PORT ?? '4173'
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/playwright',
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The mobile suite sets its own device profile, so it would otherwise
      // run twice with the desktop one fighting it.
      testIgnore: /reader-mobile\.spec\.ts/,
    },
    {
      name: 'pixel-7',
      testMatch: /reader-mobile\.spec\.ts/,
    },
  ],
})
