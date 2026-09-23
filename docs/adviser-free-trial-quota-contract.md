# Final client quota contract — local review candidate

This contract supersedes the original integration's Free daily allowance and
its exhausted-Trial hold-until-expiry behavior. No commit, deployment, production
inspection or migration has been performed. Notifications remain deferred.

## Allowance and accounting

| Effective entitlement | Authoritative counter | Allowance / boundary |
| --- | --- | --- |
| Free / Starter | `account_free_monthly_usage/{uid}` | `min(apiRequestLimit, 50)` per UTC calendar month |
| Active Pro Trial | `account_trial_usage/{uid}` | 500 total, until seven days or exhaustion, whichever is first |
| Paid Pro | `account_api_usage/{uid}` | Existing 5,000/day policy |
| Enterprise / Unlimited | `account_api_usage/{uid}` | Existing unlimited policy and daily diagnostics |

Free's default server limit is 50. An explicit nonnegative lower integer,
including zero, remains authoritative. Invalid limits fail closed; a stale
larger Free limit cannot raise the ceiling above 50. Paid-plan behavior and
payment fulfillment are unchanged.

The monthly window is `YYYY-MM`, with a server-derived reset at 00:00:00 UTC on
the first day of the next month. For example, September 2026 ends at
`2026-10-01T00:00:00.000Z`. Midnight within September does not release capacity.
Counters are account-wide, never per key. Admission consumes a unit atomically;
as before, downstream errors after admission do not refund it. Authentication,
plan, hold and exhausted-quota rejections do not consume a unit.

The one-successful-key-generation-per-account/UTC-day control and the 60/minute
IP limiter are separate and unchanged. Creating, revoking or replacing keys
never resets/refunds monthly or Trial usage.

## Monthly migration: operator-approved fail-closed hold

Daily/per-key counters cannot prove earlier usage in the current month. An
absent monthly counter therefore establishes a transaction-safe zero pending
record with `holdUntil` equal to the next UTC month boundary. Requests are
denied with `QUOTA_CUTOVER_PENDING` until then; at/after the boundary the first
admitted Free request writes used=1. Concurrent first requests cannot create
competing openings. Metadata displays the hold, not an available fresh allowance.

An optional **new** `FREE_MONTHLY_QUOTA_CUTOVER_AT` assertion permits immediate
initialization only with Firestore server creation metadata strictly after that
cutover and no later than server now. Missing/invalid/future cutover or missing,
ambiguous/client-writable creation evidence uses the hold. The existing
`API_QUOTA_CUTOVER_AT` cannot stand in for this new policy's cutover. All instances
must switch coherently before the operator's assertion can be trusted. No value
is invented here and no production counter is edited.

**Production release requirement:** set `FREE_MONTHLY_QUOTA_CUTOVER_AT` to the
coordinated, operator-verified UTC instant the monthly policy is active on every
backend instance. Configure the same value consistently before release. The
runtime intentionally retains its fail-closed missing-value behavior, but the
production release checklist should not leave this input unset: otherwise every
account without an authoritative monthly counter waits for the next UTC month.
Never copy the earlier daily-cutover value or backdate the monthly cutover.

The monthly counter is separate from paid daily history. Paid requests do not
consume Free allowance; returning to Free reuses the current authoritative
monthly balance, or applies the same unknown-opening-balance hold if absent.

## Trial termination and preserved balances

Activation remains an authenticated, one-time transaction; browser fields,
selected context and URL parameters never confer entitlement. Trial starts at
server time and ends seven UTC calendar days later (e.g. September 23 at noon
UTC to September 30 at noon UTC), or when request 500 is admitted.

Request 500 consumes the final Trial unit and atomically writes protected
`users.trialExhaustedAt`. That request retains its admitted Pro behavior. Every
subsequent entitlement evaluation returns Free unless valid paid entitlement
takes precedence. A request for a Pro-only endpoint then fails its plan gate.
There is no 501st Trial unit: a later eligible request uses Free monthly quota.

While active, Trial does not consume or reset the Free month balance and is not
capped by it. A missing monthly balance is recorded as pending when a Trial API
request first encounters it; that monthly hold does not cap active Trial usage.
The existing legacy daily cutover hold remains independent. Trial expiry or
exhaustion does not clear a pending monthly hold. Month rollover never resets
Trial usage or daily key-generation markers.

After either termination condition, existing keys remain valid, the owned
businessSegment is preserved, and hasUsedFreeTrial stays true. The client's old
automatic Trial-key-revocation wording is explicitly superseded. Trial cannot
restart. Normal paid Pro upgrade through the existing PayMongo flow remains
available. No watcher or notification process is required for expiry.

## Reporting, scope and rules

Admin's active Trial usage is read from the Trial counter, not daily/monthly
usage. After exhaustion, Admin displays current Free monthly usage separately
from ended Trial history: **Free 2/50 monthly; Trial ended 500/500 total**, never
2/500. Paid reporting stays daily. Customer metadata and quota labels identify
monthly, daily and Trial periods. Settings uses the shared segment policy:
Hardware Free -> Trial -> Free remains Hardware, never all segments.

Both counter collections are denied to browser reads/writes, including Admin
browser clients. Ownership, paid authority and Trial exhaustion fields remain
server-protected. Canonical signup and permitted profile edits remain allowed.
Public catalog reads and URL-only submissions are unchanged. No new composite
index is required (new quota reads are direct document lookups).

## Release inventory and backlog

Later coordinated release requires backend, Customer, Admin, restrictive rules
and the changed packaged shared Functions lifecycle module. No new Function or
schedule, dependency, lockfile or index is introduced. A real-browser release
gate and review of trustworthy existing ownership remain required. This task
does not authorize release.

Separately deferred client TODOs:

- Day-4 Trial warning email and daily Trial monitoring.
- Linked Products must display the products the Customer selected.
- Generated-key modal should prominently show the Key Name while exposing the
  actual API secret once for copying.
- Remove the requested technical ID from the Admin Security Center.

## Validation

Final local rerun: **1,703 passed, 0 failed, 0 skipped, 0 cancelled** (including
273 Firestore emulator assertions and 113 Admin traffic tests). Customer/Admin
production builds with TypeScript, API syntax/routing, Functions build/shared
lifecycle tests and `git diff --check` passed. Tests cover monthly boundaries,
lower caps, multi-key atomicity, migration holds, Trial exhaustion/expiry into
the preserved Free balance, key retention, Admin projections, segment Settings,
rules escalation and existing payment/auth/catalog regressions. All fixtures are
local and synthetic; frontend builds use synthetic public configuration.


## Complete uncommitted integration manifest

84 files including the pre-existing integration; paths are relative to this
worktree. Dependencies and lockfiles are unchanged. Nothing is staged or committed.

| Path | Purpose |
| --- | --- |
| `.env.example` | Document optional monthly cutover without selecting a production value. |
| `admin-panel/src/app/consumers/page.tsx` | Show current quota period, monthly hold and separate ended Trial total. |
| `admin-panel/src/app/security/page.tsx` | Show quota period/hold and ended Trial history; no unrelated field removal. |
| `admin-panel/src/lib/use-account-entitlements.ts` | Type monthly/current usage and separate Trial history returned by backend. |
| `dashboard/DOCUMENTATION_PAGE_SPECS.md` | Correct Free monthly and Trial total request policy in the developer-page specification. |
| `dashboard/src/app/dashboard/api-keys/page.tsx` | Distinguish Free monthly, paid daily and total Trial allowance. |
| `dashboard/src/app/dashboard/api-playground/page.tsx` | Avoid confusing pagination with request quotas. |
| `dashboard/src/app/dashboard/free-trial/page.tsx` | Server-backed trial CTA, status, expiry, total usage and API-key link. |
| `dashboard/src/app/dashboard/page.tsx` | Display authoritative business segment and correct monthly/daily/Trial allowance period. |
| `dashboard/src/app/dashboard/products/page.tsx` | Synchronous owned-segment product/cart scoping, including initial render. |
| `dashboard/src/app/dashboard/settings/page.tsx` | Use shared owned-segment policy for Free/Trial, preserving paid behavior. |
| `dashboard/src/app/docs/page.tsx` | Explain monthly Free, daily paid and total Trial quotas and error behavior. |
| `dashboard/src/app/privacy-policy/page.tsx` | Correct Free quota example to calendar-month semantics. |
| `dashboard/src/components/auth/LoginModal.tsx` | Canonical selection checked against owned segment and backend effective plan. |
| `dashboard/src/components/layout/Sidebar.tsx` | 7-Day Pro Trial navigation item. |
| `dashboard/src/components/products/AddProductModal.tsx` | Lock Free/Trial segment; preserve URL-only submission flow. |
| `dashboard/src/components/reports/CustomerUsageSummary.tsx` | Trial usage labels/expiry rather than daily reset. |
| `dashboard/src/config/plans.ts` | Correct Free marketing copy; no price or paid-plan changes. |
| `dashboard/src/lib/entitlement-poller.ts` | Schedule refresh at trial as well as paid expiry. |
| `dashboard/src/lib/firebase/auth-context.tsx` | Expose owned active segment, preserving existing session/logout machinery. |
| `dashboard/src/lib/subscription.ts` | Type the read-only activeTrial projection. |
| `docs/adviser-free-trial-integration.md` | Approved contract, local evidence, rollout gates and full file manifest. |
| `docs/adviser-free-trial-quota-contract.md` | Canonical final contract, migration decision, evidence, backlog and complete manifest. |
| `docs/adviser-phase2a-api-key-security.md` | Mark historical Free daily accounting as superseded by final monthly contract. |
| `docs/adviser-phase2b2-subscription-lifecycle.md` | Document monthly Free fallback and separate paid/Free balances. |
| `docs/adviser-r4-dashboard-reports.md` | Correct reporting policy to Free monthly quota. |
| `docs/adviser-r5a-auth-navigation.md` | Link the trial contract / correct authoritative segment documentation. |
| `docs/adviser-r5b-api-history-ux.md` | Correct current API-policy references without changing history behavior. |
| `docs/adviser-r5c-final-requirements.md` | Distinguish monthly requests from unchanged daily key generation. |
| `docs/release-environment.md` | Document separate optional monthly cutover and fail-closed default. |
| `docs/release-runbook.md` | Link the trial contract / correct authoritative segment documentation. |
| `docs/system-flow.md` | Update authoritative Free/Trial quota flow and retained keys. |
| `firestore.rules` | Protect ownership, trial fields and the server-only shared trial counter. |
| `functions/subscription-lifecycle.mjs` | Seven-day Trial overlay with atomic-exhaustion marker; Free fallback and paid precedence. |
| `middleware/planGate.js` | Inject optional monthly cutover into quota enforcement. |
| `package.json` | Add isolated test command only; dependencies unchanged. |
| `routes/admin.js` | Inject the same monthly cutover into Admin usage projections. |
| `routes/apikeys.js` | Inject the same monthly cutover into Customer key metadata. |
| `routes/freetrial.js` | Mount authenticated activation/status routes; no provider calls. |
| `scripts/adviser-free-trial-loader.mjs` | Fixed-allowlist, credential-scrubbed trial test runner. |
| `scripts/adviser-phase2a-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-phase2b2-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-r2a-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-r2b-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-r3-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-r5b-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/adviser-r5c-loader.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-free-trial-tests.mjs` | Fixed-allowlist, credential-scrubbed trial test runner. |
| `scripts/run-adviser-phase2a-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-phase2b2-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-r2a-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-r2b-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-r3-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/run-adviser-r5c-tests.mjs` | Allowlist the new pure segment dependency without allowing external I/O. |
| `scripts/test-adviser-phase2a-rules.mjs` | Deny quota/ownership/exhaustion forgery and browser access to both new counters; retain signup/profile edits. |
| `scripts/test-adviser-phase2b1-rules.mjs` | Rules-emulator trial/ownership checks or canonical signup fixtures. |
| `scripts/test-adviser-phase2b2-rules.mjs` | Rules-emulator trial/ownership checks or canonical signup fixtures. |
| `scripts/validate-release-config.mjs` | Validate optional monthly cutover and warn about holds. |
| `server.js` | Mount authenticated activation/status routes; no provider calls. |
| `services/account-quota.js` | Enforce Free monthly, paid daily and total Trial counters with atomic exhaustion and cutover holds. |
| `services/admin-entitlements.js` | Read correct counter per entitlement and preserve ended Trial history separately. |
| `services/api-key-management.js` | Trial usage metadata and owned-segment validation; existing daily generation limit retained. |
| `services/api-key-security.js` | Validate trial counter binding and emit period metadata. |
| `services/customer-segment.d.ts` | Types for the shared segment policy. |
| `services/customer-segment.js` | Single shared owned/context segment policy and synchronous UI scoping. |
| `services/daas-catalog.js` | Owned-segment restriction for Free/Trial API-key catalogs; public catalog unchanged. |
| `services/daas-security.js` | Carry monthly cutover into atomic request admission. |
| `services/free-trial.js` | Revocation-checked transactional activation and authoritative status. |
| `services/payment-checkout.js` | Read-only subscription projection of activeTrial and remaining time; payment mutations unchanged. |
| `services/product-submissions.js` | Transactional defense against a tampered submitted segment. |
| `services/reporting.d.ts` | Types for optional trial quota period. |
| `services/reporting.js` | Pro Trial segment scope and total-trial quota presentation. |
| `tests/adviser/free-trial/trial.test.mjs` | 64 isolated Trial/segment/monthly/boundary/concurrency/migration and UI wiring tests. |
| `tests/adviser/phase1/daas-catalog.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/phase2a/api-key-security.test.mjs` | Adapt Free enforcement/cutover cases to monthly windows; retain key-security and paid coverage. |
| `tests/adviser/phase2b2/lifecycle.test.mjs` | Verify preserved Free month, paid lifecycle, correct Admin Trial totals and paid history precedence. |
| `tests/adviser/r2a/submissions.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r2b/media.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r3/catalog.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5a/landing-login-modal.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5b/ux.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5b/wiring.test.mjs` | Normalize Windows CRLF before extracting the existing clipboard test handler. |
| `tests/adviser/r5c/generation.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r6b/release.test.mjs` | Test optional/malformed/valid monthly cutover configuration. |
