import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['services/admin-traffic.js', 'services/api-key-security.js', 'functions/subscription-lifecycle.mjs',
  'services/reporting.js', 'services/product-contract.js', 'admin-panel/src/lib/admin-traffic.ts',
  'tests/adviser/phase2a/memory-firestore.mjs', 'tests/adviser/r6a/backend.test.mjs',
  'tests/adviser/r6a/frontend.test.mjs', 'tests/adviser/r6a/wiring.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:fs'].includes(specifier)
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
    `globalThis.fetch = () => { throw new Error('External I/O blocked'); };\nglobalThis.WebSocket = class { constructor() { throw new Error('External I/O blocked'); } };\nglobalThis.XMLHttpRequest = globalThis.WebSocket;\n` + result.source.toString() };
  return result;
}
