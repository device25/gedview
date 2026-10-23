import {defineConfig, devices} from '@playwright/test';

// PW_PORT lets several checkouts run the suite at the same time.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'ru-RU',
    trace: 'on-first-retry',
  },
  expect: {
    toHaveScreenshot: {maxDiffPixelRatio: 0.001, animations: 'disabled'},
  },
  projects: [
    {
      name: 'e2e',
      testMatch: 'e2e/**/*.spec.ts',
      // The chart header holds the scope controls: a laptop-sized window.
      use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}},
    },
    {
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}},
    },
  ],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  },
});
