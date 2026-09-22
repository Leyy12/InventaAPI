/**
 * trialWatcher.js
 *
 * Lazy trial watcher — runs a sweep on server startup and can be called
 * at any point (e.g. triggered by DaaS API calls) to:
 *
 *  1. Day 4 (3 days left): Send in-app notification + email to user
 *  2. Day 7 (expired):     Revoke active trial API keys, reset plan to Free,
 *                          send in-app notification + email
 *
 * No cron daemon required.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { sendTrialExpiryWarning, sendTrialExpiredEmail } from '../routes/email.js';

let adminDb = null;
function getDb() {
  if (!adminDb) adminDb = getFirestore();
  return adminDb;
}

const UPGRADE_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?openSubscription=pro`;

/** Write a notification document for a customer */
async function writeNotification(userId, { type, title, body, meta = {} }) {
  await getDb().collection('notifications').add({
    userId,
    type,
    title,
    body,
    read:      false,
    createdAt: new Date(),
    meta,
  });
}

/**
 * Run the trial watcher sweep.
 * Safe to call multiple times — all checks are idempotent.
 */
export async function runTrialWatcher() {
  const now = new Date();
  console.log(`[TRIAL WATCHER] Running sweep at ${now.toISOString()}`);

  try {
    // Fetch all FreeTrial users
    const usersSnap = await getDb().collection('users')
      .where('plan', '==', 'FreeTrial')
      .get();

    if (usersSnap.empty) {
      console.log('[TRIAL WATCHER] No active FreeTrial users found.');
      return;
    }

    for (const userDoc of usersSnap.docs) {
      const userId   = userDoc.id;
      const userData = userDoc.data();
      const { trialExpiresAt, trialDay4NotifSent, email: userEmail, fullName } = userData;

      if (!trialExpiresAt) continue;

      const expiresAt  = new Date(trialExpiresAt);
      const msLeft     = expiresAt - now;
      const daysLeft   = Math.ceil(msLeft / 86400000);
      const hasExpired = msLeft <= 0;

      // ── CASE 1: EXPIRED (Day 7+) ─────────────────────────────────────
      if (hasExpired) {
        console.log(`[TRIAL WATCHER] User ${userId} trial EXPIRED. Revoking keys…`);

        // Revoke all active trial API keys
        const keysSnap = await getDb().collection('api_keys')
          .where('userId', '==', userId)
          .where('status', '==', 'active')
          .get();

        const batch = getDb().batch();
        keysSnap.docs.forEach(kDoc => {
          batch.update(kDoc.ref, {
            status:           'revoked',
            revokedAt:        now.toISOString(),
            revokedReason:    'free_trial_expired',
          });
        });
        // Reset user plan back to Free
        batch.update(getDb().collection('users').doc(userId), {
          plan:            'Free',
          apiRequestLimit: 50,
          trialExpiredAt:  now.toISOString(),
        });
        await batch.commit();

        // In-app notification
        await writeNotification(userId, {
          type:  'trial_expired',
          title: 'Your Free Trial Has Expired 🔴',
          body:  'Your 7-Day Free Trial has ended. Your API key is now inactive. Subscribe to the Pro Plan to reactivate your service.',
          meta:  { upgradeUrl: UPGRADE_URL },
        });

        // Email notification
        if (userEmail) {
          await sendTrialExpiredEmail(userEmail, fullName || '', UPGRADE_URL);
        }

        // Audit
        getDb().collection('audit_logs').add({
          action:    'Free Trial Expired',
          userId,
          email:     userEmail || '',
          expiredAt: now.toISOString(),
          timestamp: now,
        }).catch(console.error);

        continue;
      }

      // ── CASE 2: DAY 4 WARNING (3 days left) ─────────────────────────
      if (daysLeft <= 3 && !trialDay4NotifSent) {
        console.log(`[TRIAL WATCHER] User ${userId} has ${daysLeft} day(s) left. Sending Day-4 warning…`);

        // In-app notification
        await writeNotification(userId, {
          type:  'trial_expiring_soon',
          title: 'Your Free Trial is Expiring Soon ⚠️',
          body:  `Your 7-Day Free Trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Subscribe to the Pro Plan to keep your API service uninterrupted.`,
          meta:  { daysLeft: String(daysLeft), upgradeUrl: UPGRADE_URL },
        });

        // Email notification
        if (userEmail) {
          await sendTrialExpiryWarning(userEmail, fullName || '', daysLeft, UPGRADE_URL);
        }

        // Mark as sent so we don't spam the user
        await getDb().collection('users').doc(userId).update({
          trialDay4NotifSent: true,
        });

        // Audit
        getDb().collection('audit_logs').add({
          action:    'Free Trial Day-4 Warning Sent',
          userId,
          email:     userEmail || '',
          daysLeft,
          timestamp: now,
        }).catch(console.error);
      }
    }

    console.log(`[TRIAL WATCHER] Sweep complete. Processed ${usersSnap.size} FreeTrial user(s).`);
  } catch (err) {
    console.error('[TRIAL WATCHER] Error during sweep:', err.message);
  }
}

/**
 * Schedule recurring watcher every 6 hours using native setInterval.
 * Call once on server startup.
 */
export function startTrialWatcher() {
  // Run immediately on startup
  runTrialWatcher().catch(console.error);

  // Then every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(() => runTrialWatcher().catch(console.error), SIX_HOURS);
  console.log('[TRIAL WATCHER] Scheduled. Will run every 6 hours.');
}
