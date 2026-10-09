import assert from 'node:assert/strict';
import test from 'node:test';
import { hooks, load, nodes, flush } from './workspace-refresh/harness.mjs';

const text = tree => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null ? '' : String(tree);
function fixture(onSignOut = async () => ({ ok: true })) {
  const h = hooks();
  const body = { style: { overflow: 'auto' } };
  let shown = 0, closed = 0, focused = 0, restored = 0, dismissals = 0, refIndex = 0;
  class Element { isConnected = true; focus() { restored++; } }
  const originalRef = h.React.useRef;
  h.React.useRef = initial => {
    const ref = originalRef(initial);
    if (refIndex++ === 0) ref.current = { showModal() { shown++; }, close() { closed++; } };
    else if (refIndex === 2) ref.current = { focus() { focused++; } };
    return ref;
  };
  const Dialog = load('dashboard/src/components/auth/SignOutDialog.tsx', 'SignOutDialog', h, {
    'lucide-react': { Loader2: 'svg', LogOut: 'svg', X: 'svg' },
  }, { document: { body, activeElement: new Element() }, HTMLElement: Element });
  h.mount(Dialog, { onSignOut, onClose: () => { dismissals++; } });
  return { h, body, button: label => nodes(h.output, n => n.type === 'button' && text(n) === label)[0],
    counts: () => ({ shown, closed, focused, restored, dismissals }) };
}

test('dialog opens modally, names itself, focuses Cancel and restores page scrolling on cleanup', () => {
  const f = fixture();
  assert.equal(f.h.output.type, 'dialog');
  assert.equal(f.h.output.props['aria-modal'], 'true');
  assert.equal(f.h.output.props['aria-labelledby'], 'sign-out-title');
  assert.equal(f.h.output.props['aria-describedby'], 'sign-out-description');
  assert.equal(f.body.style.overflow, 'hidden');
  assert.equal(f.counts().shown, 1);
  assert.equal(f.counts().focused, 1);
  f.h.stop();
  assert.equal(f.body.style.overflow, 'auto');
  assert.equal(f.counts().closed, 1);
  assert.equal(f.counts().restored, 1);
});

test('Cancel, close and Escape dismiss without signing out', () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return { ok: true }; });
  f.button('Cancel').props.onClick();
  nodes(f.h.output, n => n.props['aria-label'] === 'Close sign out dialog')[0].props.onClick();
  let prevented = false;
  f.h.output.props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(calls, 0);
  assert.equal(f.counts().dismissals, 3);
  f.h.stop();
});

test('confirmation calls existing logout once, blocks Escape while pending, and dismisses only on success', async () => {
  let calls = 0, complete;
  const f = fixture(() => { calls++; return new Promise(resolve => { complete = resolve; }); });
  const button = f.button('Sign out');
  button.props.onClick(); button.props.onClick();
  await flush();
  assert.equal(calls, 1);
  assert.equal(f.h.output.props['aria-busy'], true);
  assert.ok(nodes(f.h.output, n => n.type === 'button').every(n => n.props.disabled));
  f.h.output.props.onCancel({ preventDefault() {} });
  assert.equal(f.counts().dismissals, 0);
  complete({ ok: true }); await flush();
  assert.equal(f.counts().dismissals, 1);
  f.h.stop();
});

for (const failure of ['rejected', 'unsuccessful']) {
  test(`${failure} logout stays open, displays an error and allows retry`, async () => {
    let calls = 0;
    const f = fixture(async () => {
      if (++calls > 1) return { ok: true };
      if (failure === 'rejected') throw Error('Synthetic failure');
      return { ok: false };
    });
    f.button('Sign out').props.onClick(); await flush();
    assert.equal(f.counts().dismissals, 0);
    assert.equal(text(nodes(f.h.output, n => n.props.role === 'alert')[0]), "We couldn't sign you out. Please try again.");
    assert.equal(f.button('Sign out').props.disabled, false);
    f.button('Sign out').props.onClick(); await flush();
    assert.equal(calls, 2);
    assert.equal(f.counts().dismissals, 1);
    f.h.stop();
  });
}

test('Sidebar opens the themed confirmation; logout remains owned by the existing provider', async () => {
  const h = hooks(); let calls = 0;
  const Sidebar = load('dashboard/src/components/layout/Sidebar.tsx', 'Sidebar', h, {
    'next/link': 'a', 'next/image': 'img', 'next/navigation': { usePathname: () => '/dashboard' },
    '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
    'lucide-react': { LogOut: 'svg' },
    '@/lib/firebase/auth-context': { useAuth: () => ({ loading: false, user: { uid: 'synthetic', email: 'customer@example.invalid' },
      appUser: { plan: 'Free Trial' }, logout: async () => { calls++; return { ok: true }; } }) },
    './dashboard-navigation': { dashboardRoutes: [], routeActive: () => false },
    '@/components/auth/SignOutDialog': 'sign-out-dialog',
  }, { window: { confirm() { throw Error('Browser confirmation must not be used'); } } });
  h.mount(Sidebar);
  assert.equal(nodes(h.output, n => n.type === 'sign-out-dialog').length, 0);
  nodes(h.output, n => n.type === 'button')[0].props.onClick(); await flush();
  const dialog = nodes(h.output, n => n.type === 'sign-out-dialog')[0];
  assert.ok(dialog); assert.equal(calls, 0);
  dialog.props.onClose(); await flush();
  assert.equal(calls, 0);
  assert.equal(nodes(h.output, n => n.type === 'sign-out-dialog').length, 0);
  nodes(h.output, n => n.type === 'button')[0].props.onClick(); await flush();
  assert.equal((await nodes(h.output, n => n.type === 'sign-out-dialog')[0].props.onSignOut()).ok, true);
  assert.equal(calls, 1);
  h.stop();
});
