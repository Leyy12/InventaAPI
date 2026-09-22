import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['scripts/frozen-catalog-repair.mjs', 'scripts/migrate-frozen-catalog.mjs',
  'scripts/frozen-catalog-export.mjs', 'services/catalog-writer.js', 'services/catalog-audit.js',
  'services/catalog-contract.js', 'services/product-contract.js', 'services/product-submission-contract.js',
  'functions/subscription-lifecycle.mjs', 'tests/adviser/r2a/memory-firestore.mjs',
  'tests/adviser/r8c/migration.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:crypto', 'node:path', 'node:url', 'node:fs/promises'].includes(specifier)) throw Error('R8C EXTERNAL IO BLOCKED');
    return nextResolve(specifier, context);
  }
  if (!specifier.startsWith('.') && !specifier.startsWith('file:')) throw Error('R8C SDK OR EXTERNAL IO BLOCKED');
  const result = await nextResolve(specifier, context);
  if (!modules.has(fileURLToPath(result.url))) throw Error('R8C MODULE BLOCKED');
  return result;
}
export async function load(url, context, nextLoad) {
  // Test imports cannot read credentials or production evidence, or write files.
  if (url === 'node:fs/promises') return { format: 'module', shortCircuit: true,
    source: 'const deny=()=>{throw Error("R8C FILE IO BLOCKED")}; export {deny as readFile,deny as lstat,deny as mkdir,deny as open,deny as mkdtemp,deny as link,deny as unlink,deny as rm};' };
  const result = await nextLoad(url, context);
  if (url.startsWith('file:') && modules.has(fileURLToPath(url))) return { ...result,
    source: `globalThis.fetch=()=>{throw Error('R8C NETWORK BLOCKED')}; globalThis.WebSocket=class{constructor(){throw Error('R8C NETWORK BLOCKED')}};\n` + result.source.toString() };
  return result;
}
