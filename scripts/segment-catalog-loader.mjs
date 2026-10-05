import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const allowed = new Set(['functions/entitlement-limits.mjs', 'services/customer-catalog.js', 'services/product-contract.js', 'services/customer-segment.js',
  'dashboard/src/lib/segment-catalog.ts', 'dashboard/src/lib/trial-catalog-selection.ts',
  'dashboard/src/lib/trial-display.mjs', 'dashboard/src/lib/linked-product-selection.ts',
  'tests/adviser/phase2a/memory-firestore.mjs', 'tests/adviser/segment-catalog/catalog.test.mjs',
  'tests/adviser/segment-catalog/customer.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !context.parentURL?.includes('/tests/adviser/segment-catalog/'))) throw new Error('Isolated I/O prohibited');
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !allowed.has(fileURLToPath(result.url))) throw new Error('Module outside isolated manifest');
  return result;
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && allowed.has(fileURLToPath(url))) return { ...result,
    source: `globalThis.fetch = () => { throw new Error('External I/O blocked'); };
globalThis.WebSocket = class { constructor() { throw new Error('External I/O blocked'); } };
globalThis.XMLHttpRequest = globalThis.WebSocket;\n` + result.source.toString() };
  return result;
}
