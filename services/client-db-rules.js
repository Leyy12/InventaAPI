// Server-side port of firestore.rules for the documents the dashboard and admin
// browsers read and write through /api/v1/client-db. Every collection not listed
// here is denied, exactly like the rules' default-deny match.
//
// ctx: { auth: { uid, token } | null, isAdmin(): Promise<boolean>, registrationsAllowed(): Promise<boolean> }
// Data passed in is plain JS with timestamps as Date or Timestamp-like values.

const SEGMENTS = ['Grocery', 'Pharmacy', 'Hardware'];
const PRO_PLANS = ['Pro', 'pro', 'Professional', 'professional', 'Pro Max', 'Enterprise', 'enterprise', 'Unlimited', 'unlimited'];

const USER_CREATE_FORBIDDEN = ['subscriptionExpiresAt', 'lastSubscribedAt',
    'subscriptionStartedAt', 'paymentReference', 'accountState', 'disabled', 'deleted', 'deletedAt',
    'deletionRequested', 'deletionRequestedAt', 'status', 'downgradedAt', 'renewalState',
    'hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt', 'trialExpiredAt',
    'trialUsed', 'trialQuota', 'effectivePlan', 'trialExhaustedAt', 'trialConsumed', 'trialKeyMutationAt'];

const USER_UPDATE_FORBIDDEN = ['subscriptionExpiresAt', 'subscription_status', 'lastSubscribedAt',
    'subscriptionStartedAt', 'paymentReference', 'accountState', 'disabled', 'deleted', 'deletedAt',
    'deletionRequested', 'deletionRequestedAt', 'status', 'downgradedAt', 'renewalState',
    'businessSegment', 'hasUsedFreeTrial', 'trialVersion', 'trialStartedAt', 'trialExpiresAt',
    'trialExpiredAt', 'trialUsed', 'trialQuota', 'effectivePlan', 'trialExhaustedAt', 'trialConsumed', 'trialKeyMutationAt',
    'email', 'termsAccepted', 'termsAcceptedAt', 'termsVersion', 'privacyConsent', 'privacyConsentTimestamp'];

const get = (data, key, fallback) => (data && Object.hasOwn(data, key) ? data[key] : fallback);
const isAuthenticated = ctx => Boolean(ctx.auth?.uid);
const isOwner = (ctx, uid) => isAuthenticated(ctx) && ctx.auth.uid === uid;
const nonEmptyString = value => typeof value === 'string' && value.length > 0;

function comparable(value) {
    if (value instanceof Date) return { ts: value.getTime() };
    if (value && typeof value.toMillis === 'function') return { ts: value.toMillis() };
    if (Array.isArray(value)) return value.map(comparable);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = comparable(value[key]);
        return out;
    }
    return value;
}
const same = (a, b) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));

// Keys added, removed or changed between two versions of a document.
export function affectedKeys(before = {}, after = {}) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter(key => Object.hasOwn(before, key) !== Object.hasOwn(after, key) || !same(before[key], after[key]));
}

const deny = async () => false;

export const rules = {
    users: {
        read: async (ctx, data, id) => isOwner(ctx, id) || ctx.isAdmin(),
        create: async (ctx, next, id) => isAuthenticated(ctx)
            && await ctx.registrationsAllowed()
            && ctx.auth.uid === id
            && ctx.auth.token?.email_verified === true
            && next.email === ctx.auth.token?.email
            && next.termsAccepted === true
            && next.privacyConsent === true
            && next.uid === ctx.auth.uid
            && next.role === 'Developer'
            && next.plan === 'Free'
            && next.apiRequestLimit === 50
            && get(next, 'subscription_status', 'inactive') === 'inactive'
            && !USER_CREATE_FORBIDDEN.some(key => Object.hasOwn(next, key))
            && SEGMENTS.includes(next.businessSegment)
            && (!Object.hasOwn(next, 'selectedSegment') || next.selectedSegment === next.businessSegment),
        update: async (ctx, before, next, id) => {
            if (!isOwner(ctx, id)) return false;
            if (get(before, 'accountState', 'active') !== 'active' || get(before, 'deletionRequested', false) !== false) return false;
            if (!same(next.uid, before.uid) || !same(next.role, before.role)) return false;
            if (!same(get(next, 'plan', ''), get(before, 'plan', '')) || !same(get(next, 'apiRequestLimit', 0), get(before, 'apiRequestLimit', 0))) return false;
            const changed = affectedKeys(before, next);
            if (changed.some(key => USER_UPDATE_FORBIDDEN.includes(key))) return false;
            if (!changed.includes('selectedSegment')) return true;
            return SEGMENTS.includes(next.selectedSegment)
                && (PRO_PLANS.includes(before.plan) || next.selectedSegment === get(before, 'businessSegment', ''));
        },
        delete: deny,
    },
    products: {
        read: async () => true,
        create: deny, update: deny, delete: deny,
    },
    product_requests: {
        read: async (ctx, data) => isOwner(ctx, data?.userId) || ctx.isAdmin(),
        create: deny, update: deny, delete: deny,
    },
    api_keys: {
        read: async ctx => ctx.isAdmin(),
        create: deny, update: deny, delete: deny,
    },
    account_api_usage: {
        read: async ctx => ctx.isAdmin(),
        create: deny, update: deny, delete: deny,
    },
    transactions: {
        read: async (ctx, data) => isOwner(ctx, data?.userId) || ctx.isAdmin(),
        create: deny, update: deny, delete: deny,
    },
    enterprise_inquiries: {
        read: async ctx => ctx.isAdmin(),
        create: async (ctx, next) => isAuthenticated(ctx) && nonEmptyString(next.fullName) && nonEmptyString(next.email)
            && nonEmptyString(next.company) && nonEmptyString(next.message),
        update: async ctx => ctx.isAdmin(),
        delete: async ctx => ctx.isAdmin(),
    },
    contact_inquiries: {
        read: async ctx => ctx.isAdmin(),
        create: deny, update: deny, delete: deny,
    },
    notifications: {
        read: async (ctx, data) => isAuthenticated(ctx) && (data?.userId === ctx.auth.uid || ctx.isAdmin()),
        create: async (ctx, next) => isAuthenticated(ctx) && (next.userId === 'admin' || ctx.isAdmin()),
        update: async (ctx, before, next) => isAuthenticated(ctx)
            && (before.userId === ctx.auth.uid || await ctx.isAdmin())
            && affectedKeys(before, next).every(key => key === 'read'),
        delete: async ctx => ctx.isAdmin(),
    },
    categories: {
        read: async ctx => ctx.isAdmin(),
        create: async ctx => ctx.isAdmin(), update: async ctx => ctx.isAdmin(), delete: async ctx => ctx.isAdmin(),
    },
    system: {
        read: async ctx => ctx.isAdmin(),
        create: async (ctx, next, id) => id !== 'settings' && ctx.isAdmin(),
        update: async (ctx, before, next, id) => id !== 'settings' && ctx.isAdmin(),
        delete: async (ctx, before, id) => id !== 'settings' && ctx.isAdmin(),
    },
    audit_logs: {
        read: async ctx => ctx.isAdmin(),
        create: async (ctx, next) => isAuthenticated(ctx) && next.userId === ctx.auth.uid,
        update: deny, delete: deny,
    },
};

export function rulesFor(collection) {
    return Object.hasOwn(rules, collection) ? rules[collection] : null;
}
