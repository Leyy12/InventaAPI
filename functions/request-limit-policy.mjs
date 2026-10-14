// Request allowances only. Prices, plan duration, product capacity and IP abuse
// protection are independent contracts and never derived from these values.
export const DEFAULT_REQUEST_LIMITS = Object.freeze({ free_trial: null, pro: 500, pro_max: null });
export const REQUEST_LIMIT_PLANS = Object.freeze(Object.keys(DEFAULT_REQUEST_LIMITS));
export function validPlanRequestLimit(plan, limit) {
  return REQUEST_LIMIT_PLANS.includes(plan) && (Number.isSafeInteger(limit) && limit > 0 || limit === null && plan !== 'pro');
}
export function requestLimitPolicy(data = {}) {
  const configured = data.planRequestLimits;
  if (configured === undefined) return { ...DEFAULT_REQUEST_LIMITS };
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)
    || Object.keys(configured).some(plan => !validPlanRequestLimit(plan, configured[plan]))) {
    throw Object.assign(new Error('Plan request allowances are unavailable.'), { code: 'PLAN_REQUEST_LIMITS_UNAVAILABLE', status: 503 });
  }
  return { ...DEFAULT_REQUEST_LIMITS, ...configured };
}
export const requestPolicyVersion = limits => `requests-v1:${REQUEST_LIMIT_PLANS.map(plan => limits[plan] === null ? 'unlimited' : limits[plan]).join(':')}`;
const greaterAllowance = (a, b) => a === null || b === null ? null : Math.max(a, b);

// A saved purchase/activation promise is a floor, not a second mutable policy.
// Existing customers without a contract retain their accepted default promise.
// Increases apply immediately. Reductions affect only newly agreed contracts.
export function promisedRequestAllowance(contracts, plan) {
  if (contracts !== undefined && (!contracts || contracts.version !== 1 || !contracts.plans || typeof contracts.plans !== 'object' || Array.isArray(contracts.plans))) {
    throw Object.assign(new Error('Account request promise is unavailable.'), { code: 'REQUEST_CONTRACT_UNAVAILABLE', status: 503 });
  }
  const saved = contracts?.plans?.[plan];
  if (saved === undefined) return DEFAULT_REQUEST_LIMITS[plan];
  if (!saved || saved.version !== 1 || saved.period !== 'utc_daily' || !validPlanRequestLimit(plan, saved.limit)) {
    throw Object.assign(new Error('Account request promise is unavailable.'), { code: 'REQUEST_CONTRACT_UNAVAILABLE', status: 503 });
  }
  return saved.limit;
}
export function effectiveRequestAllowance(contracts, plan, limits = DEFAULT_REQUEST_LIMITS) {
  return greaterAllowance(promisedRequestAllowance(contracts, plan), limits[plan]);
}
export function newRequestContract(limit) { return { version: 1, period: 'utc_daily', limit }; }
export function validOrderRequestAllowance(order) {
  const terms = order.requestAllowance;
  return terms === undefined || terms && typeof terms === 'object' && terms.planId === (order.planId ?? 'pro')
    && terms.period === 'utc_daily' && validPlanRequestLimit(terms.planId, terms.limit)
    && typeof terms.policyVersion === 'string' && terms.policyVersion.startsWith('requests-v1:') && terms.policyVersion.length <= 100;
}
export function purchaseRequestContracts(account, contracts, plan, promisedLimit) {
  for (const existingPlan of REQUEST_LIMIT_PLANS) promisedRequestAllowance(contracts, existingPlan);
  if (!validPlanRequestLimit(plan, promisedLimit)) throw new Error('Invalid purchase request promise');
  const previous = contracts?.plans?.[plan];
  // Existing paid plan promises survive renewal, including the legacy Unlimited
  // Pro Max promise. A new purchase never lowers an existing paid commitment.
  const samePaidPlan = (plan === 'pro' && ['pro', 'professional'].includes(String(account.plan).toLowerCase()))
    || (plan === 'pro_max' && String(account.plan).toLowerCase() === 'pro max');
  let floor = previous !== undefined || samePaidPlan ? greaterAllowance(promisedRequestAllowance(contracts, plan), promisedLimit) : promisedLimit;
  // Upgrading an existing paid Pro account cannot lower its paid request promise.
  if (plan === 'pro_max' && ['pro', 'professional'].includes(String(account.plan).toLowerCase())) {
    floor = greaterAllowance(floor, promisedRequestAllowance(contracts, 'pro'));
  }
  return { version: 1, plans: { ...contracts?.plans, [plan]: newRequestContract(floor) } };
}
