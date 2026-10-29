import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, nodes, flush } from './workspace-refresh/harness.mjs';
import { MAINTENANCE_MESSAGE } from '../../services/system-settings-contract.mjs';
import { TRIAL_MAX_PRODUCTS } from '../../functions/entitlement-limits.mjs';
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object'
  ? text(value.props?.children) : String(value ?? '');
const find = (h, predicate) => { const matches = nodes(h.output, predicate); assert.equal(matches.length, 1); return matches[0]; };
const button = (h, name) => find(h, node => node.type === 'button' && text(node).replace(/\s*→$/u, '').trim() === name);

async function settingsFixture(options = {}) {
  const h = hooks(), calls = [];
  const user = { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' };
  let stored = { settings: { maintenanceMode: false, allowNewRegistrations: true, planRequestLimits: { free_trial: options.freeTrialLimit ?? null, pro: 500, pro_max: options.maxLimit ?? null } },
    version: 'v1', source: options.missing ? 'defaults' : 'stored', warnings: [], planLimitPeriod: 'UTC daily. Existing paid promises protected.' };
  let getError = options.getError;
  const fakeFetch = async (url, request) => {
    assert.ok(url.startsWith('/api/v1/admin/system/') || url === 'https://synthetic.invalid/daas/v1/health');
    calls.push({ url, method: request.method || 'GET', body: request.body ? JSON.parse(request.body) : null });
    let status = 200, body;
    if (url.endsWith('/information')) body = { success: true, apiVersion: '1.0.0', databaseStatus: 'Connected', checkedAt: '2026-10-14T00:00:00Z', uptime: 'Not tracked' };
    else if (url.endsWith('/health')) { status = options.healthFailure ? 503 : 200; body = { status: options.healthFailure ? 'unavailable' : 'operational' }; }
    else if (request.method === 'PATCH') {
      status = options.saveError || 200;
      if (status === 200) {
        const changes = JSON.parse(request.body).changes;
        stored = { ...stored, version: 'v2', source: 'stored', settings: { ...stored.settings, ...changes,
          planRequestLimits: { ...stored.settings.planRequestLimits, ...changes.planRequestLimits } } };
        body = options.reloadFailure ? { success: true, saved: true, reloadRequired: true } : { success: true, saved: true, ...stored };
      } else body = { success: false, error: 'Safe server error' };
    } else { status = getError || 200; body = status === 200 ? { success: true, ...structuredClone(stored) } : { success: false, error: 'Unavailable' }; }
    return { ok: status === 200, status, json: async () => body };
  };
  const component = load('admin-panel/src/app/settings/page.tsx', 'SettingsPage', h, {
    'next/link': 'Link', 'lucide-react': icons, '@/lib/supabase/admin-auth-context': { useAdminAuth: () => ({ user }) },
    '../../../../functions/entitlement-limits.mjs': { TRIAL_MAX_PRODUCTS },
  }, { fetch: fakeFetch, process: { env: { NEXT_PUBLIC_API_URL: 'https://synthetic.invalid', NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT: options.environment || 'Production' } } });
  h.mount(component);
  const dialog = find(h, node => node.type === 'dialog'), dialogState = { open: false };
  dialog.props.ref.current = { showModal() { dialogState.open = true; }, close() { dialogState.open = false; } };
  await flush();
  return { h, calls, dialogState, recover() { getError = null; },
    async change(name, value) {
      const node = find(h, n => n.props?.['aria-label'] === name || n.props?.id === name);
      node.props.onChange({ target: { checked: value, value } }); await flush();
    }, async submit() { find(h, node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await flush(); },
    stop() { h.stop(); }, patches: () => calls.filter(call => call.method === 'PATCH') };
}

test('actual settings page loads authoritative state and replaces unsupported controls/actions', async () => {
  const f = await settingsFixture(), copy = text(f.h.output);
  assert.equal(button(f.h, 'Save Settings').props.disabled, true);
  assert.match(copy, /Production/); assert.match(copy, /v1\.0\.0/); assert.match(copy, /Connected/); assert.match(copy, /single probe/);
  assert.match(copy, /Not tracked/); assert.match(copy, /Plan Limits/);
  assert.doesNotMatch(copy, /Restart Server|Clear Cache|Strict API Validation|Max Requests Per Minute/);
  assert.equal(nodes(f.h.output, node => node.type === 'select').length, 1);
  assert.equal(find(f.h, node => node.type === 'Link').props.href, '/audit'); f.stop();
});

test('Trial capacity is read-only linked products, independent of stored request policy and paid-plan edits', async () => {
  const f = await settingsFixture({ freeTrialLimit: 123 });
  const trial = find(f.h, node => node.props?.['aria-label'] === 'Free Trial linked products');
  assert.equal(trial.props.value, 50);
  assert.equal(trial.props.readOnly, true);
  assert.equal(trial.props.onChange, undefined);
  assert.match(text(f.h.output), /Linked products/);
  assert.doesNotMatch(text(f.h.output), /Plan Request Limits|Unlimited requests|UTC daily limit/);
  assert.equal(nodes(f.h.output, node => node.props?.['aria-label'] === 'Free Trial request mode').length, 0);
  assert.equal(button(f.h, 'Save Settings').props.disabled, true);
  await f.change('pro-request-limit', 1000); await f.submit();
  assert.deepEqual(f.patches()[0].body.changes, { planRequestLimits: { pro: 1000 } });
  assert.equal(find(f.h, node => node.props?.['aria-label'] === 'Free Trial linked products').props.value, 50);
  f.stop();
});

test('Pro Max retains finite editing and switching back to Unlimited without mutating Trial policy', async () => {
  const f = await settingsFixture({ freeTrialLimit: 123 });
  await f.change('Pro Max request mode', 'finite');
  await f.change('pro_max-request-limit', 2000); await f.submit();
  assert.deepEqual(f.patches()[0].body.changes, { planRequestLimits: { pro_max: 2000 } });
  button(f.h, '∞').props.onClick(); await flush(); await f.submit();
  assert.deepEqual(f.patches()[1].body.changes, { planRequestLimits: { pro_max: null } });
  assert.equal(find(f.h, node => node.props?.['aria-label'] === 'Pro Max request mode').props.value, 'unlimited');
  f.stop();
});
for (const environment of ['Production', 'Staging', 'Development', 'Unknown']) test(`actual settings environment renders ${environment}`, async () => {
  const f = await settingsFixture({ environment }); assert.ok(text(f.h.output).includes(environment)); f.stop();
});
test('actual Save submits only changed fields and the loaded version, then displays authoritative persistence', async () => {
  const f = await settingsFixture(); await f.change('pro-request-limit', 1000);
  assert.match(text(f.h.output), /Unsaved changes/); assert.equal(button(f.h, 'Save Settings').props.disabled, false);
  await f.submit(); assert.equal(f.patches().length, 1);
  assert.deepEqual(f.patches()[0].body, { version: 'v1', changes: { planRequestLimits: { pro: 1000 } } });
  assert.match(text(f.h.output), /saved and reloaded successfully/); assert.doesNotMatch(text(f.h.output), /Unsaved changes/);
  assert.equal(button(f.h, 'Save Settings').props.disabled, true); f.stop();
});
test('maintenance requires explicit confirmation; cancel sends no mutation and confirm commits once', async () => {
  const f = await settingsFixture(); await f.change('Maintenance Mode', true); await f.submit();
  assert.equal(f.dialogState.open, true); assert.equal(f.patches().length, 0);
  button(f.h, 'Cancel').props.onClick(); await flush(); assert.equal(f.dialogState.open, false); assert.equal(f.patches().length, 0);
  await f.submit(); button(f.h, 'Enable and Save').props.onClick(); await flush();
  assert.equal(f.patches().length, 1); assert.deepEqual(f.patches()[0].body.changes, { maintenanceMode: true }); f.stop();
});
for (const getError of [401, 403, 503]) test(`load failure ${getError} leaves controls and Save disabled`, async () => {
  const f = await settingsFixture({ getError }); assert.equal(button(f.h, 'Save Settings').props.disabled, true);
  assert.equal(find(f.h, node => node.type === 'fieldset').props.disabled, true);
  assert.match(text(f.h.output), getError === 503 ? /could not be loaded/ : /Admin session is required/);
  f.recover(); button(f.h, 'Refresh Settings').props.onClick(); await flush();
  assert.equal(find(f.h, node => node.type === 'fieldset').props.disabled, false); f.stop();
});
for (const saveError of [400, 403, 409, 503]) test(`save failure ${saveError} never displays success or silently retries`, async () => {
  const f = await settingsFixture({ saveError }); await f.change('Allow New Registrations', false); await f.submit();
  assert.equal(f.patches().length, 1); assert.doesNotMatch(text(f.h.output), /saved and reloaded successfully/);
  assert.match(text(f.h.output), saveError === 409 ? /Another Admin changed/ : saveError === 400 ? /Check your values/ : /authorization is unavailable|save outcome could not be verified/);
  f.stop();
});
test('save followed by unavailable reload clearly disables further editing without replay', async () => {
  const f = await settingsFixture({ reloadFailure: true }); await f.change('pro-request-limit', 1000); await f.submit();
  assert.equal(f.patches().length, 1); assert.match(text(f.h.output), /saved, but the reload is unavailable/);
  assert.equal(button(f.h, 'Save Settings').props.disabled, true); f.stop();
});
test('missing settings are distinguished from loaded persisted values', async () => {
  const f = await settingsFixture({ missing: true }); assert.match(text(f.h.output), /No settings document exists/); f.stop();
});
for (const healthFailure of [false, true]) test(`Check API Health performs a real requested GET and reports health failure=${healthFailure}`, async () => {
  const f = await settingsFixture({ healthFailure }); button(f.h, 'Check API Health').props.onClick(); await flush();
  assert.equal(f.calls.filter(call => call.url.endsWith('/daas/v1/health')).length, 1);
  assert.match(text(f.h.output), healthFailure ? /Unavailable — HTTP 503/ : /Available — HTTP 200/); f.stop();
});

async function customerBoundary(pathname = '/dashboard/products', maintenance = false) {
  const h = hooks(), timers = [], calls = []; let failure = false;
  const child = { type: 'ExistingBusinessPage', props: { children: 'Existing Customer content' } };
  const component = load('dashboard/src/components/shared/CustomerMaintenanceBoundary.tsx', 'exports.default', h, {
    '../../../../services/system-settings-contract.mjs': { MAINTENANCE_MESSAGE },
    'next/navigation': { useRouter: () => ({ replace() {} }) },
    '@/lib/supabase/auth-context': { useAuth: () => ({ user: null, logout: async () => ({ ok: true }) }) },
  }, { fetch: async (url, options) => {
    assert.equal(url, '/api/v1/system/status'); calls.push(options);
    if (failure) throw Error('offline');
    return { ok: true, json: async () => ({ success: true, maintenanceMode: maintenance }) };
  }, setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {} });
  h.mount(component, { pathname, children: child }); await flush();
  return { h, child, calls, async poll(next, offline = false) { maintenance = next; failure = offline; timers[0](); await flush(); }, stop() { h.stop(); } };
}
test('Customer boundary shows the page normally, and a sign-out screen while maintenance is on', async () => {
  const f = await customerBoundary(); assert.equal(f.h.output, f.child);
  await f.poll(false); assert.equal(f.h.output, f.child);
  await f.poll(true); assert.match(text(f.h.output), /Signing you out for maintenance/); assert.notEqual(f.h.output, f.child);
  await f.poll(false); assert.equal(f.h.output, f.child);
  await f.poll(false, true); assert.match(text(f.h.output), /could not be verified/); f.stop();
});
// During maintenance every customer page signs the customer out (the sign-in page shows the apology).
for (const path of ['/dashboard/plan-billing', '/dashboard/settings', '/dashboard/privacy']) test(`maintenance signs the customer out on ${path} too`, async () => {
  const f = await customerBoundary(path, true); assert.match(text(f.h.output), /Signing you out for maintenance/); f.stop();
});
