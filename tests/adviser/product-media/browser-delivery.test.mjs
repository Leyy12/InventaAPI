import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mediaHttpFixture, browserPageFixture } from './http-fixture.mjs';

const beforeFix = process.env.PRODUCT_MEDIA_TEST_BEFORE === 'true';
for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }])
  test(`real two-origin Chromium image delivery ${viewport.width}px`, { timeout: 45000 }, async () => {
    const api = await mediaHttpFixture(); let browser, pageServer;
    try {
      pageServer = await browserPageFixture(api.origin, api.imagePath);
      assert.notEqual(api.origin, pageServer.origin);
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport });
      await context.route('**/*', route => {
        const origin = new URL(route.request().url()).origin;
        return [api.origin, pageServer.origin].includes(origin) ? route.continue() : route.abort();
      });
      const page = await context.newPage(), failures = [], policies = [], consoleErrors = [];
      page.on('requestfailed', request => failures.push(request.failure()?.errorText));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.url() === api.origin + api.imagePath)
        policies.push(response.headers()['cross-origin-resource-policy']); });
      await page.goto(pageServer.origin, { waitUntil: 'networkidle', timeout: 15000 });
      const images = await page.locator('img').evaluateAll(elements => elements.map(img => ({
        id: img.id, complete: img.complete, width: img.naturalWidth, height: img.naturalHeight,
        objectFit: getComputedStyle(img).objectFit, crossOrigin: img.crossOrigin,
      })));
      assert.equal(images.length, 2);
      for (const img of images) {
        assert.equal(img.complete, true); assert.equal(img.crossOrigin, null); assert.equal(img.objectFit, 'contain');
        assert.equal(img.width, beforeFix ? 0 : 140); assert.equal(img.height, beforeFix ? 0 : 240);
      }
      if (beforeFix) assert.ok([...failures, ...consoleErrors].some(value => /ERR_BLOCKED_BY_RESPONSE|NotSameOrigin/.test(value)));
      else { assert.deepEqual(failures, []); assert.deepEqual(consoleErrors, []);
        assert.ok(policies.length); assert.ok(policies.every(value => value === 'cross-origin')); }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(JSON.stringify({ phase: beforeFix ? 'before' : 'after', apiOrigin: api.origin,
        browserOrigin: pageServer.origin, viewport, images, failures, consoleErrors, policies }));
    } finally { await browser?.close(); await pageServer?.close(); await api.close(); }
  });
