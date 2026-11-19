import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests for the main flows. They run against the built app with no vault configured unless
 * VITE_VAULT_ADDRESS points at a local fork, so they cover what needs no chain: landing, navigation,
 * demo-mode wallet, payroll form validation, the assistant parser and the safety page.
 *
 *   pnpm --filter @paystream/web exec playwright install chromium   # once
 *   pnpm --filter @paystream/web e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
