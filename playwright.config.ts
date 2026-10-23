import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL: 'http://localhost:4173',
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
      use: {...devices['Desktop Chrome']},
    },
    {
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      use: {...devices['Desktop Chrome'], viewport: {width: 1440, height: 900}},
    },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
