// Firebase was fully replaced by Supabase (data, sign-in and photo storage).
// This keeps its packages, config files and imports from coming back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

test('no Firebase packages in any package.json', () => {
  for (const file of tracked.filter(path => path.endsWith('package.json'))) {
    const pkg = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    for (const deps of [pkg.dependencies, pkg.devDependencies]) {
      for (const name of Object.keys(deps || {})) assert.doesNotMatch(name, /firebase/i, `${file}: ${name}`);
    }
  }
});

test('no Firebase config or rules files', () => {
  for (const file of ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', '.firebaserc']) {
    assert.equal(existsSync(new URL(file, root)), false, file);
  }
  assert.deepEqual(tracked.filter(path => /(^|\/)(firebase|firestore)[^/]*$/i.test(path)), []);
});

test('no app code imports Firebase', () => {
  const code = tracked.filter(path => /\.(?:m?js|cjs|tsx?)$/.test(path) && !path.startsWith('tests/'));
  for (const file of code) {
    const source = readFileSync(new URL(file, root), 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:@firebase\/|firebase(?:-admin|-functions)?(?:\/|['"]))/, file);
  }
});
