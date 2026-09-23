# Free Trial integration — local review contract

The [final client quota contract](adviser-free-trial-quota-contract.md) supersedes
the original Free daily policy: Free is now monthly before Trial; Trial ends at
expiry OR 500 requests, then protected API access requires paid Pro. The
monthly counter remains historical and does not restore access after Trial.
That document also records the approved migration hold, Admin projection and
Settings fixes.

## Status and safety

Implementation on `adviser/free-trial-integration`, based on production commit
`0f392700b6f921c55e478d2a8ea1469c3c54ad1e`.
The approved core, Phase 2 client TODO and Customer lint fix are locally
checkpointed at `f798764`, `d523734` and `b897156`. The hard paywall change
remains uncommitted for review.
Reference only: `origin/client/free-trial` at
`5a914d6489155ecc56a3c487454e2ee33825af84`.
No merge, rebase, wholesale cherry-pick, push, deployment or production access.
The original Client checkout and the Independent reference repository were not modified.

This is a review candidate, not a production release certification.

## Segment authority

Canonical values remain Grocery, Pharmacy, Hardware; R3 normalization/identity semantics
are unchanged. For Free/Starter and Pro Trial, `users.businessSegment` is ownership.
`selectedSegment` is context only and cannot confer another segment. Customer Login
requires a canonical choice, server profile and backend effective entitlement; it
rejects a choice outside owned scope. Paid Pro/Enterprise segment behavior is retained.

The auth context derives the active segment from ownership. Dashboard displays it.
Products scopes synchronously before filtering/rendering/cart construction, including
initial loading; no effect-driven all-segment flash. Add Product displays a locked
owned segment. The backend submission transaction rereads account/entitlement and
rejects a cross-segment payload. It retains the existing queue/Admin-review writer,
canonical reservation/collision safeguards and catalog freeze control.

Firestore clients cannot change businessSegment after signup or forge trial/plan
authority. Canonical signup and ordinary profile updates continue to work.
Free/Trial selectedSegment edits must equal ownership; paid context selection stays
supported. Missing ownership fails closed; no auto-assignment/migration is included.

**UI scope is not catalog confidentiality.** Public `GET /api/v1/products` and
public Firestore product reads are unchanged. API-key DaaS catalogs still apply
their owner's scope; stale embedded key product snapshots remain non-authoritative.

## Trial contract

- Name: **7-Day Pro Trial**.
- Eligible: active authenticated Customer (Developer/Consumer/Business), normal
  Free/Starter, canonical owned segment, no prior/ambiguous trial evidence.
- Endpoints: `POST /api/v1/free-trial/activate`, `GET /api/v1/free-trial/status`.
  Both require Firebase bearer verification with revoked-token checking. They
  reject client-supplied body/query terms and return no-store responses.
- Activation atomically reads the user and `account_trial_usage/{uid}`; creates
  version 1 trial state and a zero balance once. Concurrent grants serialize.
- Server-owned user fields: `trialVersion`, `hasUsedFreeTrial`,
  `trialStartedAt`, `trialExpiresAt`, `trialExhaustedAt` (and protected reserved `trialExpiredAt`).
  Existing or ambiguous trial evidence cannot silently be reset/regranted.
- Exactly seven UTC calendar days (604,800 seconds), starting at activation.
  No Vercel local-timezone or browser-clock authority.
- Stored paid-plan fields are not converted into a paid subscription. The shared
  entitlement evaluator overlays **Pro Trial**, level 1, while active.
  It passes existing Pro API middleware (including sales-feed) and is not subject
  to the Free catalog response cap. Owned segment still does not expand.
- **500 total account-wide API requests**, shared across all keys for the entire
  trial. `account_trial_usage/{uid}` binds used count to the exact trial dates.
  Quota, key validity and account entitlement are checked transactionally together.
  Requests 1–500 may succeed. The 500th atomically ends Trial entitlement;
  subsequent protected API requests fail with `403 UPGRADE_REQUIRED` before
  monthly accounting. Invalid/missing Trial counters fail closed. Admission
  still charges downstream failures.
- Midnight, new keys, revocation, browser/device changes or new login do not
  reset/refund usage. Exhaustion does not reopen the existing Free monthly
  balance or create another allowance.
- The existing daily-account counter is retained separately, not erased. Its
  clean-window/cutover hold remains enforced and appears in management metadata.
  Trial activation does not reset generation markers or bypass the one successful
  key generation per account/UTC day rule. Existing 60/minute IP limits remain.
- At server time >= trialExpiresAt, or after the 500th admission, the overlay ceases.
  `Upgrade Required` applies unless valid paid entitlement exists. Owned segment,
  Dashboard access and key records are preserved; new key generation is blocked.
  Paid Pro re-enables otherwise-valid keys. If paid Pro later expires, the
  paywall returns. The lifetime used flag remains. No scheduled job is
  necessary for correctness.
- A valid paid Pro subscription supersedes trial entitlement. Existing PayMongo
  checkout, webhook, amount/currency, order/payment idempotency and atomic
  fulfillment are unchanged. Activation creates no payment/order/subscription.
  The checkout service change is only its read-only entitlement status projection.

## UI and reference-branch decisions

Adapted the reference's amber/glass Trial card, name/active heading and Manage API
Keys concept to current components. Trial UI reads server eligibility, usage, expiry,
server time and remaining seconds. Pending/failed reads do not retain an active
claim; generations/abort guard stale responses after session change or unmount.
Current auth, protected routes, signup, separate Admin login and root-modal logout
architecture are retained, not replaced by the older feature branch.

Rejected old browser catalog writes, Storage uploads, per-key daily trial quotas,
old auth/rules/payment logic, startup/setInterval expiry authority and unrelated
Admin/import changes. The approximately 52 MB historic data blob was not ported.
The reference Upload File design is **not** implemented: images remain HTTPS
URL-only metadata in the existing secure submission/review architecture.

At the core checkpoint, day-4/expiry notifications were deferred. Phase 2 adds
the scheduled warning described below; expiry remains server-time entitlement
evaluation independently of notification delivery. There is still no
long-running watcher, startup listener or browser-authoritative timer.

## Phase 2 client TODO implementation — uncommitted

`monitorFreeTrials` is a Firebase v2 scheduled Function in `asia-southeast1`,
Node 22, at `0 */6 * * *` **UTC**. It examines only indexed
`users.trialExpiresAt` values in the active three-day warning window, in
bounded pages. The warning threshold is exactly `trialStartedAt + 4 × 24 hours`
UTC, with the original seven-day `trialExpiresAt` still in the future. It
re-reads the user and authoritative `account_trial_usage/{uid}` counter before
claiming a send. Expired, exhausted (500/500), paid-superseded, disabled,
deleted, and unnotifiable accounts are skipped. No key is revoked and no
entitlement, quota, segment or payment state is changed by the scheduler.

The server-only delivery adapter calls Resend `POST /emails` with a frozen
payload and deterministic idempotency key. A Firestore transaction on
`trial_warning_deliveries/{hash(uid,trialStartedAt)}` serializes concurrent
attempts; a seven-minute lease exceeds the Function timeout. Resend acceptance
with an email ID is the success boundary, after which an in-app notification
and `accepted` marker are written. Failed/uncertain sends are **not** marked
sent. Retries reuse the identical payload/key within 23 hours. Because Resend
retains keys for only 24 hours, an unresolved attempt beyond 23 hours becomes
`needs_review` and is never resent automatically; an operator must inspect
provider delivery evidence. This trades a possible missing warning for no
automatic duplicate. API Trial expiry does not depend on delivery.

The release operator must configure Firebase Secret Manager
`RESEND_API_KEY` for this Function and a verified
`TRIAL_WARNING_FROM_EMAIL` parameter. Both are new deployment gates; no
credentials or live email were used in this local implementation. The
`--scope=functions` release validator checks the sender and a supplied secret
without printing it; the operator must independently verify the bound Secret
Manager value and sender domain before deployment. No new Firestore composite
index is needed: the scheduler uses one range/order field and direct document
lookups. The existing notifications index serves the in-app bell.

Admin Security Center and API Key Inventory now render current product names
resolved from Firestore `products/{id}` for the canonical persisted key-link
ID union (full, partial variant and legacy ID links); embedded/browser names
are ignored. Zero links display an empty state; one or many names display in
a compact three-name list with a remainder count. Only linked IDs are read;
the Admin-only key inventory and existing Customer segment restrictions are
unchanged. Security Center no longer renders the raw `api_keys.userId` subline
under the Customer identity; its join/search/backend identity remain intact.

The Customer generated-key success modal emphasizes the persisted `name`
(`Key Name`) and separately shows the raw credential under “API Key — shown
once.” Copy uses the secret, not the name. Dismissal clears both in-memory
values. Existing key history continues to show the name and masked prefix,
never a recoverable raw credential.

## Validation before the final quota correction (historical)

The final quota correction's rerun results are reported separately; the counts
below describe the earlier implementation, not approval of the current changes.

Node 22.20.0, synthetic accounts/in-memory transactions, cached localhost-only
Firestore emulator, credential-scrubbed isolated runners. No production credentials
or real services used. Test-only manifests explicitly admit the new pure segment
module; SDK/network restrictions remain intact.

| Suite | Passed | Failed / skipped / cancelled |
| --- | ---: | --- |
| Free Trial + segment | 49 | 0 / 0 / 0 |
| Phase 1 | 22 | 0 / 0 / 0 |
| Phase 2A keys/quota | 62 | 0 / 0 / 0 |
| Phase 2B1 payments | 122 | 0 / 0 / 0 |
| Phase 2B2 lifecycle, including UTC/DST runs | 98 | 0 / 0 / 0 |
| R2A | 116 | 0 / 0 / 0 |
| R2B | 56 | 0 / 0 / 0 |
| R3 catalog | 168 | 0 / 0 / 0 |
| R4 reports | 115 | 0 / 0 / 0 |
| R5A auth/navigation and Business Segment Login | 164 | 0 / 0 / 0 |
| R5B | 144 | 0 / 0 / 0 |
| R5C daily key generation | 68 | 0 / 0 / 0 |
| R6B release | 49 | 0 / 0 / 0 |
| R6C payment mode | 51 | 0 / 0 / 0 |
| R9C routing | 6 | 0 / 0 / 0 |
| R0 config | 9 | 0 / 0 / 0 |
| Rules: Phase 2A + trial/ownership | 70 | 0 / 0 / 0 |
| Rules: Phase 2B1 | 36 | 0 / 0 / 0 |
| Rules: Phase 2B2 | 35 | 0 / 0 / 0 |
| Rules: R2A | 95 | 0 / 0 / 0 |
| Rules: R3 | 32 | 0 / 0 / 0 |
| **Total** | **1,567** | **0 / 0 / 0** |

Customer and Admin production builds (including TypeScript) pass with synthetic
public build configuration; shared imports resolve. API syntax and isolated R9C
routing validation pass. Functions build/syntax and shared lifecycle regression
pass; no Functions runtime or deployment was started. `git diff --check` passes.
Existing lockfiles/dependency versions are unchanged; install audit findings are
not remediated or waived by this feature.

## Separate release gates (not performed)

Obtain review and explicit deployment authorization. Deploy verified restrictive
rules together with the backend/frontend contract, before allowing trial activation.
Operator review must establish trustworthy canonical ownership on existing accounts:
do not silently promote mutable legacy selectedSegment into ownership.
Ambiguous/legacy trial fields require review, not a reset or automatic grant.
No production inspection or migration was performed here.

Real-browser authenticated E2E on the eventual deployed origins and all existing
production configuration/payment/catalog release gates remain required. Optional
notifications are separate work. This document grants no release permission.

## Files changed — path and purpose

Paths are relative to the isolated integration worktree.

| Path | Purpose |
| --- | --- |
| `dashboard/src/app/dashboard/api-keys/page.tsx` | Distinguish Free monthly, paid daily and total Trial allowance. |
| `dashboard/src/app/dashboard/free-trial/page.tsx` | Server-backed trial CTA, status, expiry, total usage and API-key link. |
| `dashboard/src/app/dashboard/page.tsx` | Display active authoritative business segment. |
| `dashboard/src/app/dashboard/products/page.tsx` | Synchronous owned-segment product/cart scoping, including initial render. |
| `dashboard/src/components/auth/LoginModal.tsx` | Canonical selection checked against owned segment and backend effective plan. |
| `dashboard/src/components/layout/Sidebar.tsx` | 7-Day Pro Trial navigation item. |
| `dashboard/src/components/products/AddProductModal.tsx` | Lock Free/Trial segment; preserve URL-only submission flow. |
| `dashboard/src/components/reports/CustomerUsageSummary.tsx` | Trial usage labels/expiry rather than daily reset. |
| `dashboard/src/lib/entitlement-poller.ts` | Schedule refresh at trial as well as paid expiry. |
| `dashboard/src/lib/firebase/auth-context.tsx` | Expose owned active segment, preserving existing session/logout machinery. |
| `dashboard/src/lib/subscription.ts` | Type the read-only activeTrial projection. |
| `docs/adviser-free-trial-integration.md` | Approved contract, local evidence, rollout gates and full file manifest. |
| `docs/adviser-r5a-auth-navigation.md` | Link the trial contract / correct authoritative segment documentation. |
| `docs/release-runbook.md` | Link the trial contract / correct authoritative segment documentation. |
| `firestore.rules` | Protect ownership, trial fields and the server-only shared trial counter. |
| `functions/subscription-lifecycle.mjs` | UTC trial expiry and Pro Trial effective entitlement; paid renewal unchanged. |
| `package.json` | Add isolated test command only; dependencies unchanged. |
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
| `scripts/test-adviser-phase2a-rules.mjs` | Rules-emulator trial/ownership checks or canonical signup fixtures. |
| `scripts/test-adviser-phase2b1-rules.mjs` | Rules-emulator trial/ownership checks or canonical signup fixtures. |
| `scripts/test-adviser-phase2b2-rules.mjs` | Rules-emulator trial/ownership checks or canonical signup fixtures. |
| `server.js` | Mount authenticated activation/status routes; no provider calls. |
| `services/account-quota.js` | Enforce Free monthly, paid daily and total Trial counters with atomic exhaustion and cutover holds. |
| `services/api-key-management.js` | Trial usage metadata and owned-segment validation; existing daily generation limit retained. |
| `services/api-key-security.js` | Validate trial counter binding and emit period metadata. |
| `services/customer-segment.d.ts` | Types for the shared segment policy. |
| `services/customer-segment.js` | Single shared owned/context segment policy and synchronous UI scoping. |
| `services/daas-catalog.js` | Owned-segment restriction for Free/Trial API-key catalogs; public catalog unchanged. |
| `services/free-trial.js` | Revocation-checked transactional activation and authoritative status. |
| `services/payment-checkout.js` | Read-only subscription projection of activeTrial and remaining time; payment mutations unchanged. |
| `services/product-submissions.js` | Transactional defense against a tampered submitted segment. |
| `services/reporting.d.ts` | Types for optional trial quota period. |
| `services/reporting.js` | Pro Trial segment scope and total-trial quota presentation. |
| `tests/adviser/free-trial/trial.test.mjs` | Behavioral activation, concurrency, total quota, scope, expiry and wiring tests. |
| `tests/adviser/phase1/daas-catalog.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/phase2a/api-key-security.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/phase2b2/lifecycle.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r2a/submissions.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r2b/media.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r3/catalog.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5a/landing-login-modal.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5b/ux.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
| `tests/adviser/r5b/wiring.test.mjs` | Normalize Windows CRLF before extracting the existing clipboard test handler. |
| `tests/adviser/r5c/generation.test.mjs` | Update fixtures/assertions for authoritative ownership; retain regression coverage. |
