import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewSubmission } from '../../../admin-panel/src/lib/submission-review.ts';

const error = (status, message = 'Conflict') => Object.assign(new Error(message), { status });
for (const [decision, finalStatus] of [['reject', 'approved'], ['approve', 'rejected']]) {
  test(`stale ${decision} refetches ${finalStatus} without replaying mutation`, async () => {
    let calls = [], row = { id: 'request', status: 'submitted', productId: null }, locked = false;
    const result = await reviewSubmission({ id: row.id, decision,
      mutate: async () => { calls.push('mutate'); throw error(409); },
      lock: () => { calls.push('lock'); locked = true; },
      read: async () => { calls.push('read'); assert.equal(locked, true);
        return { id: row.id, status: finalStatus, productId: finalStatus === 'approved' ? 'product' : null }; },
    });
    assert.equal(result.kind, 'conflict'); row = result.submission; locked = false;
    assert.deepEqual(calls, ['mutate', 'lock', 'read']); assert.equal(row.status, finalStatus);
    assert.equal(row.status === 'submitted' && !locked, false);
    assert.match(result.message, /stale action was not applied/u);
  });
}
test('failed conflict refresh locks stale row and never assumes success', async () => {
  let calls = [], locked = false;
  const row = { id: 'request', status: 'submitted' };
  const result = await reviewSubmission({ id: row.id, decision: 'approve',
    mutate: async () => { calls.push('mutate'); throw error(409); },
    lock: () => { locked = true; }, read: async () => { calls.push('read'); throw error(503); },
  });
  assert.equal(result.kind, 'error'); assert.equal(result.retryable, false); assert.equal(locked, true);
  assert.equal(row.status, 'submitted'); assert.match(result.message, /no success is assumed/u);
  assert.deepEqual(calls, ['mutate', 'read']);
});
for (const status of [401, 403]) test(`access failure ${status} does not retry or refetch`, async () => {
  let locked = false;
  const result = await reviewSubmission({ id: 'request', decision: 'approve',
    mutate: async () => { throw error(status); }, lock: () => { locked = true; },
    read: async () => assert.fail('unexpected refetch'),
  });
  assert.equal(result.kind, 'error'); assert.equal(result.retryable, false); assert.equal(locked, true);
});
for (const failure of [error(503, 'Unavailable'), new Error('Network unavailable')]) test(`uncertain ${failure.message} preserves manual retry`, async () => {
  const result = await reviewSubmission({ id: 'request', decision: 'approve',
    mutate: async () => { throw failure; }, lock: () => assert.fail('must not permanently lock retry'),
    read: async () => assert.fail('must not replay/refetch automatically'),
  });
  assert.equal(result.kind, 'error'); assert.equal(result.retryable, true);
});
test('confirmed mutation retains receipt, without automatic second mutation', async () => {
  const receipt = { id: 'request', status: 'approved', productId: 'product' };
  const result = await reviewSubmission({ id: 'request', decision: 'approve', mutate: async () => receipt,
    lock: () => assert.fail(), read: async () => assert.fail(),
  });
  assert.equal(result.kind, 'success'); assert.deepEqual(result.receipt, receipt);
});
for (const wrong of [{ id: 'other', status: 'approved' }, { id: 'request', status: 'unknown' }]) {
  test(`malformed conflict refresh remains locked ${JSON.stringify(wrong)}`, async () => {
    let locked = false;
    const result = await reviewSubmission({ id: 'request', decision: 'approve',
      mutate: async () => { throw error(409); }, read: async () => wrong, lock: () => { locked = true; },
    });
    assert.equal(result.kind, 'error'); assert.equal(result.retryable, false); assert.equal(locked, true);
  });
}
test('non-final canonical conflict uses refreshed submitted state without claiming success', async () => {
  const result = await reviewSubmission({ id: 'request', decision: 'approve',
    mutate: async () => { throw error(409, 'Canonical catalog conflict'); }, lock: () => {},
    read: async () => ({ id: 'request', status: 'submitted' }),
  });
  assert.equal(result.kind, 'conflict'); assert.equal(result.submission.status, 'submitted');
  assert.match(result.message, /Canonical catalog conflict/u);
});
