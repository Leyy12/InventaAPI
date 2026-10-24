import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRepeatGuard } from '../../services/daas-repeat-guard.js';

async function server(handlerDelay = 0, status = 200) {
  let clock = 0, calls = 0;
  const app = express();
  app.get('/catalog', createRepeatGuard({ windowMs: 2000, now: () => clock }), async (req, res) => {
    calls += 1;
    await new Promise(resolve => setTimeout(resolve, handlerDelay));
    res.status(status).json({ call: calls, q: req.query.page ?? null });
  });
  const listener = await new Promise(resolve => { const l = app.listen(0, '127.0.0.1', () => resolve(l)); });
  const base = `http://127.0.0.1:${listener.address().port}`;
  const get = (path, key = 'k1') => fetch(base + path, { headers: { 'x-api-key': key } }).then(async r => ({ status: r.status, reused: r.headers.get('x-inventa-repeat'), body: await r.json() }));
  return { get, calls: () => calls, tick: ms => { clock += ms; }, close: () => new Promise(resolve => listener.close(resolve)) };
}

test('a repeated request within 2 seconds reuses the first answer and is not handled again', async () => {
  const s = await server();
  try {
    const first = await s.get('/catalog');
    s.tick(200);
    const second = await s.get('/catalog');
    assert.deepEqual(second.body, first.body); assert.equal(second.reused, 'reused'); assert.equal(s.calls(), 1);
    s.tick(2000);
    const third = await s.get('/catalog');
    assert.equal(third.reused, null); assert.equal(s.calls(), 2);
  } finally { await s.close(); }
});

test('a repeat that arrives while the first is still running waits for it', async () => {
  const s = await server(150);
  try {
    const [a, b] = await Promise.all([s.get('/catalog'), s.get('/catalog')]);
    assert.deepEqual(a.body, b.body); assert.equal(s.calls(), 1);
  } finally { await s.close(); }
});

test('different keys, different URLs and failed answers are never reused', async () => {
  const s = await server();
  try {
    await s.get('/catalog', 'k1'); await s.get('/catalog', 'k2'); await s.get('/catalog?page=2', 'k1');
    assert.equal(s.calls(), 3);
  } finally { await s.close(); }
  const f = await server(0, 401);
  try {
    await f.get('/catalog'); const again = await f.get('/catalog');
    assert.equal(again.status, 401); assert.equal(again.reused, null); assert.equal(f.calls(), 2);
  } finally { await f.close(); }
});
