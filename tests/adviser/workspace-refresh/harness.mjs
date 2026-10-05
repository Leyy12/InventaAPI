// Execute real frontend effects with synthetic dependencies, not Firebase or
// Production. This hook runner is deliberately not a browser/visual test.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('../../../dashboard/node_modules/typescript');
export const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
export function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  const schedule = (fn, delay = 0) => { timers.set(++id, { fn, at: now + delay }); return id; };
  return { timers, now: () => now, schedule, cancel: key => timers.delete(key),
    async advance(ms) {
      const end = now + ms;
      let steps = 0;
      for (;;) {
        const next = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        if (++steps > 2000) throw Error('Unbounded timer loop');
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      now = end; await flush();
    } };
}
export function browser() {
  const window = new EventTarget(), document = new EventTarget();
  window.location = { pathname: '/dashboard/products' };
  window.scrollY = 143;
  document.visibilityState = 'visible';
  return { window, document,
    cycle() {
      window.dispatchEvent(new Event('blur'));
      document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
      document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    } };
}
export function hooks() {
  const slots = []; let index = 0, component, props, output, active = true, scheduled = false;
  const effects = [];
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const rerender = () => {
    if (!active || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (active) render(); });
  };
  const React = {
    useState(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => {
        const value = typeof update === 'function' ? update(slots[i].value) : update;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; rerender(); }
      }];
    },
    useRef(initial) { const i = index++; slots[i] ??= { value: { current: initial } }; return slots[i].value; },
    useMemo(fn, deps) { const i = index++; if (changed(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = index++;
      if (changed(slots[i]?.deps, deps)) effects.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  function render() { index = 0; output = component(props); while (effects.length) effects.shift()(); return output; }
  return { React, get output() { return output; },
    mount(fn, value = {}) { component = fn; props = value; return render(); },
    render(value = props) { props = value; return render(); },
    stop() { active = false; for (const slot of slots) slot?.cleanup?.(); },
  };
}
export function load(path, name, h, imports, globals = {}) {
  const source = readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(result + `\nexports.testComponent = ${name};`, {
    exports, require: id => {
      if (id === 'react') return h.React;
      if (id === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      if (Object.hasOwn(imports, id)) return imports[id];
      throw Error('Unexpected isolated import: ' + id);
    }, console, Promise, AbortController, AbortSignal, URLSearchParams, Set, Map,
    setTimeout, clearTimeout, setInterval, clearInterval,
    process: { env: { NEXT_PUBLIC_API_URL: 'https://synthetic.invalid', NODE_ENV: 'test' } },
    fetch() { throw Error('External I/O prohibited'); }, ...globals,
  }, { filename: path });
  return exports.testComponent;
}
export function nodes(tree, predicate) {
  const result = [];
  const visit = value => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object') return;
    if (predicate(value)) result.push(value);
    visit(value.props?.children);
  };
  visit(tree); return result;
}
