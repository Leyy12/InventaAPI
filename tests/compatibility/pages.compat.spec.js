// Checks that each page opens and displays correctly in every browser/device
// listed in playwright.config.js.
//
// The API (npm start, port 5000) must be running. Dashboard pages (port 3000)
// run only if the dashboard is also running (cd dashboard && npm run dev);
// otherwise they are skipped.
import { test, expect } from '@playwright/test';

const API_URL = process.env.API_URL || 'http://localhost:5000';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';

async function reachable(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(3000) }); return true; } catch { return false; }
}

// Opens a page and collects JavaScript errors that happen while it loads.
async function openPage(page, url) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'load' });
  return { response, errors };
}

async function expectNoHorizontalScroll(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen (horizontal scrolling)').toBeLessThanOrEqual(1);
}

test.describe('API server pages', () => {
  test.beforeAll(async () => {
    test.skip(!(await reachable(API_URL)), `API is not running at ${API_URL}. Start it with "npm start".`);
  });

  // public/index.html (served at / and /developer) sends the browser to the dashboard.
  test('developer page redirects to the dashboard', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Answer for the dashboard so this test works even when it is not running.
    await page.route(`${DASHBOARD_URL}/**`, route => route.fulfill({ contentType: 'text/html', body: '<h1>dashboard</h1>' }));
    await page.goto(`${API_URL}/developer`);
    await page.waitForURL(`${DASHBOARD_URL}/**`);
    expect(page.url().startsWith(DASHBOARD_URL)).toBe(true);
    expect(errors, 'JavaScript errors on the page').toEqual([]);
  });

  test('API info returns JSON in the browser', async ({ page }) => {
    const response = await page.goto(`${API_URL}/api`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(await response.json()).toHaveProperty('version');
  });

  test('security headers are sent', async ({ page }) => {
    const response = await page.goto(`${API_URL}/developer`);
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toBeTruthy();
  });
});

test.describe('Customer dashboard pages', () => {
  test.beforeAll(async () => {
    test.skip(!(await reachable(DASHBOARD_URL)), `Dashboard is not running at ${DASHBOARD_URL}. Start it with "cd dashboard && npm run dev".`);
  });

  for (const path of ['/', '/login', '/signup', '/docs', '/contact', '/privacy-policy', '/terms-of-service']) {
    test(`${path} loads and fits the screen`, async ({ page }) => {
      const { response, errors } = await openPage(page, `${DASHBOARD_URL}${path}`);
      expect(response.status(), `${path} returned an error status`).toBeLessThan(400);
      await expect(page.locator('body')).toBeVisible();
      expect((await page.locator('body').innerText()).trim().length, 'page is blank').toBeGreaterThan(0);
      await expectNoHorizontalScroll(page);
      expect(errors, 'JavaScript errors on the page').toEqual([]);
    });
  }

  test('login form can be typed into', async ({ page }) => {
    await page.goto(`${DASHBOARD_URL}/login`);
    const email = page.locator('input[type="email"]').first();
    await expect(email).toBeVisible();
    await email.fill('compat-test@example.com');
    await expect(email).toHaveValue('compat-test@example.com');
  });
});
