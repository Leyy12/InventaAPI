import { DEFAULT_REQUEST_LIMITS, requestLimitPolicy, validPlanRequestLimit } from '../functions/request-limit-policy.mjs';
export const DEFAULT_SYSTEM_SETTINGS = Object.freeze({ maintenanceMode: false, allowNewRegistrations: true,
  planRequestLimits: DEFAULT_REQUEST_LIMITS });
export const SETTINGS_FIELDS = Object.freeze(['maintenanceMode', 'allowNewRegistrations', 'planRequestLimits']);
export const MAINTENANCE_MESSAGE = 'InventaAPI is undergoing maintenance. Please try again later.';
export const REGISTRATION_MESSAGE = 'New account registration is temporarily unavailable. Existing customers can still sign in.';

export function effectiveSystemSettings(data = {}) {
  for (const name of ['maintenanceMode', 'allowNewRegistrations']) {
    if (data[name] !== undefined && typeof data[name] !== 'boolean') throw new Error('Invalid stored system policy');
  }
  return { maintenanceMode: data.maintenanceMode ?? false, allowNewRegistrations: data.allowNewRegistrations ?? true,
    planRequestLimits: requestLimitPolicy(data) };
}

export function validSettingsChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)
    || !Object.keys(changes).length || Object.keys(changes).some(key => !SETTINGS_FIELDS.includes(key))) return false;
  return Object.entries(changes).every(([key, value]) => key === 'planRequestLimits'
    ? value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
      && Object.entries(value).every(([plan, limit]) => validPlanRequestLimit(plan, limit)) : typeof value === 'boolean');
}

/** @param {{ development?: boolean, vercelEnvironment?: string, firebaseProjectId?: string, cloudRunService?: string, apiOrigin?: string }} [configuration] */
export function deploymentEnvironment({ development = false, vercelEnvironment, firebaseProjectId, cloudRunService, apiOrigin } = {}) {
  if (development && !vercelEnvironment && !cloudRunService) return 'Development';
  if (vercelEnvironment === 'production' && firebaseProjectId === 'inventaapi-db') return 'Production';
  let stagingOrigin = false;
  try { stagingOrigin = /^(?:[a-z0-9-]+---)?inventaapi-api-staging-[a-z0-9]+-as\.a\.run\.app$/u.test(new URL(apiOrigin).hostname); } catch { /* unknown origin */ }
  if (firebaseProjectId === 'inventaapi-staging'
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
  if (route.startsWith('/daas/v1/') && route !== '/daas/v1/health') return true;
  if (['/api/v1/products', '/api/v1/product-submissions', '/api/v1/api-keys', '/api/v1/customer/insights',
    '/api/v1/notifications', '/api/v1/contact'].some(prefix => route === prefix || route.startsWith(`${prefix}/`))) return true;
  return method !== 'GET' && method !== 'HEAD' && (route === '/api/v1/checkout/create-gcash'
    || route === '/api/v1/free-trial/activate' || route.startsWith('/api/v1/product-media/upload/'));
}
