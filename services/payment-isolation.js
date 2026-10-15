import { requirePayment } from './payment-contract.js';

// Bind to the Firestore instance actually used, never a request or NODE_ENV.
export function requirePaymentProject(db, mode, configuredProject) {
  let project;
  try { project = db.projectId; } catch { /* Unresolved SDK identity fails closed. */ }
  requirePayment(['inventaapi-db', 'inventaapi-staging'].includes(project)
    && (configuredProject === undefined || configuredProject === project),
  'PAYMENT_PROJECT', 'Payment database identity is unavailable or conflicting.', 503);
  requirePayment(['live', 'test'].includes(mode) && (project !== 'inventaapi-db' || mode === 'live'),
    'PAYMENT_MODE_ISOLATION', 'Payment mode is not permitted for this database.', 503);
  return project;
}

export function requirePaymentRuntime(db, config) {
  const project = requirePaymentProject(db, config.mode, config.firebaseProjectId);
  requirePayment(/^sk_(test|live)_\S+$/u.exec(config.secretKey || '')?.[1] === config.mode,
    'PAYMENT_CONFIG', 'Payment configuration is inconsistent.', 503);
  return { ...config, firebaseProjectId: project };
}
