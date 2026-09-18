import { authenticateCredential, sendSecurityError } from './api-key-security.js';
import { consumeAccountQuota } from './account-quota.js';

export function createDaaSSecurity({ getDb, clock = () => new Date(), cutoverAt = null }) {
  return {
    authenticateApiKey: async (req, res, next) => {
      req.startTime = Date.now();
      res.set('Cache-Control', 'no-store');
      try {
        const credential = req.headers['x-api-key'] || req.query.apiKey;
        req.apiKeyData = await authenticateCredential(getDb(), credential, clock());
        req.apiCredential = credential;
        return next();
      } catch (error) {
        // Keep authentication-failure telemetry without logging credentials or query strings.
        try {
          await getDb().collection('audit_logs').add({ action: 'Authentication Failure',
            userId: 'Unknown', endpoint: req.path, status: error.status || 503, timestamp: clock() });
        } catch { /* Access still fails closed when telemetry is unavailable. */ }
        return sendSecurityError(res, error);
      }
    },
    enforceRequestLimit: async (req, res, next) => {
      if (!req.apiKeyData?.id || !req.apiKeyData?.userId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'API key authentication required.' });
      }
      try {
        const result = await consumeAccountQuota(getDb(), {
          keyId: req.apiKeyData.id, userId: req.apiKeyData.userId, credential: req.apiCredential,
          allowedPlans: req.requiredApiPlans, clock, cutoverAt,
        });
        req.apiKeyData = result.key;
        req.userPlanData = result.account;
        req.userPlan = result.account.plan;
        req.requestUsage = result.usage;
        delete req.apiCredential;
        return next();
      } catch (error) {
        delete req.apiCredential;
        return sendSecurityError(res, error);
      }
    },
  };
}

// The following enforceRequestLimit middleware verifies the plan in the same
// transaction as quota consumption, preventing an entitlement-read race.
export function requirePlan(allowedPlans) {
  return (req, res, next) => {
    req.requiredApiPlans = allowedPlans.map(plan => plan.toLowerCase());
    return next();
  };
}
