import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['scripts/frozen-catalog-export.mjs', 'scripts/frozen-catalog-rest.mjs',
  'scripts/export-frozen-catalog.mjs', 'scripts/audit-catalog-identities.mjs', 'scripts/catalog-audit-emulator.mjs',
  'services/catalog-audit.js', 'services/catalog-contract.js', 'services/product-contract.js',
  'services/product-submission-contract.js', 'tests/adviser/r7c/export.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:fs/promises', 'node:path', 'node:url', 'node:os', 'node:fs', 'node:child_process'].includes(specifier)
      || (specifier === 'node:child_process' && !context.parentURL?.endsWith('/r7c/export.test.mjs'))) throw new Error('R7C EXTERNAL IO BLOCKED');
    return nextResolve(specifier, context);
  }
  if (!specifier.startsWith('.') && !specifier.startsWith('file:') && !/^[A-Za-z]:/u.test(specifier)) throw new Error('R7C EXTERNAL IO BLOCKED');
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith('file:') || !modules.has(fileURLToPath(result.url))) throw new Error('R7C MODULE BLOCKED');
  return result;
}
export async function load(url, context, nextLoad) {
  if (url.endsWith('/scripts/catalog-audit-emulator.mjs')) {
    return { format: 'module', shortCircuit: true, source: 'export function readEmulatorCatalog() { throw new Error("R7C EXTERNAL IO BLOCKED"); }' };
  }
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && modules.has(fileURLToPath(url))) return { ...result,
    source: `globalThis.fetch = () => { throw new Error('R7C EXTERNAL IO BLOCKED'); };\n` + result.source.toString() };
  return result;
}
