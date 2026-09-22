import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['functions/subscription-lifecycle.mjs', 'services/api-key-security.js',
  'services/payment-contract.js', 'services/paymongo-checkout.js', 'services/payment-checkout.js',
  'services/payment-webhook.js', 'scripts/validate-release-config.mjs',
  'tests/adviser/phase2b1/memory-firestore.mjs', 'tests/adviser/r6c/payment-mode.test.mjs',
  'tests/adviser/r6c/wiring.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:url', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !context.parentURL?.endsWith('/r6c/wiring.test.mjs'))) {
      throw new Error(`Isolated R6C tests prohibit ${specifier}`);
    }
    return nextResolve(specifier, context);
  }
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !modules.has(fileURLToPath(result.url))) throw new Error('Module outside isolated R6C manifest');
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
