import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminDb = null;
function getDb() {
  if (!adminDb) adminDb = getFirestore();
  return adminDb;
}

const router = express.Router();

const TRIAL_ITEM_QUOTA    = 500;
const TRIAL_DURATION_DAYS = 7;

/**
 * POST /api/v1/free-trial/activate
 * Activates the one-time 7-day Free Trial for an authenticated user.
 */
router.post('/activate', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'A valid Firebase ID token is required.',
    });
  }

  let userId;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    userId = decoded.uid;
  } catch {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHENTICATED',
      message: 'Your session is invalid or expired. Please sign in again.',
    });
  }

  try {
    const userRef = getDb().collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        error: 'ACCOUNT_NOT_FOUND',
        message: 'User account not found.',
      });
    }

    const userData = userSnap.data();

    // Guard: one-time use per account
    if (userData.hasUsedFreeTrial) {
      return res.status(403).json({
        success: false,
        error: 'TRIAL_ALREADY_USED',
        message: 'You have already used your one-time Free Trial. Subscribe to the Pro Plan to continue.',
        upgrade_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?openSubscription=pro`,
      });
    }

    // Guard: only Free plan users may activate trial
    const currentPlan = (userData.plan || '').toLowerCase();
    if (currentPlan !== 'free' && currentPlan !== 'starter') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PLAN',
        message: `The Free Trial is only available for users on the Free plan. Your current plan is: ${userData.plan}.`,
      });
    }

    const trialStartedAt = new Date();
    const trialExpiresAt = new Date(trialStartedAt);
    trialExpiresAt.setDate(trialExpiresAt.getDate() + TRIAL_DURATION_DAYS);

    await userRef.update({
      plan:                'FreeTrial',
      apiRequestLimit:     TRIAL_ITEM_QUOTA,
      hasUsedFreeTrial:    true,
      trialStartedAt:      trialStartedAt.toISOString(),
      trialExpiresAt:      trialExpiresAt.toISOString(),
      trialDay4NotifSent:  false,
    });

    getDb().collection('audit_logs').add({
      action:         'Free Trial Activated',
      userId,
      email:          userData.email || '',
      trialStartedAt: trialStartedAt.toISOString(),
      trialExpiresAt: trialExpiresAt.toISOString(),
      timestamp:      new Date(),
    }).catch(console.error);

    console.log(`[FREE TRIAL] User ${userId} activated Free Trial. Expires: ${trialExpiresAt.toISOString()}`);

    return res.status(200).json({
      success: true,
      message: 'Your 7-Day Free Trial has been activated successfully.',
      trial: {
        plan:         'FreeTrial',
        itemQuota:    TRIAL_ITEM_QUOTA,
        startedAt:    trialStartedAt.toISOString(),
        expiresAt:    trialExpiresAt.toISOString(),
        durationDays: TRIAL_DURATION_DAYS,
      },
    });
  } catch (err) {
    console.error('[FREE TRIAL] Error activating trial:', err);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to activate Free Trial. Please try again later.',
    });
  }
});

/**
 * GET /api/v1/free-trial/status
 * Returns the trial status for the authenticated user.
 */
router.get('/status', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!idToken) {
    return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
  }

  let userId;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    userId = decoded.uid;
  } catch {
    return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
  }

  try {
    const userSnap = await getDb().collection('users').doc(userId).get();
    if (!userSnap.exists) return res.status(404).json({ success: false, error: 'ACCOUNT_NOT_FOUND' });

    const d = userSnap.data();
    const now        = new Date();
    const expiresAt  = d.trialExpiresAt ? new Date(d.trialExpiresAt) : null;
    const daysLeft   = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null;
    const expired    = expiresAt ? now > expiresAt : false;

    return res.json({
      success:          true,
      hasUsedFreeTrial: !!d.hasUsedFreeTrial,
      isTrial:          d.plan === 'FreeTrial',
      expired,
      trialStartedAt:   d.trialStartedAt  || null,
      trialExpiresAt:   d.trialExpiresAt  || null,
      daysLeft,
      itemQuota:        d.apiRequestLimit  || null,
      plan:             d.plan,
    });
  } catch (err) {
    console.error('[FREE TRIAL] Status check error:', err);
    return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
});

export default router;
