import { DEFAULT_REQUEST_LIMITS, requestLimitPolicy, validPlanRequestLimit } from '../functions/request-limit-policy.mjs';
export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({ maintenanceMode: false, allowNewRegistrations: true,
  planRequestLimits: DEFAULT_REQUEST_LIMITS, maintenanceStartsAt: null, maintenanceEndsAt: null });
export const SETTINGS_FIELDS = Object.freeze(['maintenanceMode', 'allowNewRegistrations', 'planRequestLimits',
  'maintenanceStartsAt', 'maintenanceEndsAt']);
export const MAINTENANCE_MESSAGE = 'InventaAPI is undergoing maintenance. Please try again later.';
export const MAINTENANCE_APOLOGY = "InventaAPI is currently under scheduled maintenance. We're sorry for the inconvenience. Please sign in again after maintenance ends.";
const SCHEDULE_FIELDS = ['maintenanceStartsAt', 'maintenanceEndsAt'];
// A schedule time is a canonical UTC ISO string, or null for "not scheduled".
const scheduleTime = value => value === null
  || typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && new Date(value).toISOString() === value;

// Maintenance is on when the admin switched it on, or during the scheduled window.
export function maintenanceActive(settings, now = new Date()) {
  if (settings.maintenanceMode) return true;
  const start = Date.parse(settings.maintenanceStartsAt ?? ''), end = Date.parse(settings.maintenanceEndsAt ?? '');
  return Number.isFinite(start) && Number.isFinite(end) && start <= now.getTime() && now.getTime() < end;
}
// A schedule needs both times, with the end after the start.
export function validMaintenanceSchedule(settings) {
  const start = settings.maintenanceStartsAt, end = settings.maintenanceEndsAt;
  if (start === null && end === null) return true;
  return start !== null && end !== null && Date.parse(end) > Date.parse(start);
}
export const REGISTRATION_MESSAGE = 'New account registration is temporarily unavailable. Existing customers can still sign in.';

export function effectiveSystemSettings(data = {}) {
  for (const name of ['maintenanceMode', 'allowNewRegistrations']) {
    if (data[name] !== undefined && typeof data[name] !== 'boolean') throw new Error('Invalid stored system policy');
  }
  for (const name of SCHEDULE_FIELDS) {
    if (data[name] !== undefined && !scheduleTime(data[name])) throw new Error('Invalid stored system policy');
  }
  return { maintenanceMode: data.maintenanceMode ?? false, allowNewRegistrations: data.allowNewRegistrations ?? true,
    planRequestLimits: requestLimitPolicy(data),
    maintenanceStartsAt: data.maintenanceStartsAt ?? null, maintenanceEndsAt: data.maintenanceEndsAt ?? null };
}

export function validSettingsChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)
    || !Object.keys(changes).length || Object.keys(changes).some(key => !SETTINGS_FIELDS.includes(key))) return false;
  return Object.entries(changes).every(([key, value]) => key === 'planRequestLimits'
    ? value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
      && Object.entries(value).every(([plan, limit]) => validPlanRequestLimit(plan, limit))
    : SCHEDULE_FIELDS.includes(key) ? scheduleTime(value) : typeof value === 'boolean');
}

/** @param {{ development?: boolean, vercelEnvironment?: string, dataProjectId?: string, cloudRunService?: string, apiOrigin?: string }} [configuration] */
export function deploymentEnvironment({ development = false, vercelEnvironment, dataProjectId, cloudRunService, apiOrigin } = {}) {
  if (development && !vercelEnvironment && !cloudRunService) return 'Development';
  if (vercelEnvironment === 'production' && dataProjectId === 'inventaapi-db') return 'Production';
  let stagingOrigin = false;
  try { stagingOrigin = /^(?:[a-z0-9-]+---)?inventaapi-api-staging-[a-z0-9]+-as\.a\.run\.app$/u.test(new URL(apiOrigin).hostname); } catch { /* unknown origin */ }
  if (dataProjectId === 'inventaapi-staging'
    && (cloudRunService === 'inventaapi-api-staging' || stagingOrigin)) return 'Staging';
  return 'Unknown';
}

// Narrow business-operation boundary. Authentication, recovery, settlement and
// already-paid fulfillment are outside it. Match Express's case/trailing-slash behavior.
export function systemPolicyApplies(method, path) {
  let route;
  try { route = decodeURI(path).toLowerCase().replace(/\/+$/u, ''); } catch { return false; }
  if (method === 'OPTIONS') return false;
  // Read-only credential management and revocation are essential security paths.
  if (route === '/api/v1/api-keys' || route.startsWith('/api/v1/api-keys/')) {
    if (method === 'GET' || method === 'HEAD' || method === 'DELETE') return false;
  }
  // The customer DaaS API (/daas/v1/...) keeps running during maintenance so
  // customers' websites and stores are never interrupted.
  if (route.startsWith('/daas/')) return false;
  if (['/api/v1/products', '/api/v1/product-submissions', '/api/v1/api-keys', '/api/v1/customer/insights',
    '/api/v1/notifications', '/api/v1/contact'].some(prefix => route === prefix || route.startsWith(`${prefix}/`))) return true;
  return method !== 'GET' && method !== 'HEAD' && (route === '/api/v1/checkout/create-gcash'
    || route === '/api/v1/free-trial/activate' || route.startsWith('/api/v1/product-media/upload/'));
}
