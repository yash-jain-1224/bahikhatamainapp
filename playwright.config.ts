import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Bahi Khata Pro
 * Covers: E2E UI tests + Integration tests (UI ↔ API)
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.e2e.ts', '**/*.integration.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Start local dev servers before running tests */
  webServer: {
    command: 'npm run dev:all',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
