import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// Only the scheduler (Vercel Cron, holding CRON_SECRET) may start the daily jobs.
process.env.CRON_SECRET = 'synthetic-cron-secret-0123456789';
delete process.env.SUPABASE_DB_URL;
const { default: cron } = await import('../../routes/cron.js');
const app = express(); app.use('/cron', cron);
const server = app.listen(0); const port = server.address().port;
test.after(() => server.close());
const call = (path, authorization) => fetch(`http://127.0.0.1:${port}/cron${path}`,
  { headers: authorization ? { authorization } : {} });

test('jobs refuse callers without the exact scheduler secret', async () => {
  for (const path of ['/subscriptions', '/trial-warnings']) {
    for (const header of [undefined, 'Bearer wrong', `Bearer ${process.env.CRON_SECRET}x`, process.env.CRON_SECRET]) {
      assert.equal((await call(path, header)).status, 401, `${path} ${header}`);
    }
  }
});
test('the scheduler reaches the job; a failure is reported without details', async () => {
  // No database configured here, so the job itself fails after authorization.
  const response = await call('/subscriptions', `Bearer ${process.env.CRON_SECRET}`);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /SUPABASE|postgres/iu);
});
test('a short secret leaves the jobs off', async () => {
  const saved = process.env.CRON_SECRET; process.env.CRON_SECRET = 'short';
  try { assert.equal((await call('/subscriptions', 'Bearer short')).status, 401); }
  finally { process.env.CRON_SECRET = saved; }
});
