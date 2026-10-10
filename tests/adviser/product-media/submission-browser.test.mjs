import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { submissionDocument } from './submission-browser-fixture.mjs';

const require = createRequire(new URL('../../../dashboard/package.json', import.meta.url));
const postcss = require('postcss'), tailwind = require('@tailwindcss/postcss');
const root = new URL('../../../', import.meta.url);
async function css(app) {
  const from = new URL(app + '/src/app/globals.css', root).pathname.replace(/^\/(\w:)/, '$1');
  return (await postcss([tailwind({ base: new URL(app, root).pathname.replace(/^\/(\w:)/, '$1') })]).process(readFileSync(from, 'utf8'), { from })).css;
}
const customerCSS = await css('dashboard'), adminCSS = await css('admin-panel');
const evidence = process.env.SUBMISSION_UX_EVIDENCE || join(tmpdir(), 'inventa-submission-ux-browser');
mkdirSync(evidence, { recursive: true });
const form = page => page.getByRole('dialog', { name: 'Add New Product', exact: true });
const review = page => page.locator('dialog[aria-labelledby="submission-review-title"]');
async function show(page, app = 'customer') {
  await page.goto('about:blank');
  await page.setContent(submissionDocument(app === 'admin' ? adminCSS : customerCSS, app));
}
async function openCustomer(page) {
  await show(page);
  await page.getByRole('button', { name: 'Add Product', exact: true }).click();
  await form(page).getByRole('textbox', { name: 'Product name', exact: true }).fill('Bluefield Sparkling Tea');
  await form(page).getByRole('textbox', { name: 'Category', exact: true }).fill('Beverages');
  await form(page).getByRole('textbox', { name: 'Brand', exact: true }).fill('Bluefield');
  await form(page).getByRole('textbox', { name: 'Variant 1 size', exact: true }).fill('250 ml');
  await form(page).getByRole('spinbutton', { name: 'Variant 1 price', exact: true }).fill('19.50');
  await form(page).locator('input[type=file]').setInputFiles({ name: 'tea.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=', 'base64') });
}
async function geometry(page, dialog) {
  return dialog.evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.clientWidth, viewport: innerWidth,
    overflow: document.documentElement.scrollWidth > innerWidth, height: el.getBoundingClientRect().height, viewportHeight: innerHeight }));
}

test('Customer and Admin real UI: responsive dialogs, focus, feedback, immutable retries and decisions', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(); page.setDefaultTimeout(8000);
  const errors = [], checks = []; let outgoing = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { outgoing++; return route.abort(); });
  try {
    for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height }); await openCustomer(page);
      const g = await geometry(page, form(page)); assert.equal(g.overflow, false); assert.ok(g.scroll <= g.client + 1); assert.ok(g.height <= height - 30);
      await page.evaluate(() => { window.fixture.mode = 'hold'; });
      const submit = form(page).getByRole('button', { name: 'Submit for Review', exact: true });
      await submit.evaluate(el => { el.click(); el.click(); });
      await form(page).getByRole('button', { name: 'Submitting…', exact: true }).waitFor();
      assert.equal(await form(page).getByRole('button', { name: 'Submitting…', exact: true }).isDisabled(), true);
      await page.keyboard.press('Escape'); assert.equal(await form(page).count(), 1);
      await page.waitForFunction(() => !!window.fixture.release);
      assert.equal(await page.evaluate(() => window.fixture.calls.filter(c => c.path.endsWith('/product-submissions')).length), 1);
      await page.evaluate(() => window.fixture.release());
      const success = page.getByRole('dialog', { name: 'Product Submitted for Review', exact: true }); await success.waitFor();
      assert.equal(await form(page).count(), 0); assert.match(await success.innerText(), /submission-confirmed-reference/);
      assert.equal(await success.getByRole('button', { name: 'Done', exact: true }).evaluate(el => el === document.activeElement), true);
      const sg = await geometry(page, success); assert.equal(sg.overflow, false); assert.ok(sg.width <= width - 30);
      await page.screenshot({ path: join(evidence, 'customer-success-' + width + '.png') });
      await page.keyboard.press('Tab'); assert.equal(await success.evaluate(el => el.contains(document.activeElement)), true);
      await success.getByRole('button', { name: 'Done', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Add Product', exact: true }).evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(() => window.fixture.calls.filter(c => c.path.endsWith('/product-submissions')).length), 1);
      checks.push({ width, customerForm: g, success: sg, loading: true, doneDoesNotSubmit: true, focusRestored: true });
      await show(page, 'admin');
      await page.locator('article').nth(5).waitFor();
      const cardHeights = await page.locator('article').evaluateAll(es => es.map(e => e.getBoundingClientRect().height)); assert.ok(Math.max(...cardHeights) < 300);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const thumb = page.locator('article').first().locator('img'); await thumb.waitFor();
      assert.equal(await thumb.evaluate(async e => { await e.decode(); return getComputedStyle(e).objectFit; }), 'contain');
      await page.screenshot({ path: join(evidence, 'admin-cards-' + width + '.png') });
      await page.getByRole('button', { name: 'Review Bluefield Sparkling Tea', exact: true }).click(); await review(page).waitFor();
      const rg = await geometry(page, review(page)); assert.equal(rg.overflow, false); assert.ok(rg.scroll <= rg.client + 1); assert.ok(rg.height <= height - 30);
      for (const value of ['Submission reference', 'Customer UID', 'PRODUCT-SKU-0', 'VARIANT-LARGE-0', 'Lemon', '500 ml', '32.5', 'Description', 'Awaiting review']) assert.ok((await review(page).innerText()).toLowerCase().includes(value.toLowerCase()), value);
      assert.equal(await review(page).getByRole('button', { name: 'Close review', exact: true }).evaluate(el => el === document.activeElement), true);
      await page.screenshot({ path: join(evidence, 'admin-review-' + width + '.png') });
      await page.keyboard.press('Escape'); await review(page).waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('button', { name: 'Review Bluefield Sparkling Tea', exact: true }).evaluate(el => el === document.activeElement), true);
      checks.push({ width, cardHeights, review: rg, metadata: true, privateAuth: await page.evaluate(() => window.fixture.calls.some(c => c.path.endsWith('/private'))) });
    }
    for (const mode of ['validation', 'network', 'malformed']) {
      await openCustomer(page); await page.evaluate(mode => { window.fixture.mode = mode; }, mode);
      await form(page).getByRole('button', { name: 'Submit for Review', exact: true }).click();
      const error = page.getByRole('dialog', { name: mode === 'validation' ? 'Unable to Submit Product' : 'Submission Not Yet Confirmed', exact: true }); await error.waitFor();
      await page.screenshot({ path: join(evidence, 'customer-' + mode + '.png') });
      await page.keyboard.press('Escape'); await error.waitFor({ state: 'detached' });
      assert.equal(await form(page).getByRole('textbox', { name: 'Product name', exact: true }).inputValue(), 'Bluefield Sparkling Tea');
      await page.evaluate(() => { window.fixture.mode = 'success'; });
      await form(page).getByRole('button', { name: 'Retry Same Submission', exact: true }).click();
      await page.getByRole('dialog', { name: 'Product Submitted for Review', exact: true }).waitFor();
      const calls = await page.evaluate(() => window.fixture.calls); const submissions = calls.filter(c => c.path.endsWith('/product-submissions'));
      assert.equal(submissions.length, 2); assert.equal(submissions[0].key, submissions[1].key); assert.equal(submissions[0].body, submissions[1].body);
      assert.equal(calls.filter(c => c.path.includes('/upload/submission')).length, 1);
      checks.push({ failureMode: mode, exactRetry: true, singleUpload: true });
    }
    for (const action of ['Approve and Publish', 'Reject']) {
      await show(page, 'admin'); await page.getByRole('button', { name: 'Review Bluefield Sparkling Tea', exact: true }).click();
      await page.evaluate(() => { window.fixture.mode = 'hold'; });
      await review(page).getByRole('button', { name: action, exact: true }).evaluate(el => { el.click(); el.click(); });
      await page.waitForFunction(() => !!window.fixture.release); assert.equal(await review(page).getByRole('button', { name: action, exact: true }).isDisabled(), true);
      await page.keyboard.press('Escape'); assert.equal(await review(page).count(), 1);
      assert.equal(await page.evaluate(() => window.fixture.calls.filter(c => c.method === 'POST').length), 1);
      await page.evaluate(() => window.fixture.release()); await review(page).waitFor({ state: 'detached' });
      await page.getByRole('combobox', { name: 'Review status', exact: true }).selectOption(action === 'Reject' ? 'rejected' : 'approved');
      await page.getByRole('button', { name: 'Review Bluefield Sparkling Tea', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Review Bluefield Sparkling Tea', exact: true }).click();
      assert.equal(await review(page).getByRole('button', { name: action, exact: true }).count(), 0);
      checks.push({ action, oneDecision: true, finalActionsHidden: true, filtering: true });
    }
    assert.equal(outgoing, 0); assert.deepEqual(errors, []);
    writeFileSync(join(evidence, 'local-browser-checks.json'), JSON.stringify({ checks, outgoing, errors }, null, 2));
    console.log('Desktop/tablet/mobile UI, native dialog focus/Escape, Customer success/error/uncertainty/retry, Admin metadata/filter/final decisions: PASS');
  } catch (error) {
    console.error({ errors, body: (await page.locator('body').innerText()).slice(0,1500) });
    await page.screenshot({ path: join(evidence, 'browser-failure.png') });
    throw error;
  } finally { await browser.close(); }
});
