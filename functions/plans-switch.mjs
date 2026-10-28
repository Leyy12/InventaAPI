// Temporary testing switch. When PLANS_DISABLED is "true" on the API, every
// account that is not blocked is treated as an active Pro Max subscriber, so
// all features unlock. Nothing is written to accounts: removing the setting
// (or setting it to anything else) puts everyone back on their real plan.
export function plansDisabled() {
  return typeof process !== 'undefined' && process.env?.PLANS_DISABLED === 'true';
}
