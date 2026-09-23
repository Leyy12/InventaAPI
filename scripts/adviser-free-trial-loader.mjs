import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(["functions/subscription-lifecycle.mjs","services/free-trial.js","services/api-key-security.js","services/api-key-management.js","services/account-quota.js","services/daas-security.js","services/daas-catalog.js","services/product-contract.js","services/customer-segment.js","services/reporting.js","services/product-submissions.js","services/product-submission-contract.js","services/catalog-audit.js","services/catalog-writer.js","services/catalog-contract.js","tests/adviser/phase2a/memory-firestore.mjs","tests/adviser/r2a/memory-firestore.mjs","dashboard/src/lib/entitlement-poller.ts","tests/adviser/free-trial/trial.test.mjs"].map(file => resolvePath(root, file)));
for (const file of ['functions/trial-warning.mjs', 'functions/trial-warning-email.mjs', 'admin-panel/src/lib/linked-product-names.ts', 'dashboard/src/lib/linked-product-selection.ts', 'tests/adviser/free-trial/phase2.test.mjs']) modules.add(resolvePath(root, file));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !['/trial.test.mjs', '/phase2.test.mjs'].some(name => context.parentURL?.endsWith(name)))) throw new Error('Isolated I/O prohibited');
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !modules.has(fileURLToPath(result.url))) throw new Error('Module outside isolated manifest');
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
