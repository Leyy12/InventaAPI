import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set([
  'services/api-key-security.js', 'services/api-key-management.js', 'services/account-quota.js',
  'services/daas-security.js', 'services/daas-catalog.js', 'services/product-contract.js',
  'tests/adviser/phase2a/memory-firestore.mjs', 'tests/adviser/phase2a/api-key-security.test.mjs',
  'tests/adviser/phase2a/rules-and-wiring.test.mjs',
].map(path => resolve(root, path)));
const builtins = new Set(['node:test', 'node:assert/strict', 'node:crypto', 'node:fs']);

export async function resolveModule(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!builtins.has(specifier)) throw new Error(`Isolated tests prohibit import: ${specifier}`);
    // Filesystem access is only for fixed, read-only source assertions.
    if (specifier === 'node:fs' && !context.parentURL?.endsWith('/rules-and-wiring.test.mjs')) {
      throw new Error('Isolated service modules may not access the filesystem.');
    }
    return nextResolve(specifier, context);
  }
  const resolved = await nextResolve(specifier, context);
  if (!resolved.url.startsWith('file:') || !modules.has(fileURLToPath(resolved.url))) {
    throw new Error(`Module is outside the isolated Phase 2A manifest: ${specifier}`);
  }
  return resolved;
}

export { resolveModule as resolve };

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && modules.has(fileURLToPath(url))) {
    const guard = `globalThis.fetch = () => { throw new Error('Network disabled in adviser tests'); };
globalThis.WebSocket = class { constructor() { throw new Error('Network disabled in adviser tests'); } };
globalThis.XMLHttpRequest = globalThis.WebSocket;\n`;
    return { ...result, source: guard + result.source.toString() };
  }
  return result;
}
