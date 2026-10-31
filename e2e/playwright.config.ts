import { defineConfig } from '@playwright/test';

/**
 * Browser tests against a running stack: web on E2E_WEB_URL (default http://localhost:3000)
 * talking to the API and a database that globalSetup seeds. Uses the installed Google Chrome,
 * so no browser download is needed locally or on GitHub's runners.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
