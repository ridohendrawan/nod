import { defineConfig, devices } from '@playwright/test'

// E2E_BASE_URL points the suite at a deployed build (for example the public URL).
// Without it, the suite starts (or reuses) the dev server on 5173.
const deployed = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  // Data is local (D91), so waits are short; the first load of a dev server compiles on demand.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: deployed ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      // A phone-sized Chromium (the plan's 390 x 844). Playwright's WebKit isn't iOS Safari,
      // so the iPhone checks stay on a real device (M6).
      name: 'phone',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: deployed
    ? undefined
    : { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
