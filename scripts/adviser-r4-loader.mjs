import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['services/reporting.js', 'services/product-contract.js', 'tests/adviser/r4/reporting.test.mjs', 'tests/adviser/r4/wiring.test.mjs'].map(file => resolvePath(root, file)));
for (const file of ['dashboard/src/lib/quota-refresh.ts', 'dashboard/src/lib/entitlement-poller.ts', 'tests/adviser/r4/lifecycle.test.mjs']) modules.add(resolvePath(root, file));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !context.parentURL?.endsWith('/wiring.test.mjs'))) throw new Error('Isolated I/O prohibited');
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !modules.has(fileURLToPath(result.url))) throw new Error('Module outside isolated manifest');
  return result;
}
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && modules.has(fileURLToPath(url))) return { ...result, source:
    `globalThis.fetch = () => { throw new Error('External I/O blocked'); };\nglobalThis.WebSocket = class { constructor() { throw new Error('External I/O blocked'); } };\n` + result.source.toString() };
  return result;
}
