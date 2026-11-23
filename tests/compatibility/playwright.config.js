// Cross-browser / cross-device compatibility tests.
//   First time only:  npx playwright install
//   Run all:          npm run test:compat
//   One browser:      npm run test:compat -- --project=firefox
//   See report:       npx playwright show-report test-results/compat-report
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '*.compat.spec.js',
  timeout: 60_000,
  retries: 1,
  outputDir: '../../test-results/compat-artifacts',
  reporter: [['list'], ['html', { outputFolder: '../../test-results/compat-report', open: 'never' }]],
  use: {
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    // Desktop browsers
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    // Phones and tablet
    { name: 'android-phone', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
    // Microsoft Edge uses the Edge already installed on Windows.
    // On a computer without Edge, skip it with:  set COMPAT_EDGE=0
    ...(process.env.COMPAT_EDGE === '0' ? [] : [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }]),
  ],
});
