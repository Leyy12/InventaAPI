import { accountBlocked } from '../functions/subscription-lifecycle.mjs';
import { validDocumentId } from './api-key-security.js';
import { requestPolicyVersion } from '../functions/request-limit-policy.mjs';
import { Timestamp } from '../functions/postgres-data-store.mjs';
import { DEFAULT_SYSTEM_SETTINGS, effectiveSystemSettings, validSettingsChanges, deploymentEnvironment,
  systemPolicyApplies, MAINTENANCE_MESSAGE, maintenanceActive, validMaintenanceSchedule } from './system-settings-contract.mjs';

class SettingsError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}

// Backup files: products (with their categories) + plan/registration settings.
// Never customers, API keys, payments or usage.
export const BACKUP_FORMAT = 'inventaapi-backup';
const MAX_BACKUP_PRODUCTS = 20000;
const isTimestamp = value => value instanceof Timestamp || (!!value && typeof value === 'object' && typeof value._seconds === 'number'
  && typeof value._nanoseconds === 'number' && Object.keys(value).length === 2);
const millis = value => typeof value.toMillis === 'function' ? value.toMillis() : value._seconds * 1000 + Math.floor(value._nanoseconds / 1e6);
const portable = value => {
  if (isTimestamp(value)) return { $timestamp: new Date(millis(value)).toISOString() };
  if (value instanceof Date) return { $timestamp: value.toISOString() };
  if (Array.isArray(value)) return value.map(portable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item)]));
  return value;
};
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const restored = value => {
  if (Array.isArray(value)) return value.map(restored);
  if (plainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$timestamp') {
      const ms = Date.parse(value.$timestamp);
      if (!Number.isFinite(ms)) throw new SettingsError(400, 'BACKUP_INVALID', 'The backup file has an invalid date.');
      return Timestamp.fromMillis(ms);
    }
    return Object.fromEntries(keys.map(key => [key, restored(value[key])]));
  }
  return value;
};
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
  warnings: [] });

export function createSystemSettingsHandlers({ getDb, verifyIdToken, apiVersion, env = process.env, now = () => new Date(), notifier = null, messages = null,
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
      if (!validMaintenanceSchedule({ ...previous, ...body.changes })) {
        throw new SettingsError(400, 'MAINTENANCE_SCHEDULE_INVALID', 'Set both a maintenance start and end, with the end after the start.');
      }
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
    // A new or changed maintenance window: tell every customer (email + bell), once per window.
    const schedule = { ...result.previous, ...body.changes };
    if (notifier && messages && result.changedFields.some(field => field === 'maintenanceStartsAt' || field === 'maintenanceEndsAt')
      && schedule.maintenanceStartsAt && schedule.maintenanceEndsAt && Date.parse(schedule.maintenanceEndsAt) > at.getTime()) {
      try {
        const customers = (await db.collection('users').get()).docs
          .map(doc => ({ id: doc.id, ...doc.data() })).filter(user => String(user.role).toLowerCase() !== 'admin');
        await notifier.notifyMany(db, customers, user => ({ id: `maintenance-${Date.parse(schedule.maintenanceStartsAt)}-${user.id}`,
          ...messages.maintenanceScheduled(schedule.maintenanceStartsAt, schedule.maintenanceEndsAt) }));
      } catch { try { report(); } catch { /* the saved schedule stands */ } }
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
        dataProjectId: env.DATA_PROJECT_ID, cloudRunService: env.K_SERVICE }),
      databaseStatus, checkedAt: now().toISOString(), uptime: 'Not tracked' });
  });
  const publicStatus = wrap(async (_req, res) => {
    const policy = effectiveSystemSettings((await settingsRef(getDb()).get()).data());
    // maintenanceMode here is whether maintenance is in effect right now (switched on or scheduled).
    return res.json({ success: true, maintenanceMode: maintenanceActive(policy, now()), allowNewRegistrations: policy.allowNewRegistrations,
      maintenanceStartsAt: policy.maintenanceStartsAt, maintenanceEndsAt: policy.maintenanceEndsAt, serverTime: now().toISOString(),
      planRequestLimits: policy.planRequestLimits, requestPolicyVersion: requestPolicyVersion(policy.planRequestLimits) });
  });

  const backup = wrap(async (req, res) => {
    const { db, actor } = await authenticate(req);
    const [products, settings] = await Promise.all([db.collection('products').get(), settingsRef(db).get()]);
    const at = now();
    const stored = effectiveSystemSettings(settings.data());
    const file = { format: BACKUP_FORMAT, version: 1, createdAt: at.toISOString(),
      contents: 'Products (with categories) and system settings. No customers, API keys, payments or usage.',
      settings: { allowNewRegistrations: stored.allowNewRegistrations, planRequestLimits: stored.planRequestLimits },
      products: products.docs.map(doc => ({ id: doc.id, data: portable(doc.data()) })) };
    try {
      await db.collection('audit_logs').add({ action: 'Backup Downloaded', userId: actor.uid, timestamp: at,
        entityType: 'system_backup', entityId: 'backup', details: `Downloaded a backup of ${file.products.length} products and settings.` });
    } catch { try { report(); } catch { /* audit is best effort */ } }
    return res.json({ success: true, backup: file });
  });
  const restore = wrap(async (req, res) => {
    const { db, actor } = await authenticate(req);
    const file = req.body?.backup;
    const invalid = message => new SettingsError(400, 'BACKUP_INVALID', message);
    if (!plainObject(file) || file.format !== BACKUP_FORMAT || file.version !== 1) throw invalid('This is not an InventaAPI backup file.');
    if (!Array.isArray(file.products) || file.products.length > MAX_BACKUP_PRODUCTS) throw invalid('The backup file has no valid product list.');
    const ids = new Set();
    const products = file.products.map(item => {
      if (!plainObject(item) || !validDocumentId(item.id) || !plainObject(item.data) || ids.has(item.id)) throw invalid('The backup file has an invalid product.');
      ids.add(item.id);
      return { id: item.id, data: restored(item.data) };
    });
    const settings = plainObject(file.settings) ? file.settings : {};
    const changes = Object.fromEntries(['allowNewRegistrations', 'planRequestLimits'].filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
    if (Object.keys(changes).length && !validSettingsChanges(changes)) throw invalid('The backup file has invalid settings.');
    const at = now();
    // Products in the file are written back; products added since the backup are kept.
    for (let start = 0; start < products.length; start += 400) {
      const batch = db.batch();
      for (const product of products.slice(start, start + 400)) batch.set(db.collection('products').doc(product.id), product.data);
      await batch.commit();
    }
    if (Object.keys(changes).length) {
      await db.runTransaction(async tx => {
        const ref = settingsRef(db), snapshot = await tx.get(ref);
        const previous = effectiveSystemSettings(snapshot.data());
        const values = { ...changes, ...(changes.planRequestLimits ? { planRequestLimits: { ...previous.planRequestLimits, ...changes.planRequestLimits } } : {}),
          updatedAt: at, updatedBy: actor.uid };
        if (snapshot.exists) tx.update(ref, values); else tx.set(ref, { ...DEFAULT_SYSTEM_SETTINGS, ...values });
      });
    }
    try {
      await db.collection('audit_logs').add({ action: 'Backup Restored', userId: actor.uid, timestamp: at,
        entityType: 'system_backup', entityId: 'backup', details: `Restored ${products.length} products${Object.keys(changes).length ? ' and settings' : ''} from a backup made ${String(file.createdAt || 'at an unknown time').slice(0, 40)}.` });
    } catch { try { report(); } catch { /* audit is best effort */ } }
    return res.json({ success: true, restoredProducts: products.length, restoredSettings: Object.keys(changes) });
  });
  return { read, save, information, publicStatus, backup, restore };
}

export function createSystemPolicyMiddleware({ getDb }) {
  return async (req, res, next) => {
    if (!systemPolicyApplies(req.method, req.path)) return next();
    try {
      // Fresh reads across serverless instances: never cache a stale enabled policy.
      req.systemPolicy = effectiveSystemSettings((await settingsRef(getDb()).get()).data());
      if (!maintenanceActive(req.systemPolicy)) return next();
      res.set('Cache-Control', 'no-store'); res.set('Retry-After', '60');
      return res.status(503).json({ success: false, code: 'MAINTENANCE_MODE', error: MAINTENANCE_MESSAGE });
    } catch {
      return res.status(503).json({ success: false, code: 'SYSTEM_SETTINGS_UNAVAILABLE', error: 'Service configuration is temporarily unavailable. Please try again later.' });
    }
  };
}
