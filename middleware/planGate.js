import { getFirestore } from 'firebase-admin/firestore';

// Defer Firestore initialization until needed
let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN HIERARCHY
// ═══════════════════════════════════════════════════════════════════════════
// Used to compare plan levels (Free < Pro < Enterprise)
// Includes legacy plan names for backward compatibility

const PLAN_HIERARCHY = {
  'free': 0,
  'Free': 0,
  'Starter': 0,        // Legacy Free name
  'pro': 1,
  'Pro': 1,
  'Professional': 1,   // Legacy Pro name
  'enterprise': 2,
  'Enterprise': 2,
  'Unlimited': 2,      // Legacy Enterprise name (admin accounts)
};

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE: REQUIRE SPECIFIC PLAN LEVEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware: Require user to have at least the specified plan level.
 * 
 * Must be used AFTER authenticateApiKey middleware (expects req.apiKeyData).
 * 
 * @param {string[]} allowedPlans - Array of plan names (e.g. ['pro', 'enterprise'])
 * @returns {Function} Express middleware function
 * 
 * @example
 * router.get('/sales-feed', 
 *   authenticateApiKey,
 *   requirePlan(['pro', 'enterprise']),
 *   handler
 * );
 */
export function requirePlan(allowedPlans) {
  return async (req, res, next) => {
    try {
      // Ensure API key middleware ran first
      if (!req.apiKeyData || !req.apiKeyData.userId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'API key authentication required before plan check.'
        });
      }

      // Fetch user's plan from Firestore (trusted source - Admin SDK)
      const userDoc = await getDb().collection('users').doc(req.apiKeyData.userId).get();
      
      if (!userDoc.exists) {
        return res.status(404).json({
          error: 'User Not Found',
          message: 'The user associated with this API key no longer exists.'
        });
      }

      const userData = userDoc.data();
      const userPlan = userData.plan;
      const userPlanLevel = PLAN_HIERARCHY[userPlan] ?? -1;

      // Check if user's plan meets the minimum required level
      const minRequiredLevel = Math.min(...allowedPlans.map(p => PLAN_HIERARCHY[p] ?? 999));
      
      if (userPlanLevel < minRequiredLevel) {
        // Format plan names for error message
        const planNames = allowedPlans
          .map(p => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' or ');

        return res.status(403).json({
          error: 'Plan Upgrade Required',
          message: `This feature requires a ${planNames} plan. Your current plan: ${userPlan}.`,
          upgrade_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/?openSubscription=pro`,
          current_plan: userPlan,
          required_plan: planNames
        });
      }

      // Attach user plan data to request for downstream use
      req.userPlan = userPlan;
      req.userPlanData = userData;
      
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

/**
 * Middleware: Enforce daily API request limits based on user's plan.
 * 
 * Must be used AFTER authenticateApiKey middleware.
 * 
 * Implements lazy reset: counter resets on first request of new day.
 * Reset time: Midnight UTC.
 * 
 * Request limits by plan:
 * - Free/Starter: 50 requests/day
 * - Pro: 5,000 requests/day
 * - Enterprise/Unlimited: No limit
 * 
 * KNOWN LIMITATION: requestsUsed increment is not atomic (fetch-then-write).
 * Under high concurrency from the same API key, a small race condition exists
 * where the counter might be slightly inaccurate. This is acceptable given
 * current scale but should be addressed with Firestore transactions or
 * atomic increment operations if concurrent usage increases significantly.
 * 
 * @example
 * router.get('/catalog', authenticateApiKey, enforceRequestLimit, handler);
 */
export async function enforceRequestLimit(req, res, next) {
  try {
    // Ensure API key middleware ran first
    if (!req.apiKeyData || !req.apiKeyData.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key authentication required.'
      });
    }

    // Fetch user's plan and limit from Firestore (trusted source)
    const userDoc = await getDb().collection('users').doc(req.apiKeyData.userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        error: 'User Not Found',
        message: 'The user associated with this API key no longer exists.'
      });
    }

    const userData = userDoc.data();
    const userPlan = userData.plan;
    const requestLimit = userData.apiRequestLimit || 50;

    // Skip limit check for Enterprise/Unlimited plans
    if (userPlan === 'Enterprise' || userPlan === 'Unlimited' || requestLimit === null) {
      // Still attach usage info for response headers
      req.requestUsage = {
        used: 0,
        limit: null,
        remaining: null,
        resetsAt: null,
        unlimited: true
      };
      return next();
    }

    // Fetch current API key document
    const keyDoc = await getDb().collection('api_keys').doc(req.apiKeyData.id).get();
    
    if (!keyDoc.exists) {
      return res.status(401).json({ 
        error: 'API Key Not Found',
        message: 'This API key no longer exists or has been revoked.'
      });
    }

    const keyData = keyDoc.data();
    const requestsUsed = keyData.requestsUsed || 0;
    const resetAt = keyData.resetAt ? new Date(keyData.resetAt) : null;
    const now = new Date();

    console.log(`[RATE LIMIT] Key ${req.apiKeyData.id}: requestsUsed=${requestsUsed}, resetAt=${resetAt}, needsReset=${!resetAt || now >= resetAt}`);

    // Check if daily reset is needed (lazy reset on first request of new day)
    const needsReset = !resetAt || now >= resetAt;

    if (needsReset) {
      // Reset counter and set next reset time (midnight UTC tomorrow)
      const tomorrow = new Date(now);
      tomorrow.setUTCHours(24, 0, 0, 0); // Next midnight UTC

      await getDb().collection('api_keys').doc(req.apiKeyData.id).set({
        requestsUsed: 1,  // This request counts as first of new day
        resetAt: tomorrow.toISOString(),
        lastUsed: now.toISOString()
      }, { merge: true });  // Merge to avoid overwriting other fields

      // Attach usage info to request
      req.requestUsage = {
        used: 1,
        limit: requestLimit,
        remaining: requestLimit - 1,
        resetsAt: tomorrow.toISOString()
      };

      return next();
    }

    // Check if limit exceeded
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

    // Increment counter (MUST be synchronous to ensure accurate limit enforcement)
    // NOTE: Still not atomic under true concurrency - see function docstring for race condition details
    try {
      await getDb().collection('api_keys').doc(req.apiKeyData.id).update({
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

    // Attach usage info to request
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
