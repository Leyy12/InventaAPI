import { createHash, randomUUID } from 'node:crypto';
import { accountBlocked, evaluateEntitlement, dateMillis } from './subscription-lifecycle.mjs';

export const WARNING_AFTER_MS = 4 * 24 * 60 * 60 * 1000;
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000; // Resend retains idempotency keys for 24h.
const LEASE_MS = 7 * 60 * 1000; // Longer than the scheduled Function timeout.
const CUSTOMER_ROLES = new Set(['developer', 'consumer', 'business']);

export function warningEligible(account, usage, now) {
  if (accountBlocked(account) || !CUSTOMER_ROLES.has(String(account?.role).toLowerCase())) return false;
  if (typeof account.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(account.email.trim())) return false;
  const start = dateMillis(account.trialStartedAt), end = dateMillis(account.trialExpiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now.getTime() < start + WARNING_AFTER_MS || now.getTime() >= end) return false;
  try { if (!evaluateEntitlement(account, now).activeTrial) return false; } catch { return false; }
  return usage && usage.startedAt === account.trialStartedAt && usage.expiresAt === account.trialExpiresAt
    && Number.isSafeInteger(usage.used) && usage.used >= 0 && usage.used < 500;
}

function warningPayload(account, from) {
  const expiresAt = account.trialExpiresAt;
  return {
    from,
    to: [account.email.trim()],
    subject: 'Your 7-Day Pro Trial is approaching its end',
    text: `Your 7-Day Pro Trial is approaching its end on ${expiresAt} (UTC). You can upgrade to Pro if you want to keep Pro access. After Trial ends, your account returns to Free; existing API keys are not revoked.`,
  };
}

export function warningId(uid, startedAt) {
  return createHash('sha256').update(`${uid}\u0000${startedAt}`).digest('hex');
}

// A Firestore transaction owns each attempt; the provider receives the same frozen
// payload and idempotency key on every retry. After the provider's 24h dedupe
// window, uncertainty requires operator review rather than risking a second email.
export async function processTrialWarning(db, uid, { now = () => new Date(), from, sendEmail }) {
  if (!from || typeof sendEmail !== 'function') throw new Error('Trial warning email is not configured.');
  const userRef = db.collection('users').doc(uid), usageRef = db.collection('account_trial_usage').doc(uid);
  const claimed = await db.runTransaction(async tx => {
    const userSnap = await tx.get(userRef), usageSnap = await tx.get(usageRef);
    const account = userSnap.data(), usage = usageSnap.data(), instant = now();
    if (!warningEligible(account, usage, instant)) return null;
    const id = warningId(uid, account.trialStartedAt);
    const ref = db.collection('trial_warning_deliveries').doc(id);
    const prior = (await tx.get(ref)).data();
    if (['accepted', 'needs_review', 'superseded'].includes(prior?.status) || dateMillis(prior?.leaseUntil) > instant.getTime()) return null;
    if (prior && (prior.startedAt !== account.trialStartedAt || prior.expiresAt !== account.trialExpiresAt)) return null;
    if (prior && prior.payload?.to?.[0] !== account.email.trim()) {
      tx.update(ref, { status: 'needs_review', leaseUntil: null, updatedAt: instant.toISOString() });
      return null;
    }
    if (prior && instant.getTime() - dateMillis(prior.firstAttemptAt) >= RETRY_WINDOW_MS) {
      tx.update(ref, { status: 'needs_review', leaseUntil: null, updatedAt: instant.toISOString() });
      return null;
    }
    const attemptId = randomUUID();
    const record = prior || {
      userId: uid, startedAt: account.trialStartedAt, expiresAt: account.trialExpiresAt,
      firstAttemptAt: instant.toISOString(), idempotencyKey: `trial-day4/${id}`,
      payload: warningPayload(account, from),
    };
    const leaseUntil = new Date(instant.getTime() + LEASE_MS).toISOString();
    tx.set(ref, { ...record, status: 'sending', attemptId, leaseUntil, updatedAt: instant.toISOString() });
    return { ref, record, attemptId };
  });
  if (!claimed) return false;
  // Recheck immediately before the external operation. A renewal, deletion or
  // final Trial request after the claim should suppress the warning where seen.
  const latestUser = await userRef.get(), latestUsage = await usageRef.get();
  if (!warningEligible(latestUser.data(), latestUsage.data(), now())) {
    await db.runTransaction(async tx => {
      const current = (await tx.get(claimed.ref)).data();
      if (current?.attemptId === claimed.attemptId && current.status === 'sending')
        tx.update(claimed.ref, { status: 'superseded', leaseUntil: null, updatedAt: now().toISOString() });
    });
    return false;
  }
  let providerId;
  try {
    providerId = await sendEmail(claimed.record.payload, claimed.record.idempotencyKey);
    if (typeof providerId !== 'string' || !providerId) throw new Error('Email provider did not confirm acceptance.');
  } catch (error) {
    // Do not claim success. The same frozen request can be retried within 23h.
    throw Object.assign(new Error('Trial warning email acceptance is unconfirmed.'), { cause: error });
  }
  await db.runTransaction(async tx => {
    const current = (await tx.get(claimed.ref)).data();
    if (current?.attemptId !== claimed.attemptId || current.status !== 'sending') return;
    const notificationRef = db.collection('notifications').doc(`trial-day4-${warningId(uid, claimed.record.startedAt)}`);
    tx.set(notificationRef, {
      userId: uid, type: 'trial_expiring', title: 'Your 7-Day Pro Trial is ending soon',
      body: `Your Trial ends on ${claimed.record.expiresAt} (UTC). Upgrade to Pro to keep Pro access. Your keys remain valid on Free.`,
      read: false, createdAt: now(), meta: { trialExpiresAt: claimed.record.expiresAt },
    });
    tx.update(claimed.ref, { status: 'accepted', providerId, leaseUntil: null, acceptedAt: now().toISOString() });
  });
  return true;
}
