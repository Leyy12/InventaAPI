import { validDocumentId } from './api-key-security.js';
import { accountBlocked, evaluateEntitlement } from '../functions/subscription-lifecycle.mjs';
import { resolveCurrentCatalogProducts } from './daas-catalog.js';
import { aggregateSales, canonicalSaleInput, customerCatalog, existingSale, intelligenceFailure, IntelligenceError,
  paidSalesEligible, readSales, recommendations, recordSale, salesRange, validateSale } from './customer-intelligence.js';

function historyRange(now) {
  const from = new Date(now.getTime() - 59 * 86400000).toISOString().slice(0, 10);
  return salesRange({ from, to: now.toISOString().slice(0, 10) }, now);
}

export function createDaaSIntelligenceHandlers({ getDb, clock = () => new Date() }) {
  async function authorizedCatalog(req, db) {
    const result = await resolveCurrentCatalogProducts({ apiKeyData: req.apiKeyData,
      userData: req.userPlanData, loadProductById: async id => {
        const snapshot = await db.collection('products').doc(id).get();
        return snapshot.exists ? snapshot.data() : null;
      } });
    return result.products;
  }
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let status = 200;
    try { return res.json(await action(req, getDb(), clock())); }
    catch (error) { status = error instanceof IntelligenceError ? error.status : 503; return intelligenceFailure(res, error); }
    finally {
      // Best-effort request history never becomes an authorization decision.
      // Never log credentials, request bodies, or external transaction IDs.
      const key = req.apiKeyData;
      if (key?.id && key?.userId) {
        try {
          getDb().collection('api_telemetry').add({
            apiKeyId: key.id, userId: key.userId, keyName: key.name || '', endpoint: req.path,
            method: req.method, statusCode: status, success: status < 400,
            latencyMs: Math.max(0, Date.now() - (req.startTime || Date.now())), timestamp: clock(),
          }).catch(() => {});
        } catch { /* History failure cannot alter the already-decided response. */ }
      }
    }
  };
  return {
    sale: handle(async (req, db, now) => {
      if (Object.keys(req.query || {}).length) throw new IntelligenceError(400, 'INVALID_SALE', 'Sale ingestion has no query parameters.');
      const canonical = canonicalSaleInput(req.body, now);
      const prior = await existingSale(db, req.apiKeyData.userId, req.apiKeyData.id, canonical);
      if (prior) return { status: 'success', ...prior, currency: 'PHP', total: prior.totalMinor / 100 };
      const catalog = await authorizedCatalog(req, db);
      const sale = validateSale(req.body, catalog, now);
      const saved = await recordSale(db, req.apiKeyData.userId, sale, now, req.apiKeyData.id);
      return { status: 'success', ...saved, currency: 'PHP', total: saved.totalMinor / 100 };
    }),
    feed: handle(async (req, db, now) => {
      const range = salesRange(req.query, now);
      return aggregateSales(await readSales(db, req.apiKeyData.userId, range), range);
    }),
    recommendations: handle(async (req, db, now) => {
      if (Object.keys(req.query || {}).length) throw new IntelligenceError(400, 'INVALID_QUERY', 'Recommendations have no query parameters.');
      const [catalog, sales] = await Promise.all([authorizedCatalog(req, db),
        readSales(db, req.apiKeyData.userId, historyRange(now))]);
      return { recommendations: recommendations(catalog, sales, now), hasSalesData: sales.length > 0 };
    }),
  };
}

export function createCustomerIntelligenceHandlers({ getDb, verifyIdToken, clock = () => new Date() }) {
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const authorization = req.headers?.authorization;
      const token = typeof authorization === 'string' ? /^Bearer (\S+)$/u.exec(authorization)?.[1] : null;
      if (!token) throw new IntelligenceError(401, 'UNAUTHENTICATED', 'Firebase authentication is required.');
      let identity;
      try { identity = await verifyIdToken(token, true); }
      catch { throw new IntelligenceError(401, 'UNAUTHENTICATED', 'Invalid or revoked authentication.'); }
      if (!validDocumentId(identity?.uid)) throw new IntelligenceError(401, 'UNAUTHENTICATED', 'Invalid authentication.');
      if (Object.keys(req.query || {}).some(field => !['from', 'to'].includes(field))) {
        throw new IntelligenceError(400, 'INVALID_QUERY', 'Unsupported reporting filter.');
      }
      const db = getDb();
      const accountSnapshot = await db.collection('users').doc(identity.uid).get();
      const account = accountSnapshot.data();
      if (!accountSnapshot.exists || accountBlocked(account) || account.uid !== identity.uid || account.role !== 'Developer') {
        throw new IntelligenceError(403, 'ACCOUNT_UNAVAILABLE', 'Customer account unavailable.');
      }
      const now = clock();
      const entitlement = evaluateEntitlement(account, now);
      return res.json(await action(req, db, account, entitlement, identity.uid, now));
    } catch (error) { return intelligenceFailure(res, error); }
  };
  return {
    feed: handle(async (req, db, account, entitlement, uid, now) => {
      if (!paidSalesEligible(account, entitlement)) {
        throw new IntelligenceError(403, 'PLAN_UPGRADE_REQUIRED', 'A paid plan is required for sales analytics.');
      }
      const range = salesRange(req.query, now);
      return aggregateSales(await readSales(db, uid, range), range);
    }),
    recommendations: handle(async (req, db, account, entitlement, uid, now) => {
      if (Object.keys(req.query || {}).length) throw new IntelligenceError(400, 'INVALID_QUERY', 'Recommendations have no query parameters.');
      // Customer application access is unchanged by Upgrade Required; protected
      // DaaS key access remains blocked by the quota transaction.
      const effectiveAccount = { ...account, plan: entitlement.plan };
      const [catalog, sales] = await Promise.all([customerCatalog(db, effectiveAccount), readSales(db, uid, historyRange(now))]);
      return { recommendations: recommendations(catalog, sales, now), hasSalesData: sales.length > 0 };
    }),
  };
}
