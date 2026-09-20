import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(["functions/subscription-lifecycle.mjs","services/api-key-security.js","services/api-key-management.js","services/account-quota.js","services/daas-catalog.js","services/product-contract.js","services/payment-contract.js","services/payment-checkout.js","services/paymongo-checkout.js","services/payment-webhook.js","services/account-deletion.js","services/admin-entitlements.js","tests/adviser/phase2b1/memory-firestore.mjs","tests/adviser/phase2b2/lifecycle.test.mjs","tests/adviser/phase2b2/wiring.test.mjs"].map(file => resolvePath(root, file)));
for (const file of ['dashboard/src/lib/entitlement-poller.ts', 'tests/adviser/phase2b2/polling.test.mjs',
  'tests/adviser/phase2b2/calendar.test.mjs']) modules.add(resolvePath(root, file));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !context.parentURL?.endsWith('/wiring.test.mjs'))) {
      throw new Error(`Isolated payment tests prohibit ${specifier}`);
    }
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !modules.has(fileURLToPath(result.url))) throw new Error('Module outside isolated payment manifest');
  return result;
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && modules.has(fileURLToPath(url))) {
    return { ...result, source: `globalThis.fetch = () => { throw new Error('External I/O blocked'); };
globalThis.WebSocket = class { constructor() { throw new Error('External I/O blocked'); } };
globalThis.XMLHttpRequest = globalThis.WebSocket;\n` + result.source.toString() };
  }
  return result;
}
