import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const testFiles = [
  resolve(repositoryRoot, 'tests/adviser/phase1/product-contract.test.mjs'),
  resolve(repositoryRoot, 'tests/adviser/phase1/daas-catalog.test.mjs'),
];
const allowedSourceRoots = [
  resolve(repositoryRoot, 'tests/adviser/phase1'),
  resolve(repositoryRoot, 'services'),
];
const allowedNodeImports = new Set(['node:assert/strict', 'node:test']);
const forbiddenRuntimePatterns = [
  [/\bfetch\s*\(/u, 'network fetch'],
  [/\bXMLHttpRequest\b/u, 'XMLHttpRequest'],
  [/\bfirebase(?:-admin)?(?:\/|['"])/iu, 'Firebase SDK'],
  [/database[\\/]firebase/iu, 'Firebase database bootstrap'],
  [/\bpaymongo\b/iu, 'PayMongo'],
  [/node:(?:http|https|net|tls)/u, 'network module'],
  [/\brequire\s*\(/u, 'CommonJS runtime loading'],
  [/\bimport\s*\(\s*[^'"\s]/u, 'non-literal dynamic import'],
];

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function resolveLocalImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(importer), specifier);
  return extname(candidate) ? candidate : `${candidate}.js`;
}

function inspectIsolatedModuleGraph(entryFiles) {
  const pending = [...entryFiles];
  const inspected = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (inspected.has(file)) continue;
    if (!inside(repositoryRoot, file) || !allowedSourceRoots.some(root => inside(root, file))) {
      throw new Error(`Unsafe adviser test dependency outside the isolated roots: ${relative(repositoryRoot, file)}`);
    }

    const source = readFileSync(file, 'utf8');
    for (const [pattern, label] of forbiddenRuntimePatterns) {
      if (pattern.test(source)) {
        throw new Error(`Unsafe adviser test dependency in ${relative(repositoryRoot, file)}: ${label} is not allowed.`);
      }
    }

    const specifiers = [];
    const staticImports = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
    const dynamicImports = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;
    for (const pattern of [staticImports, dynamicImports]) {
      let match;
      while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
    }

    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) {
        if (!allowedNodeImports.has(specifier)) {
          throw new Error(`Unsafe Node import "${specifier}" in ${relative(repositoryRoot, file)}.`);
        }
        continue;
      }
      const local = resolveLocalImport(file, specifier);
      if (!local) {
        throw new Error(`Unsafe external package import "${specifier}" in ${relative(repositoryRoot, file)}.`);
      }
      pending.push(local);
    }
    inspected.add(file);
  }
  return inspected;
}

const inspected = inspectIsolatedModuleGraph(testFiles);
const safeEnvironment = { ...process.env };
for (const name of Object.keys(safeEnvironment)) {
  if (/^(?:FIREBASE_|NEXT_PUBLIC_FIREBASE_|GCLOUD_PROJECT$|GOOGLE_APPLICATION_CREDENTIALS$|GOOGLE_CLOUD_PROJECT$|PAYMONGO_)/u.test(name)) {
    delete safeEnvironment[name];
  }
}
Object.assign(safeEnvironment, {
  NODE_ENV: 'test',
  ADVISER_TEST_MODE: 'isolated-unit',
  ADVISER_TEST_EXTERNAL_IO: 'disabled',
  FIREBASE_PROJECT_ID: 'demo-inventaapi-adviser-tests',
  GCLOUD_PROJECT: 'demo-inventaapi-adviser-tests',
  GOOGLE_CLOUD_PROJECT: 'demo-inventaapi-adviser-tests',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:9',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9',
  STORAGE_EMULATOR_HOST: '127.0.0.1:9',
});

console.log(`[adviser-phase1] Isolated source graph verified (${inspected.size} modules).`);
console.log('[adviser-phase1] Live Firebase configuration removed; Firebase endpoints pinned to non-production localhost.');
console.log('[adviser-phase1] Fixed unit-test manifest contains no Firebase, network, or PayMongo imports.');

const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...testFiles], {
  cwd: repositoryRoot,
  env: safeEnvironment,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
