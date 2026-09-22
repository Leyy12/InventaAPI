import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Set(['services/auth-navigation.ts', 'functions/subscription-lifecycle.mjs',
  'tests/adviser/r5a/navigation.test.mjs', 'tests/adviser/r5a/session.test.mjs', 'tests/adviser/r5a/wiring.test.mjs', 'tests/adviser/r5a/landing-login-modal.test.mjs'].map(file => resolvePath(root, file)));
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('node:')) {
    if (!['node:test', 'node:assert/strict', 'node:fs'].includes(specifier)
      || (specifier === 'node:fs' && !['/wiring.test.mjs', '/landing-login-modal.test.mjs'].some(file => context.parentURL?.endsWith(file)))) throw new Error('Isolated I/O prohibited');
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
