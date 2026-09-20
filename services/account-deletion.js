import { authenticatedPayment, requirePayment } from './payment-contract.js';

export async function beginAccountDeletion(db, uid, clock = () => new Date()) {
  return db.runTransaction(async tx => {
    const ref = db.collection('users').doc(uid);
    const account = (await tx.get(ref)).data();
    requirePayment(account?.uid === uid && account.role === 'Developer', 'ACCOUNT_UNAVAILABLE', 'Account unavailable.', 403);
    if (['deleting', 'deleted'].includes(account.accountState)) return;
    tx.update(ref, { accountState: 'deleting', deletionRequested: true,
      deletionRequestedAt: clock().toISOString(), subscription_status: 'inactive', apiRequestLimit: 0 });
  });
}

// Safe to invoke again from the same authenticated request, or by an operator
// with server credentials after Auth deletion made customer retries impossible.
export async function completeAccountDeletion(db, uid, deleteAuthUser, clock = () => new Date()) {
  const ref = db.collection('users').doc(uid);
  const initial = (await ref.get()).data();
  requirePayment(initial?.uid === uid && ['deleting', 'deleted'].includes(initial.accountState), 'DELETION_NOT_STARTED');
  if (initial.accountState === 'deleted') return { deleted: true };
  // The marker is already committed. Bounded individual transactions avoid a
  // 500-write limit, preserve other accounts, and make partial cleanup resumable.
  const keys = await db.collection('api_keys').where('userId', '==', uid).get();
  for (const key of keys.docs) {
    await db.runTransaction(async tx => {
      const keyRef = db.collection('api_keys').doc(key.id);
      const saved = (await tx.get(keyRef)).data();
      if (saved?.userId === uid && saved.status !== 'revoked') tx.update(keyRef, { status: 'revoked', revokedAt: clock().toISOString() });
    });
  }
  await db.runTransaction(async tx => {
    const usageRef = db.collection('account_api_usage').doc(uid);
    const usage = (await tx.get(usageRef)).data();
    tx.set(usageRef, { ...usage, blocked: true });
  });
  // No cross-system atomicity claim. Failure here leaves the account blocked.
  try { await deleteAuthUser(uid); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  await db.runTransaction(async tx => {
    const account = (await tx.get(ref)).data();
    requirePayment(account && ['deleting', 'deleted'].includes(account.accountState), 'DELETION_STATE_CHANGED');
    if (account.accountState === 'deleted') return;
    // Retain a protected tombstone and dates, not a reusable profile. Financial
    // orders/receipts/events and quota evidence are never purged by this flow.
    tx.set(ref, { uid, role: 'Developer', plan: 'Free', apiRequestLimit: 0,
      subscription_status: 'inactive', accountState: 'deleted', deletionRequested: true,
      deletionRequestedAt: account.deletionRequestedAt, deletedAt: clock().toISOString(),
      ...(account.subscriptionExpiresAt != null ? { subscriptionExpiresAt: account.subscriptionExpiresAt } : {}),
      ...(account.lastSubscribedAt != null ? { lastSubscribedAt: account.lastSubscribedAt } : {}),
      ...(account.subscriptionStartedAt != null ? { subscriptionStartedAt: account.subscriptionStartedAt } : {}) });
  });
  return { deleted: true };
}

export function createAccountDeletionHandler({ getDb, verifyIdToken, deleteAuthUser, clock = () => new Date() }) {
  return authenticatedPayment({ getDb, verifyIdToken }, async (req, res, uid, db) => {
    requirePayment(req.body?.confirm === true, 'CONFIRM_DELETION', 'Explicit deletion confirmation required.', 400);
    await beginAccountDeletion(db, uid, clock);
    try { return res.json(await completeAccountDeletion(db, uid, deleteAuthUser, clock)); }
    catch { return res.status(202).json({ deleted: false, accessDisabled: true, state: 'deleting',
      message: 'Access is disabled. Cleanup is incomplete; retry or contact support.' }); }
  });
}
