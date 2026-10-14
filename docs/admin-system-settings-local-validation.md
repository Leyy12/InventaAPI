# System Settings functionalization and plan request allowances

Local implementation on `codex/admin-system-settings-functionalization`, based on `e9256a008a5ddb4a16218682927e05090d96a7a8`. No deployments, remote writes, Firebase publication, database changes, or Git push were performed. The local commit SHA is returned in the completion report.

## Supported settings

The authoritative configuration is `system/settings`. Missing fields use the accepted defaults; malformed stored policy is unavailable and fails closed for affected business operations.

| Setting | Initial default | Supported behavior |
| --- | --- | --- |
| Maintenance Mode | Off | Customer business routes return HTTP 503 before quota consumption, uploads, mutations, and success audits. |
| Allow New Registrations | On | A server-owned Firestore rule gates completed Customer profile creation. Existing sign-in remains available. |
| Free Trial requests | Unlimited | Unlimited during the active seven-day Trial, or a positive safe integer per UTC day for new finite contracts. |
| Pro requests | 500/day | Positive safe integer per UTC day. |
| Pro Max requests | Unlimited | Unlimited, or a positive safe integer per UTC day for new finite contracts. |

The old Strict API Validation and Max Requests Per Minute controls are removed. Their dormant stored fields are preserved for compatibility but are not policy inputs. Required token, ownership, endpoint, product and payment validation cannot be disabled. The independent IP limiter is unchanged: 60 ordinary requests/minute, with the existing separate public-image limit of 800/minute and existing client-IP verification. It remains the existing in-memory deployment-instance protection; account quota admission uses Firestore transactions shared across all keys and instances.

## Save, authorization and audits

Admin GET/PATCH `/api/v1/admin/system/settings` verifies the Firebase token with revocation checking and an active Admin profile. Save whitelists supported fields, validates every finite allowance, rechecks the Admin inside the transaction, and compares the exact Firestore update-time version. Stale saves return 409. Unknown compatible fields survive updates. No-op requests do not fabricate writes or audits.

The UI loads authoritative values, shows unsaved changes, confirms maintenance activation, disables pending/unavailable controls, and reloads confirmed persistence. A committed save whose reload fails reports that it was saved and requires an explicit refresh; no mutation is replayed. Best-effort post-commit audits record verified Admin identity, timestamp, and safe before/after changes. Plan edits use `Plan Request Limits Updated`; other edits use `System Settings Updated`. Audit failures never roll back or replay settings changes.

## Contract compatibility and account admission

`account_request_contracts/{uid}` is backend-only. Customer profile fields cannot create trusted promises. Existing accounts without a contract keep the accepted legacy floor: Trial Unlimited, Pro 500/day, and Pro Max Unlimited. The effective allowance is the greater of configured policy and the committed promise, with Unlimited dominating finite values.

Increases apply immediately; reductions apply to newly agreed contracts. Existing paid promises survive renewal. A Pro-to-Pro-Max upgrade preserves the paid Pro floor. A fresh Trial captures its allowance atomically with its existing seven-day activation and 50-product, one-active-key contract. Existing finite promises are also preserved. Missing or malformed private contracts are never silently overwritten to repair an account.

Finite admission uses the existing account-level UTC daily counter across all active keys. Settings saves and contract changes never reset counters. UTC rollover, atomic concurrent admission, existing paid clean-window holds, exact expiry and Trial history remain protected. Legacy Unlimited Trial history is retained unchanged. Finite-contract Trials continue recording daily usage even while policy temporarily raises them to Unlimited. A missing finite Trial counter is unavailable; neither reporting nor admission manufactures a zero counter. Daily exhaustion returns 429 without consuming the Trial or extending its expiry.

Checkout freezes a server-generated request allowance and policy version in the existing order. Customer-supplied terms and stale offers are rejected before provider requests. Pending order terms cannot be silently replaced. Legacy orders retain accepted terms. Fulfillment uses frozen order terms and private promises, without reading mutable settings, so already-paid processing survives maintenance or a settings outage. Prices, settlement amounts, payment verification, idempotency, locks and subscription dates are unchanged.

## Customer presentation

Public pricing uses the current verified policy. Authenticated billing cards and upgrade modals use protected account-specific offers from subscription status, which can differ from a new customer's offer because of grandfathered promises. Overview, API Keys, current Plan & Billing and usage use authoritative account allowances. Prices and unrelated benefits retain the accepted plan configuration.

Public and account policy versions must match before advertising an allowance or starting checkout. Unavailable/malformed policy displays an unavailable state, never a stale baseline fallback. Public policy is checked every 30 seconds; a verified version mismatch triggers one explicit account refresh per account/version. It does not reload the browser, change workspace identity or remount the API-key session. Usage summaries hide a stale or unverified limit until a matching authoritative summary is available.

## Maintenance and registration boundaries

Maintenance pauses DaaS business reads, Customer catalog/submissions, new key issuance/scope mutations, reporting, contact/notifications, new checkout, explicit Trial activation and media uploads. It preserves health, Admin routes/recovery, authentication, key listing/revocation, account security/deletion, payment status, already-paid fulfillment/webhooks, and read-only media delivery. In-flight operations admitted before a toggle are not canceled.

Customer business pages show a professional maintenance/unavailable boundary with Check again. Policy-only checks run every 60 seconds without browser reload. Billing/payment confirmation and account-security routes remain reachable; new checkout is still denied by the API during maintenance.

Registration preflight improves feedback; the Firestore profile-creation rule is the authoritative gate, including direct SDK requests. Disabling registration does not claim to disable Firebase Auth identity creation globally. Signup reconciles uncertain profile writes, deletes only its newly created Auth identity when the profile is confirmed absent, retains uncertain identities for support, and explicitly signs out. Existing profile, login and recovery behavior remain protected.

## Information and Quick Actions

Environment is derived from verified deployment markers plus the selected Firebase project/API origin, with explicit local-development handling; `NODE_ENV=production` alone never means Production. Unknown remains Unknown. API version comes from the backend package. Database connectivity is one timestamped read-only probe, with Connected/Unavailable/Not configured UI states, not continuous monitoring. Uptime is Not tracked. View Audit Logs opens `/audit`; Refresh Settings reloads authoritative state; Check API Health makes an actual requested GET to `/daas/v1/health`. No fake cache clearing or restart endpoints were introduced.

## Coordinated release dependencies — not deployed

The API, Admin and Customer applications require coordinated deployment. The API serves settings, effective quota and contract-aware purchase/status endpoints; Admin uses those endpoints; Customer uses policy, matching account status, signup handling and maintenance presentation. The Admin Inventory display also honors finite Pro Max quotas from its existing sanitized metadata integration.

**Firebase rules deployment required: YES.** Apply only the smallest reviewed changes against the effective published rules: the registration helper and profile-create gate, denial of direct client writes to `system/settings`, and explicit denial for private request-contract documents. The private collection is already covered by the checked-in default-deny rule. Do not publish the entire repository rules file over a different effective ruleset, particularly the accepted `api_keys` restriction. No rules were published in this task.

Before a later activation, inspect existing `system/settings` values read-only: previously dormant maintenance/registration flags will become enforced by the new API/rules. Review actual deployment linkage and effective published rules. Deploy/protect the settings and registration boundary before advertising operational controls; roll out contract-aware API/status before Customer plan advertising. No Firebase Functions deployment is required for this change; scheduled lifecycle functions preserve their existing expiry/normalization responsibilities.

## Isolated validation

Focused tests execute real handlers, transactions, Express middleware and TSX render/effect branches with synthetic dependencies. The rules tests use a loopback-only Firestore emulator and a `demo-` project. No real accounts, API keys, payment requests, or remote business records are used.

Coverage includes Admin authorization/revocation, invalid and concurrent saves, audit failure, maintenance exemptions, fixed independent IP protection, registration cleanup and direct-rule bypass prevention; defaults, finite/Unlimited admission, cross-key concurrency, UTC rollover and preserved counters; legacy contracts, finite Trial/Max commitments, frozen checkout/fulfillment and unchanged prices; verified public/personalized presentation, current usage, stale/unavailable states and workspace stability. Existing Trial, checkout-lock, paid fulfillment, Audit Log, landing/login, Pro Max, billing and workspace regressions are also checked. Both frontend TypeScript/production builds use synthetic build configuration. Focused lint comparison uses the installed flat Next rules and compares changed files with the accepted base; the pre-existing Admin legacy ESLint configuration is incompatible with its installed Next flat config and was not modified.

All validation totals and the final local commit are recorded in the completion report. No implementation blockers remain once those checks pass. The coordinated deployment/rules work remains a future release dependency, not a claim that local changes are live.

## Final local results

- Focused validation: 212/212 PASS, including seven real emulator rules tests.
- Existing Trial, payment/checkout-lock and Audit Log compatibility: 257/257 PASS (171 Trial tests with their isolation loader; 86 payment/Audit tests with their own isolated fixtures).
- Admin and Customer production builds and their TypeScript checks: PASS using synthetic build configuration.
- Focused lint comparison: 16 changed TS/TSX files; zero new findings, four existing findings versus nine in the accepted baseline. The unchanged Admin legacy CLI configuration error is described above.
- Backend syntax and diff-check: PASS.
- GitHub master verified at the unchanged base e9256a008a5ddb4a16218682927e05090d96a7a8.
- Remaining local blockers: none.

## Changed-file manifest

- `admin-panel/next.config.ts`
- `admin-panel/src/app/settings/page.tsx`
- `admin-panel/src/lib/api-key-inventory.ts`
- `dashboard/src/app/dashboard/api-keys/page.tsx`
- `dashboard/src/app/dashboard/page.tsx`
- `dashboard/src/app/dashboard/plan-billing/page.tsx`
- `dashboard/src/app/layout.tsx`
- `dashboard/src/app/signup/page.tsx`
- `dashboard/src/components/auth/AuthEntry.tsx`
- `dashboard/src/components/layout/LayoutWrapper.tsx`
- `dashboard/src/components/reports/CustomerUsageSummary.tsx`
- `dashboard/src/components/shared/CustomerMaintenanceBoundary.tsx`
- `dashboard/src/components/subscription/SubscriptionModal.tsx`
- `dashboard/src/config/plans.ts`
- `dashboard/src/lib/plan-request-policy.tsx`
- `dashboard/src/lib/subscription.ts`
- `docs/admin-system-settings-local-validation.md`
- `firestore.rules`
- `functions/request-limit-policy.mjs`
- `functions/subscription-lifecycle.mjs`
- `routes/admin.js`
- `scripts/adviser-free-trial-loader.mjs`
- `scripts/run-adviser-free-trial-tests.mjs`
- `server.js`
- `services/account-quota.js`
- `services/admin-entitlements.js`
- `services/api-key-management.js`
- `services/api-key-security.js`
- `services/customer-registration.mjs`
- `services/free-trial.js`
- `services/payment-checkout.js`
- `services/payment-contract.js`
- `services/payment-webhook.js`
- `services/system-settings-contract.mjs`
- `services/system-settings.js`
- `tests/adviser/landing-inline-login.test.mjs`
- `tests/adviser/plan-billing-ui.test.mjs`
- `tests/adviser/plan-request-limits.test.mjs`
- `tests/adviser/plan-request-presentation.test.mjs`
- `tests/adviser/pro-max/parity.test.mjs`
- `tests/adviser/system-settings-rules.test.mjs`
- `tests/adviser/system-settings-ui.test.mjs`
- `tests/adviser/system-settings.test.mjs`
- `tests/adviser/unified-customer-login.test.mjs`
- `tests/adviser/workspace-refresh/refresh.test.mjs`
