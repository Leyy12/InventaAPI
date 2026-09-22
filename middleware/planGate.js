import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';

// ═══════════════════════════════════════════════════════════════════════════
// PLAN HIERARCHY
// ═══════════════════════════════════════════════════════════════════════════
const PLAN_HIERARCHY = {
  'free': 0,
  'Free': 0,
  'Starter': 0,
  'freetrial': 0,
  'FreeTrial': 0,
  'pro': 1,
  'Pro': 1,
  'Professional': 1,
  'enterprise': 2,
  'Enterprise': 2,
  'Unlimited': 2,
};

const FREE_TRIAL_ITEM_QUOTA = 500;
const UPGRADE_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?openSubscription=pro`;

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: REQUIRE SPECIFIC PLAN LEVEL
// ═══════════════════════════════════════════════════════════════════════════

export function requirePlan(allowedPlans) {
  return async (req, res, next) => {
    try {
      if (!req.apiKeyData || !req.apiKeyData.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'API key authentication required before plan check.'
        });
      }

      // Fetch user's plan from MongoDB
      const user = await User.findOne({ firestoreId: req.apiKeyData.userId }).lean();

      if (!user) {
        return res.status(404).json({
          error: 'User Not Found',
          message: 'The user associated with this API key no longer exists.'
        });
      }

      const userPlan = user.plan;
      const userPlanLevel = PLAN_HIERARCHY[userPlan] ?? -1;
      const minRequiredLevel = Math.min(...allowedPlans.map(p => PLAN_HIERARCHY[p] ?? 999));

      if (userPlanLevel < minRequiredLevel) {
        const planNames = allowedPlans
          .map(p => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' or ');

        return res.status(403).json({
          error: 'Plan Upgrade Required',
          message: `This feature requires a ${planNames} plan. Your current plan: ${userPlan}.`,
          upgrade_url: UPGRADE_URL,
          current_plan: userPlan,
          required_plan: planNames
        });
      }

      req.userPlan = userPlan;
      req.userPlanData = user;
      next();
    } catch (err) {
      console.error('[PLAN GATE] Error checking user plan:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify plan access.'
      });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: ENFORCE DAILY REQUEST LIMITS
// ═══════════════════════════════════════════════════════════════════════════

export async function enforceRequestLimit(req, res, next) {
  try {
    if (!req.apiKeyData || !req.apiKeyData.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key authentication required.'
      });
    }

    // Fetch user from MongoDB
    const user = await User.findOne({ firestoreId: req.apiKeyData.userId }).lean();

    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'The user associated with this API key no longer exists.'
      });
    }

    const userPlan = user.plan;
    const requestLimit = user.apiRequestLimit || 50;

    // ── FREE TRIAL CHECKS ─────────────────────────────────────────────
    if (userPlan === 'FreeTrial') {
      const now = new Date();
      const trialExpiresAt = user.trialExpiresAt ? new Date(user.trialExpiresAt) : null;

      if (trialExpiresAt && now > trialExpiresAt) {
        // Lazily revoke the key
        try {
          await ApiKey.findOneAndUpdate(
            { firestoreId: req.apiKeyData.id },
            { status: 'revoked', revokedAt: now.toISOString(), revokedReason: 'free_trial_expired' }
          );
          await User.findOneAndUpdate(
            { firestoreId: req.apiKeyData.userId },
            { plan: 'Free', apiRequestLimit: 50, trialExpiredAt: now.toISOString() }
          );
        } catch (e) {
          console.error('[PLAN GATE] Failed to lazily revoke expired trial key:', e.message);
        }
        return res.status(401).json({
          error: 'Unauthorized',
          message: '401 Unauthorized: Your Free Trial API key has expired. Subscribe to the Pro Plan to reactivate your service.',
          upgrade_url: UPGRADE_URL,
        });
      }

      // Check absolute item quota
      const keyForTrial = await ApiKey.findOne({ firestoreId: req.apiKeyData.id }).lean();
      const requestsUsedSoFar = keyForTrial ? (keyForTrial.requestsUsed || 0) : 0;
      if (requestsUsedSoFar >= FREE_TRIAL_ITEM_QUOTA) {
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `429 Too Many Requests: You have reached the ${FREE_TRIAL_ITEM_QUOTA}-item limit of your Free Trial. Subscribe to the Pro Plan to continue.`,
          quota: { limit: FREE_TRIAL_ITEM_QUOTA, used: requestsUsedSoFar, remaining: 0 },
          upgrade_url: UPGRADE_URL,
        });
      }
    }

    // Skip limit check for Enterprise/Unlimited plans
    if (userPlan === 'Enterprise' || userPlan === 'Unlimited' || requestLimit === null) {
      req.requestUsage = { used: 0, limit: null, remaining: null, resetsAt: null, unlimited: true };
      return next();
    }

    // Fetch current API key document from MongoDB
    const keyDoc = await ApiKey.findOne({ firestoreId: req.apiKeyData.id });

    if (!keyDoc) {
      return res.status(401).json({
        error: 'API Key Not Found',
        message: 'This API key no longer exists or has been revoked.'
      });
    }

    const requestsUsed = keyDoc.requestsUsed || 0;
    const resetAt = keyDoc.resetAt ? new Date(keyDoc.resetAt) : null;
    const now = new Date();

    console.log(`[RATE LIMIT] Key ${req.apiKeyData.id}: requestsUsed=${requestsUsed}, resetAt=${resetAt}`);

    const needsReset = !resetAt || now >= resetAt;

    if (needsReset) {
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0);

      keyDoc.requestsUsed = 1;
      keyDoc.resetAt = tomorrow.toISOString();
      keyDoc.lastUsed = now.toISOString();
      await keyDoc.save();

      req.requestUsage = {
        used: 1,
        limit: requestLimit,
        remaining: requestLimit - 1,
        resetsAt: tomorrow.toISOString()
      };
      return next();
    }

    if (requestsUsed >= requestLimit) {
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `Daily limit of ${requestLimit} requests exceeded. Resets at midnight UTC.`,
        quota: {
          limit: requestLimit,
          used: requestsUsed,
          remaining: 0,
          resetsAt: resetAt.toISOString()
        },
        upgrade_url: requestLimit === 50
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?openSubscription=pro`
          : null
      });
    }

    // Increment counter
    try {
      await ApiKey.findByIdAndUpdate(keyDoc._id, {
        requestsUsed: requestsUsed + 1,
        lastUsed: now.toISOString()
      });
    } catch (err) {
      console.error('[RATE LIMIT] Failed to increment counter:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update request counter.'
      });
    }

    req.requestUsage = {
      used: requestsUsed + 1,
      limit: requestLimit,
      remaining: requestLimit - requestsUsed - 1,
      resetsAt: resetAt.toISOString()
    };

    next();
  } catch (err) {
    console.error('[RATE LIMIT] Error enforcing limit:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check rate limit.'
    });
  }
}
