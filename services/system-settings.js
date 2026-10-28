import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { validDocumentId } from './api-key-security.js';
import { requestPolicyVersion } from '../functions/request-limit-policy.mjs';
import { DEFAULT_SYSTEM_SETTINGS, effectiveSystemSettings, validSettingsChanges, deploymentEnvironment,
  systemPolicyApplies, MAINTENANCE_MESSAGE } from './system-settings-contract.mjs';

class SettingsError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const settingsRef = db => db.collection('system').doc('settings');
const version = snapshot => !snapshot.exists ? 'missing'
  : `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}`;
const activeAdmin = account => {
  if (!account || accountBlocked(account) || account.active === false || account.blocked === true
    || ['inactive', 'blocked'].includes(String(account.status).toLowerCase())
    || String(account.role).toLowerCase() !== 'admin') throw new SettingsError(403, 'ADMIN_REQUIRED', 'An active Admin account is required.');
};
const state = snapshot => ({ settings: effectiveSystemSettings(snapshot.data()), version: version(snapshot),
  source: snapshot.exists ? 'stored' : 'defaults',
  warnings: [],
  planLimitPeriod: 'UTC daily; shared across all active API keys. Existing paid promises are protected.',
  configurationRefresh: 'Read on each affected API request; no settings cache.',
  securityProtection: 'Required; cannot be disabled.' });

export function createSystemSettingsHandlers({ getDb, verifyIdToken, apiVersion, env = process.env, now = () => new Date(),
  report = () => console.warn('[Audit] System settings activity append unavailable') }) {
  const authenticate = async req => {
    const token = /^Bearer ([^\s]+)$/u.exec(req.headers?.authorization || '')?.[1];
    if (!token) throw new SettingsError(401, 'AUTH_REQUIRED', 'An Admin session is required.');
    let actor;
    try { actor = await verifyIdToken(token, true); } catch { throw new SettingsError(401, 'AUTH_INVALID', 'Unable to verify this session.'); }
    if (!validDocumentId(actor?.uid)) throw new SettingsError(401, 'AUTH_INVALID', 'Unable to verify this session.');
    const db = getDb();
    activeAdmin((await db.collection('users').doc(actor.uid).get()).data());
    return { actor, db };
  };
  const wrap = handler => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { return await handler(req, res); } catch (error) {
      if (error instanceof SettingsError) return res.status(error.status).json({ success: false, code: error.code, error: error.message });
      return res.status(503).json({ success: false, code: 'SYSTEM_SETTINGS_UNAVAILABLE', error: 'System settings are unavailable. Try Refresh Settings before saving.' });
    }
  };
  const read = wrap(async (req, res) => {
    const { db } = await authenticate(req);
    if (Object.keys(req.query || {}).length) throw new SettingsError(400, 'SETTINGS_PARAMETERS', 'Settings accepts no query selectors.');
    return res.json({ success: true, ...state(await settingsRef(db).get()) });
  });
  const save = wrap(async (req, res) => {
    const { db, actor } = await authenticate(req);
    const body = req.body;
    if (!body || Object.keys(body).some(key => !['version', 'changes'].includes(key))
      || typeof body.version !== 'string' || body.version.length > 80 || !validSettingsChanges(body.changes)) {
      throw new SettingsError(400, 'SETTINGS_INVALID', 'Use supported settings and positive whole-number plan allowances. Unlimited is supported for Free Trial and Pro Max.');
    }
    const at = now();
    const result = await db.runTransaction(async tx => {
      activeAdmin((await tx.get(db.collection('users').doc(actor.uid))).data());
      const ref = settingsRef(db), snapshot = await tx.get(ref);
      if (version(snapshot) !== body.version) throw new SettingsError(409, 'SETTINGS_CONFLICT', 'Another Admin changed settings. Refresh Settings and review your changes.');
      const previous = effectiveSystemSettings(snapshot.data());
      const changedFields = Object.keys(body.changes).filter(key => key !== 'planRequestLimits' && previous[key] !== body.changes[key]);
      const planChanges = Object.entries(body.changes.planRequestLimits || {}).filter(([plan, limit]) => previous.planRequestLimits[plan] !== limit)
        .map(([plan, limit]) => ({ plan, before: previous.planRequestLimits[plan], after: limit }));
      if (changedFields.length || planChanges.length) {
        const values = Object.fromEntries(changedFields.map(key => [key, body.changes[key]]));
        if (planChanges.length) values.planRequestLimits = { ...previous.planRequestLimits, ...body.changes.planRequestLimits };
        const update = { ...values, updatedAt: at, updatedBy: actor.uid };
        if (snapshot.exists) tx.update(ref, update);
        else tx.set(ref, { ...DEFAULT_SYSTEM_SETTINGS, ...update });
      }
      return { changedFields, planChanges, previous, existed: snapshot.exists };
    });
    // Exactly one best-effort attempt after commit, including transaction retries.
    if (result.changedFields.length) {
      try {
        await db.collection('audit_logs').add({ action: 'System Settings Updated', userId: actor.uid,
          ...(typeof actor.email === 'string' && actor.email.length <= 320 ? { userEmail: actor.email } : {}),
          timestamp: at, entityType: 'system_settings', entityId: 'settings',
          details: `Changed settings: ${result.changedFields.join(', ')}.`,
          metadata: { changedFields: result.changedFields, changes: result.changedFields.map(field =>
            ({ field, before: result.previous[field], after: body.changes[field] })) } });
      } catch { try { report(); } catch { /* Diagnostics cannot alter a completed mutation. */ } }
    }
    if (result.planChanges.length) {
      try {
        await db.collection('audit_logs').add({ action: 'Plan Request Limits Updated', userId: actor.uid,
          ...(typeof actor.email === 'string' && actor.email.length <= 320 ? { userEmail: actor.email } : {}), timestamp: at,
          entityType: 'system_settings', entityId: 'settings', details: `Changed plan request limits: ${result.planChanges.map(change => change.plan).join(', ')}.`,
          metadata: { changes: result.planChanges } });
      } catch { try { report(); } catch { /* completed commit remains authoritative */ } }
    }
    // Persistence succeeded even if a subsequent authoritative reload fails.
    try { return res.json({ success: true, saved: result.existed || result.changedFields.length > 0 || result.planChanges.length > 0,
      ...state(await settingsRef(db).get()) }); }
    catch { return res.json({ success: true, saved: true, reloadRequired: true }); }
  });
  const information = wrap(async (req, res) => {
    const { db } = await authenticate(req);
    // This is a single read-only connectivity probe, not continuous monitoring.
    let databaseStatus;
    try { await settingsRef(db).get(); databaseStatus = 'Connected'; } catch { databaseStatus = 'Unavailable'; }
    return res.json({ success: true, apiVersion: typeof apiVersion === 'string' ? apiVersion : null,
      environment: deploymentEnvironment({ development: env.NODE_ENV === 'development', vercelEnvironment: env.VERCEL_ENV,
        // FIREBASE_PROJECT_ID is the old name of DATA_PROJECT_ID, read until Vercel is updated.
        dataProjectId: env.DATA_PROJECT_ID ?? env.FIREBASE_PROJECT_ID, cloudRunService: env.K_SERVICE }),
      databaseStatus, checkedAt: now().toISOString(), uptime: 'Not tracked' });
  });
  const publicStatus = wrap(async (_req, res) => {
    const policy = effectiveSystemSettings((await settingsRef(getDb()).get()).data());
    return res.json({ success: true, maintenanceMode: policy.maintenanceMode, allowNewRegistrations: policy.allowNewRegistrations,
      planRequestLimits: policy.planRequestLimits, requestPolicyVersion: requestPolicyVersion(policy.planRequestLimits) });
  });
  return { read, save, information, publicStatus };
}

export function createSystemPolicyMiddleware({ getDb }) {
  return async (req, res, next) => {
    if (!systemPolicyApplies(req.method, req.path)) return next();
    try {
      // Fresh reads across serverless instances: never cache a stale enabled policy.
      req.systemPolicy = effectiveSystemSettings((await settingsRef(getDb()).get()).data());
      if (!req.systemPolicy.maintenanceMode) return next();
      res.set('Cache-Control', 'no-store'); res.set('Retry-After', '60');
      return res.status(503).json({ success: false, code: 'MAINTENANCE_MODE', error: MAINTENANCE_MESSAGE });
    } catch {
      return res.status(503).json({ success: false, code: 'SYSTEM_SETTINGS_UNAVAILABLE', error: 'Service configuration is temporarily unavailable. Please try again later.' });
    }
  };
}
