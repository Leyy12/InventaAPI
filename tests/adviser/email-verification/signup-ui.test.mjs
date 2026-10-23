import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../../../services/auth-navigation.ts';
import * as registration from '../../../services/customer-registration.mjs';
import { hooks, load, nodes, clock, flush } from '../workspace-refresh/harness.mjs';

// Real signup page and registration flow. Firebase SDK and the backend verification
// endpoints are synthetic; the loader forbids external I/O.
const icons = new Proxy({}, { get: (_, name) => String(name) });
const text = value => Array.isArray(value) ? value.map(text).join(' ') :
  value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
const silent = { log() {}, error() {}, warn() {} };
const details = { fullName: 'Synthetic Fixture', email: ' Fixture@Example.Invalid ', password: 'synthetic-password',
  confirmPassword: 'synthetic-password', businessName: 'Synthetic', businessSegment: 'Grocery', termsAccepted: true, privacyConsent: true };
const sent = { ok: true, message: '', retryAfterSeconds: 0, resendAvailableInSeconds: 60 };
// The server creates the account; this browser signs in, saves the profile, signs out,
// then signs in again to choose a plan; no navigation yet.
const success = ['account', 'signin', 'profile', 'signout', 'signin'];

function page({ send = () => sent, canRegister = async () => true, query = '',
  verify = ({ code }) => code === '123456' ? { ok: true, message: '', verificationToken: 'synthetic-token' }
    : { ok: false, message: 'Incorrect code. 4 attempts remaining.', verificationToken: '' } } = {}) {
  const h = hooks(), time = clock(), events = [], calls = [];
  const component = load('dashboard/src/app/signup/page.tsx', 'SignupPageInner', h, {
    '@/lib/supabase-auth': {
      signOut: async () => { events.push('signout'); },
      signInWithEmailAndPassword: async (_, email, password) => { events.push('signin'); calls.push(['signin', email, password]);
        return { user: { uid: 'synthetic', email } }; },
    },
    '@/components/subscription/PostSignupPlans': 'PostSignupPlans',
    '@/lib/data/firestore-client': { doc: (...args) => args, serverTimestamp: () => 'server-time', setDoc: async () => { events.push('profile'); } },
    '@/lib/firebase/config': { auth: {}, db: {} },
    'next/navigation': { useRouter: () => ({ push: () => { events.push('navigation'); } }), useSearchParams: () => new URLSearchParams(query) },
    'lucide-react': icons, 'next/link': 'Link', 'next/image': 'Image',
    '../../../../services/auth-navigation': navigation,
    '../../../../services/customer-registration.mjs': { ...registration, readRegistrationPolicy: canRegister,
      sendSignupCode: async request => { events.push('code'); calls.push(['send', request.base, request.email]); return send(request); },
      verifySignupCode: async request => { events.push('verify'); calls.push(['verify', request.email, request.code]); return verify(request); },
      registerSignupAccount: async request => { events.push('account'); calls.push(['account', request.email, request.password, request.verificationToken]); },
    },
  }, { console: silent, setTimeout: time.schedule, clearTimeout: time.cancel });
  h.mount(component);
  const find = predicate => { const matches = nodes(h.output, predicate); assert.equal(matches.length, 1); return matches[0]; };
  const button = label => find(node => node.type === 'button' && text(node).includes(label));
  return { h, time, events, calls, find, button, copy: () => text(h.output),
    step: () => nodes(h.output, node => node.type === 'PostSignupPlans').length ? 'plans'
      : nodes(h.output, node => node.props?.name === 'verificationCode').length ? 'verify' : 'details',
    async fill(values = details) {
      for (const [name, value] of Object.entries(values)) {
        find(node => node.props?.name === name).props.onChange({ target: { name, value,
          type: typeof value === 'boolean' ? 'checkbox' : 'text', checked: value } });
        await flush();
      }
    },
    async submit() { await find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }); await flush(); },
    async enter(code) { find(node => node.props?.name === 'verificationCode').props.onChange({ target: { value: code } }); await flush(); },
    async click(label) { await button(label).props.onClick(); await flush(); },
  };
}

test('Terms of Service acceptance is required before any code is emailed', async () => {
  const fixture = page(); await fixture.fill({ ...details, termsAccepted: false }); await fixture.submit();
  assert.deepEqual(fixture.events, []); assert.equal(fixture.step(), 'details');
  assert.match(fixture.copy(), /must agree to the Terms of Service and Acceptable Use Policy/);
  fixture.h.stop();
});
test('Send Verification Code stays disabled until every field is filled and both boxes are checked', async () => {
  const fixture = page();
  const send = () => fixture.find(node => node.props?.type === 'submit');
  const hint = () => nodes(fixture.h.output, node => node.props?.id === 'send-code-hint').map(node => text(node).trim());
  assert.equal(send().props.disabled, true); assert.deepEqual(hint(), ['Fill in every field above to continue.']);
  await fixture.fill({ ...details, termsAccepted: false, privacyConsent: false });
  assert.equal(send().props.disabled, true);
  assert.deepEqual(hint(), ['Agree to the Terms of Service and the Privacy Policy to continue.']);
  assert.equal(send().props['aria-describedby'], 'send-code-hint');
  await fixture.fill({ termsAccepted: true });
  assert.equal(send().props.disabled, true);
  await fixture.fill({ privacyConsent: true });
  assert.equal(send().props.disabled, false); assert.deepEqual(hint(), []);
  assert.equal(send().props['aria-describedby'], undefined);
  for (const field of ['fullName', 'email', 'password', 'confirmPassword', 'businessName']) {
    await fixture.fill({ [field]: '   ' });
    assert.equal(send().props.disabled, true, field);
    await fixture.fill({ [field]: details[field] });
  }
  await fixture.fill({ privacyConsent: false });
  assert.equal(send().props.disabled, true);
  assert.deepEqual(fixture.events, []); fixture.h.stop();
});
test('an address that cannot receive a code is rejected without calling the backend', async () => {
  const fixture = page(); await fixture.fill({ ...details, email: 'juan@gmail' }); await fixture.submit();
  assert.deepEqual(fixture.events, []); assert.match(fixture.copy(), /valid email address/);
  fixture.h.stop();
});
test('the code goes to the normalized address on the API origin; step 2 names it', async () => {
  const fixture = page(); await fixture.fill(); await fixture.submit();
  assert.deepEqual(fixture.calls, [['send', 'https://synthetic.invalid', 'fixture@example.invalid']]);
  assert.equal(fixture.step(), 'verify');
  assert.match(fixture.copy(), /Step 2 of 2/);
  assert.match(fixture.copy(), /Enter the 6-digit code we sent to\s+fixture@example\.invalid/);
  // A single text child: build-time constant folding cannot drop the space before "minutes".
  const hint = fixture.find(node => node.type === 'p' && text(node).includes('Enter the 6-digit code'));
  assert.ok(hint.props.children.includes('It expires in 10 minutes. If you don\'t see it, check your Spam or Promotions folder.'));
  const input = fixture.find(node => node.props?.name === 'verificationCode');
  assert.equal(input.props.inputMode, 'numeric'); assert.equal(input.props.autoComplete, 'one-time-code');
  assert.equal(input.props.maxLength, 6); assert.equal(input.props.required, true);
  assert.equal(nodes(fixture.h.output, node => node.props?.type === 'submit').length, 1);
  for (const name of ['email', 'password', 'termsAccepted']) assert.equal(nodes(fixture.h.output, node => node.props?.name === name).length, 0);
  fixture.h.stop();
});
test('the code field keeps six digits only and a wrong code creates no account', async () => {
  const fixture = page(); await fixture.fill(); await fixture.submit();
  await fixture.enter('12a-34 5');
  assert.equal(fixture.find(node => node.props?.name === 'verificationCode').props.value, '12345');
  assert.equal(fixture.find(node => node.props?.type === 'submit').props.disabled, true);
  await fixture.enter('0000000'); await fixture.submit();
  assert.deepEqual(fixture.calls.at(-1), ['verify', 'fixture@example.invalid', '000000']);
  assert.deepEqual(fixture.events, ['code', 'verify']); assert.equal(fixture.step(), 'verify');
  assert.match(fixture.copy(), /Incorrect code\. 4 attempts remaining\./);
  await fixture.enter('123456'); await fixture.submit();
  assert.deepEqual(fixture.events, ['code', 'verify', 'verify', ...success]);
  assert.deepEqual(fixture.calls.filter(call => call[0] !== 'verify').slice(1),
    [['account', 'fixture@example.invalid', 'synthetic-password', 'synthetic-token'],
      ['signin', 'fixture@example.invalid', 'synthetic-password'], ['signin', 'fixture@example.invalid', 'synthetic-password']]);
  fixture.h.stop();
});
for (const [query, initialPlan] of [['', null], ['pendingPlan=free', null], ['pendingPlan=pro', 'pro'], ['pendingPlan=pro_max', 'pro_max'], ['pendingPlan=evil', null]]) {
  test(`a created account sees every plan before the dashboard: ${query || 'no intent'}`, async () => {
    const fixture = page({ query }); await fixture.fill(); await fixture.submit(); await fixture.enter('123456'); await fixture.submit();
    assert.equal(fixture.step(), 'plans');
    assert.equal(fixture.find(node => node.type === 'PostSignupPlans').props.initialPlan, initialPlan);
    assert.equal(nodes(fixture.h.output, node => node.type === 'form').length, 0);
    assert.ok(!fixture.events.includes('navigation'));
    fixture.h.stop();
  });
}
test('resend waits for the cooldown, then sends a fresh code and says so', async () => {
  const fixture = page(); await fixture.fill(); await fixture.submit();
  assert.equal(fixture.button('Resend code').props.disabled, true);
  assert.match(text(fixture.button('Resend code')), /Resend code in 60s/);
  await fixture.time.advance(59_000); assert.match(text(fixture.button('Resend code')), /in 1s/);
  await fixture.time.advance(1_000);
  assert.equal(fixture.button('Resend code').props.disabled, false);
  await fixture.click('Resend code');
  assert.deepEqual(fixture.events, ['code', 'code']);
  assert.match(fixture.copy(), /We sent a new code to fixture@example\.invalid/);
  assert.equal(fixture.button('Resend code').props.disabled, true);
  fixture.h.stop();
});
test('a refused send keeps the details step and shows the reason', async () => {
  const fixture = page({ send: () => ({ ok: false, message: 'This email is already registered. Please sign in.', retryAfterSeconds: 0, resendAvailableInSeconds: 60 }) });
  await fixture.fill(); await fixture.submit();
  assert.equal(fixture.step(), 'details'); assert.match(fixture.copy(), /already registered/);
  fixture.h.stop();
});
test('editing details keeps entries; the same address reuses its pending code, a new one is verified anew', async () => {
  const fixture = page(); await fixture.fill(); await fixture.submit();
  await fixture.click('Edit details');
  assert.equal(fixture.step(), 'details');
  assert.equal(fixture.find(node => node.props?.name === 'businessName').props.value, 'Synthetic');
  assert.equal(fixture.find(node => node.props?.name === 'termsAccepted').props.checked, true);
  await fixture.submit();
  assert.equal(fixture.step(), 'verify'); assert.deepEqual(fixture.events, ['code']);
  await fixture.click('Edit details'); await fixture.fill({ email: 'other@example.invalid' }); await fixture.submit();
  assert.deepEqual(fixture.calls.map(call => call[2]), ['fixture@example.invalid', 'other@example.invalid']);
  await fixture.enter('123456'); await fixture.submit();
  assert.deepEqual(fixture.calls.find(call => call[0] === 'account'), ['account', 'other@example.invalid', 'synthetic-password', 'synthetic-token']);
  fixture.h.stop();
});
const closedOnce = () => { let checks = 0; return async () => ++checks > 1; };
test('a retry after a later failure reuses the single-use verification', async () => {
  const fixture = page({ canRegister: closedOnce() });
  await fixture.fill(); await fixture.submit(); await fixture.enter('123456');
  await fixture.submit();
  assert.match(fixture.copy(), /registration is temporarily unavailable/);
  assert.deepEqual(fixture.events, ['code', 'verify']);
  await fixture.submit();
  assert.deepEqual(fixture.events, ['code', 'verify', ...success]);
  fixture.h.stop();
});
test('a new code discards the earlier verification', async () => {
  const fixture = page({ canRegister: closedOnce() });
  await fixture.fill(); await fixture.submit(); await fixture.enter('123456'); await fixture.submit();
  await fixture.time.advance(60_000); await fixture.click('Resend code');
  await fixture.enter('123456'); await fixture.submit();
  assert.deepEqual(fixture.events, ['code', 'verify', 'code', 'verify', ...success]);
  fixture.h.stop();
});
test('mismatched passwords are rejected before any code is sent or account is created', async () => {
  const fixture = page(); await fixture.fill({ ...details, confirmPassword: 'different-password' }); await fixture.submit();
  assert.deepEqual(fixture.events, []); assert.equal(fixture.step(), 'details');
  assert.match(fixture.copy(), /Passwords do not match/);
  fixture.h.stop();
});
