// Daily scheduled jobs (run by routes/cron.js from Vercel Cron). The database and
// the account normalizer are passed in so tests run the same code.
import { normalizeExpiredAccount } from '../functions/subscription-lifecycle.mjs';
import { processTrialWarning } from '../functions/trial-warning.mjs';

// Paid plans past their end date move back to Free.
export async function downgradeExpiredSubscriptions(db, normalize = normalizeExpiredAccount, log = console) {
  let downgraded = 0, failed = 0;
  for (const plan of ['Pro', 'pro', 'Professional', 'professional', 'Pro Max', 'pro max']) {
    const users = await db.collection('users').where('plan', '==', plan).get();
    for (const user of users.docs) {
      // Re-read in a transaction: a concurrent renewal cannot be lost.
      try { if (await normalize(db, user.id)) downgraded++; }
      catch (error) { failed++; log.error('[SUBSCRIPTION REVIEW]', { uid: user.id, code: error.code || 'UNAVAILABLE' }); }
    }
  }
  return { downgraded, failed };
}

// Active Pro / Pro Max plans ending within 3 days get one reminder (email + bell).
export async function sendPlanExpiryReminders(db, { notify, messages, now = new Date(), log = console }) {
  let reminded = 0, failed = 0;
  const soon = now.getTime() + 3 * 86400000;
  for (const plan of ['Pro', 'Pro Max']) {
    const users = await db.collection('users').where('plan', '==', plan).get();
    for (const user of users.docs) {
      const account = user.data(), end = Date.parse(account.subscriptionExpiresAt ?? '');
      if (account.subscription_status !== 'active' || !Number.isFinite(end) || end <= now.getTime() || end > soon) continue;
      try {
        const result = await notify(db, { userId: user.id, email: account.email, id: `plan-expiring-${user.id}-${end}`,
          ...messages.planExpiring(plan, account.subscriptionExpiresAt) });
        if (result.created) reminded++;
      } catch { failed++; log.error('[PLAN REMINDER]', { uid: user.id }); }
    }
  }
  return { reminded, failed };
}

// Trials ending within 3 days get one warning email. UTC, paged, one indexed field.
export async function sendTrialWarnings(db, { from, sendEmail, now = new Date(), log = console }) {
  let query = db.collection('users').where('trialExpiresAt', '>', now.toISOString())
    .where('trialExpiresAt', '<=', new Date(now.getTime() + 3 * 86400000).toISOString())
    .orderBy('trialExpiresAt').limit(200);
  let inspected = 0, accepted = 0, failed = 0;
  for (;;) {
    const page = await query.get();
    if (page.empty) break;
    for (const user of page.docs) {
      inspected++;
      try { if (await processTrialWarning(db, user.id, { from, sendEmail })) accepted++; }
      catch { failed++; log.error('[TRIAL WARNING]', { uid: user.id, code: 'DELIVERY_UNCONFIRMED' }); }
    }
    if (page.size < 200) break;
    query = query.startAfter(page.docs.at(-1));
  }
  return { inspected, accepted, failed };
}
