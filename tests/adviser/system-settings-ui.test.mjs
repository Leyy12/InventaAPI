import test from 'node:test';
import assert from 'node:assert/strict';
import { hooks, load, nodes, flush } from './workspace-refresh/harness.mjs';
import { MAINTENANCE_MESSAGE } from '../../services/system-settings-contract.mjs';
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') : value && typeof value === 'object'
  ? text(value.props?.children) : String(value ?? '');
const find = (h, predicate) => { const matches = nodes(h.output, predicate); assert.equal(matches.length, 1); return matches[0]; };
const button = (h, name) => find(h, node => node.type === 'button' && text(node).replace(/\s*→$/u, '').trim() === name);

async function settingsFixture(options = {}) {
  const h = hooks(), calls = [];
  const user = { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' };
  let stored = { settings: { maintenanceMode: options.maintenanceMode ?? false, allowNewRegistrations: true, planRequestLimits: { free_trial: null, pro: 500, pro_max: null },
    maintenanceStartsAt: options.startsAt ?? null, maintenanceEndsAt: options.endsAt ?? null },
    version: 'v1', source: options.missing ? 'defaults' : 'stored', warnings: [] };
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
        stored = { ...stored, version: 'v2', source: 'stored', settings: { ...stored.settings, ...changes } };
        body = options.reloadFailure ? { success: true, saved: true, reloadRequired: true } : { success: true, saved: true, ...stored };
      } else body = { success: false, error: 'Safe server error' };
    } else { status = getError || 200; body = status === 200 ? { success: true, ...structuredClone(stored) } : { success: false, error: 'Unavailable' }; }
    return { ok: status === 200, status, json: async () => body };
  };
  const component = load('admin-panel/src/app/settings/page.tsx', 'SettingsPage', h, {
    'next/link': 'Link', 'lucide-react': icons, '@/lib/supabase/admin-auth-context': { useAdminAuth: () => ({ user }) }, '@/components/admin/BackupRestoreCard': () => null,
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
  assert.match(copy, /Not tracked/); assert.doesNotMatch(copy, /Plan Limits/);
  assert.doesNotMatch(copy, /Restart Server|Clear Cache|Strict API Validation|Max Requests Per Minute/);
  assert.equal(nodes(f.h.output, node => node.type === 'select').length, 0);
  assert.equal(find(f.h, node => node.type === 'Link').props.href, '/audit'); f.stop();
});

test('Plan Limits card is gone: no plan inputs render and saves never send plan limits', async () => {
  const f = await settingsFixture(), copy = text(f.h.output);
  assert.doesNotMatch(copy, /Plan Limits|Requests\/day|Linked products/);
  for (const name of ['Free Trial linked products', 'Pro daily request allowance', 'Pro Max daily request allowance', 'Pro Max request mode'])
    assert.equal(nodes(f.h.output, node => node.props?.['aria-label'] === name).length, 0);
  await f.change('Allow New Registrations', false); await f.submit();
  assert.deepEqual(f.patches()[0].body.changes, { allowNewRegistrations: false });
  f.stop();
});

const scheduleShown = h => nodes(h.output, node => node.props?.['aria-label'] === 'Maintenance starts').length === 1;
const switchOn = h => find(h, node => node.props?.['aria-label'] === 'Maintenance Mode').props.checked;
const saveDisabled = h => button(h, 'Save Settings').props.disabled;
const later = days => new Date(Date.now() + days * 86400000).toISOString();
// datetime-local text for a time `days` from now, in local time (what the admin types).
const localInput = days => { const d = new Date(Date.now() + days * 86400000), pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

test('Maintenance Mode is off and the schedule is hidden when nothing is scheduled', async () => {
  const f = await settingsFixture(); assert.equal(switchOn(f.h), false); assert.equal(scheduleShown(f.h), false);
  assert.doesNotMatch(text(f.h.output), /Schedule Maintenance/); f.stop();
});
test('switching Maintenance Mode on only opens the schedule: it does not start maintenance or allow an empty save', async () => {
  const f = await settingsFixture();
  await f.change('Maintenance Mode', true);
  assert.equal(switchOn(f.h), true); assert.equal(scheduleShown(f.h), true);
  assert.equal(saveDisabled(f.h), true); assert.match(text(f.h.output), /Set a start and an end time/);
  await f.submit(); assert.equal(f.patches().length, 0);
  await f.change('Maintenance Mode', false); assert.equal(scheduleShown(f.h), false); f.stop();
});
test('a schedule is confirmed, then saved as start/end times only (maintenance starts on its own)', async () => {
  const f = await settingsFixture(); await f.change('Maintenance Mode', true);
  await f.change('Maintenance starts', localInput(1)); await f.change('Maintenance ends', localInput(2));
  assert.equal(saveDisabled(f.h), false);
  await f.submit(); assert.equal(f.dialogState.open, true); assert.equal(f.patches().length, 0);
  assert.match(text(f.h.output), /starts automatically on/);
  button(f.h, 'Cancel').props.onClick(); await flush(); assert.equal(f.dialogState.open, false); assert.equal(f.patches().length, 0);
  await f.submit(); button(f.h, 'Schedule and Save').props.onClick(); await flush();
  assert.equal(f.patches().length, 1);
  const changes = f.patches()[0].body.changes;
  assert.deepEqual(Object.keys(changes).sort(), ['maintenanceEndsAt', 'maintenanceStartsAt']);
  assert.ok(Date.parse(changes.maintenanceStartsAt) > Date.now());
  assert.equal(switchOn(f.h), true); assert.match(text(f.h.output), /Scheduled:/); f.stop();
});
test('Start now fills the start time and the confirmation says it starts right away', async () => {
  const f = await settingsFixture(); await f.change('Maintenance Mode', true);
  button(f.h, 'Start now').props.onClick(); await flush(); await f.change('Maintenance ends', localInput(1));
  await f.submit(); assert.match(text(f.h.output), /starts right away/);
  button(f.h, 'Schedule and Save').props.onClick(); await flush();
  assert.ok(Date.parse(f.patches()[0].body.changes.maintenanceStartsAt) <= Date.now()); f.stop();
});
test('an end before the start, or an end already passed, cannot be saved', async () => {
  const f = await settingsFixture(); await f.change('Maintenance Mode', true);
  await f.change('Maintenance starts', localInput(2)); await f.change('Maintenance ends', localInput(1));
  assert.match(text(f.h.output), /end must be after the start/); assert.equal(saveDisabled(f.h), true);
  await f.change('Maintenance starts', localInput(-2)); await f.change('Maintenance ends', localInput(-1));
  assert.match(text(f.h.output), /already passed/); assert.equal(saveDisabled(f.h), true);
  await f.submit(); assert.equal(f.patches().length, 0); f.stop();
});
test('an upcoming saved schedule shows the switch on; switching off cancels it', async () => {
  const f = await settingsFixture({ startsAt: later(1), endsAt: later(2) });
  assert.equal(switchOn(f.h), true); assert.equal(scheduleShown(f.h), true); assert.match(text(f.h.output), /Scheduled:/);
  await f.change('Maintenance Mode', false); await f.submit();
  assert.deepEqual(f.patches()[0].body.changes, { maintenanceStartsAt: null, maintenanceEndsAt: null });
  assert.equal(switchOn(f.h), false); assert.equal(scheduleShown(f.h), false); f.stop();
});
test('running scheduled maintenance shows "In maintenance now"', async () => {
  const f = await settingsFixture({ startsAt: later(-1), endsAt: later(1) });
  assert.equal(switchOn(f.h), true); assert.match(text(f.h.output), /In maintenance now/); f.stop();
});
test('a schedule that already ended leaves the switch off; switching on starts from empty times', async () => {
  const f = await settingsFixture({ startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(switchOn(f.h), false); assert.equal(scheduleShown(f.h), false);
  await f.change('Maintenance Mode', true);
  assert.equal(find(f.h, node => node.props?.['aria-label'] === 'Maintenance starts').props.value, '');
  assert.equal(saveDisabled(f.h), true);
  await f.change('Maintenance Mode', false); assert.doesNotMatch(text(f.h.output), /Unsaved changes/); f.stop();
});
test('maintenance already switched on (older setting) can be ended with the switch', async () => {
  const f = await settingsFixture({ maintenanceMode: true });
  assert.equal(switchOn(f.h), true); assert.match(text(f.h.output), /Maintenance is on now, with no end time/);
  await f.change('Maintenance Mode', false); await f.submit();
  assert.deepEqual(f.patches()[0].body.changes, { maintenanceMode: false }); f.stop();
});
test('setting times on an older "on now" maintenance hands control to the schedule', async () => {
  const f = await settingsFixture({ maintenanceMode: true });
  button(f.h, 'Start now').props.onClick(); await flush(); await f.change('Maintenance ends', localInput(1));
  await f.submit(); button(f.h, 'Schedule and Save').props.onClick(); await flush();
  const changes = f.patches()[0].body.changes;
  assert.equal(changes.maintenanceMode, false); assert.ok(changes.maintenanceStartsAt && changes.maintenanceEndsAt); f.stop();
});
for (const environment of ['Production', 'Staging', 'Development', 'Unknown']) test(`actual settings environment renders ${environment}`, async () => {
  const f = await settingsFixture({ environment }); assert.ok(text(f.h.output).includes(environment)); f.stop();
});
test('actual Save submits only changed fields and the loaded version, then displays authoritative persistence', async () => {
  const f = await settingsFixture(); await f.change('Allow New Registrations', false);
  assert.match(text(f.h.output), /Unsaved changes/); assert.equal(button(f.h, 'Save Settings').props.disabled, false);
  await f.submit(); assert.equal(f.patches().length, 1);
  assert.deepEqual(f.patches()[0].body, { version: 'v1', changes: { allowNewRegistrations: false } });
  assert.match(text(f.h.output), /saved and reloaded successfully/); assert.doesNotMatch(text(f.h.output), /Unsaved changes/);
  assert.equal(button(f.h, 'Save Settings').props.disabled, true); f.stop();
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
  const f = await settingsFixture({ reloadFailure: true }); await f.change('Allow New Registrations', false); await f.submit();
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
