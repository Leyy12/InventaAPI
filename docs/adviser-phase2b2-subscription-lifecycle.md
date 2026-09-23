# Phase 2B2 — subscription lifecycle and entitlement consistency

Local, uncommitted implementation for review. Branch: `adviser/r2-subscription-lifecycle`.
Base: `cfd72dbdfed5c756c2b1268f9802454eefd7867b`.
Production reference: `ac3908401fac5732192ac364600c7f397a3a6af6` (unchanged at safety gate).
No production Firebase or PayMongo calls, migrations, commits, pushes or deployments.
Reference repository untouched.

## Actual previous lifecycle

- Checkout/status: Firebase-authenticated token UID; server-bound payment order. Active Pro purchases refused. Expired Pro only became Free when visiting status or when the optional scheduled function ran.
- DaaS: account-level quota transactions already re-read credentials, account and usage, but used stored plan/limit without subscription dates/status. A stale Pro record could retain paid API access.
- Payment: unique event/payment records and account/order writes were atomic, but fulfillment always used payment time +30 days and refused an already-active Pro account.
- Scheduler: daily existing Firebase Function read Pro accounts and later batched unconditional downgrade writes. A renewal between read and commit could be overwritten.
- Deletion: Customer privacy page wrote client-controlled `deletionRequested`/`status=pending_deletion`, then attempted sequential key revocation. No Auth deletion or backend access barrier existed.
- Customer UI: cached Firestore plan, browser expiry calculations, an incorrect Pro “Unlimited requests” label, and a modal that blocked active renewal.
- Admin consumers/security: joined profiles but displayed stale key-level plan/limit/counters.
- Other callers inspected: auth/account management, rules, notifications, product display, DaaS middleware and its two mounted endpoints, payment runners and quota tests. The PostgreSQL `filtered-products.js` router is not mounted by `server.js`; it is not the deployed Firestore DaaS path.

## Canonical authority and transitions

`functions/subscription-lifecycle.mjs` is the pure backend policy shared by Express
and the separately deployable existing Functions package. It has no SDK/network
imports. It reads current account existence/blocking state, plan, subscription
status, expiration and injected server time. No browser clock is an authority.

| Current state / event | Effective entitlement and persisted result |
|---|---|
| Free / Starter | Final quota contract: at most 50/UTC month; explicit lower server caps remain honored. Enterprise/Unlimited semantics remain unchanged. |
| Pro / Professional, active, now < end | Pro, active, 5,000/day. |
| Pro, now == end or now > end | Free, inactive, 50/UTC month; current monthly balance or migration hold applies even without a status/dashboard request. |
| Expired Pro reaches quota or key-management evaluation | Transactionally persist Free/inactive/50; preserve subscription dates, audit history and used quota. |
| Active Pro + genuinely new verified payment | Extend existing future end by the existing 30 runtime-local calendar days atomically. |
| Expired Pro / Free + verified payment | Start a new 30-day period at server fulfillment time; any preserved future paid end is not shortened. |
| Deletion begins | `accountState=deleting`, inactive, zero stored allowance; all protected API/key/payment paths deny access/grants immediately. |
| Cleanup succeeds | `accountState=deleted` protected tombstone; revoked keys, blocked retained usage, deleted Auth identity. |
| Verified new payment after deletion began | Paid audit/order/event retained atomically for operator review, `entitlementGranted=false`; no account reactivation. |

Missing/malformed Pro expiry fails closed with an unavailable/review response,
never an invented term. Existing legacy `deletionRequested`, pending-deletion,
disabled/deleted markers also block access. Historical receipts never reconstruct
entitlement. The later [final quota contract](adviser-free-trial-quota-contract.md)
adds monthly Free accounting and Trial without changing paid renewal semantics.

## Expiry and API keys

Quota consumption evaluates entitlement inside the same transaction that reads
the account, current key and shared usage. Expiry normalization commits even when
access is refused for exhausted quota or a paid-only endpoint. Existing usage
is not reset: paid daily history is retained separately and the existing Free
monthly balance resumes. An unknown monthly opening balance enters the approved
next-UTC-month hold; daily history cannot establish it. Another key cannot obtain
a new budget. Paid daily cutover behavior is preserved.

Existing credentials continue under effective Free limits. Revocation and
credential expiry remain separate checks. Key creation/mutations re-read the
account transactionally, preventing creation racing deletion from admitting
a usable new key. An API request already admitted before deletion may finish;
all admissions serialized after the deletion marker are refused.

The existing optional scheduler now uses the same evaluator and a fresh account
transaction, preventing stale batch downgrades. It is not required for immediate
API enforcement. Its deployment/availability is not asserted or changed here.

## Renewal decision for review

There was no prior renewal policy: Phase 2B1 intentionally refused active Pro.
This phase adopts `max(valid existing end, successful server fulfillment time)
+ 30 calendar days`, computed inside each payment transaction. Runtime-local
`getDate/setDate` arithmetic preserves the pre-Phase-2B2 calculation under the
same server timezone, including DST. Initial purchase, active renewal and expired
renewal all use this one calculation; only the anchor differs. Price
149900 PHP centavos and 5,000/day are unchanged. This is prepaid extension, not
automatic billing, proration, calendar-month billing or a new payment method.

Two distinct successful payments each add time; optimistic retries prevent lost
updates. The same underlying payment, including another event ID, adds no time.
Receipts preserve each purchased period. `lastSubscribedAt` reports latest
fulfillment time; `subscriptionStartedAt` preserves the current continuous period
start, resetting after expiry. Quota usage is not reset by renewal.

The initial Phase 2B2 UTC arithmetic was corrected after review: it differed from
the base across DST. No new UTC business-time policy is introduced. Actual
production runtime timezone remains an explicit release input. A later change
to subscription timezone policy requires an explicit policy/migration decision.
Keeping existing future paid time is necessary preservation, not a claim that
the repository previously supported active renewal.

## Deletion sequence and recovery

Authenticated `POST /api/v1/account/deletion` requires explicit confirmation and
token-derived UID; a forged body/query UID is denied. The server first commits
the deleting marker. It then revokes that owner's keys with bounded individual
transactions, marks retained quota blocked, deletes Firebase Auth, and replaces
the profile with a minimal protected tombstone and historical subscription dates.

The marker, not completion of a potentially long key loop, is the immediate
access barrier. Failure before marking returns no success and does not call Auth.
Failure after marking returns HTTP 202 with `deleted=false/accessDisabled=true`.
Only confirmed Auth deletion plus tombstone finalization returns `deleted=true`.
The UI never equates a partial cleanup with completed deletion.

Firestore and Auth are not one transaction. If Auth fails, the account remains
blocked and the authenticated request can retry. If Auth succeeds but the final
Firestore write fails, a trusted operator can rerun exported
`completeAccountDeletion(db, uid, deleteAuthUser, clock)` after verifying the
existing deleting marker. Auth `user-not-found` is an idempotent success. No
unauthenticated retry endpoint or reset/unblock API exists. Use this workflow
for operator account disabling/deletion as well; out-of-band Auth-only console
changes do not substitute for the Firestore access barrier.

Financial transactions, orders, bindings, events and usage evidence are retained.
The final profile no longer retains names/email/business details. Existing key,
notification and audit records may still contain historical personal information;
this phase does not claim complete data erasure or invent a statutory retention
period. A broader retention/anonymization policy remains an operator/client input.
New verified charges racing deletion remain visible as `review_required` with
structured log evidence; an authorized operator must resolve the payment outcome.
No automatic refund, provider cancellation, or resurrection is implemented.

## Status and UI contract

`GET /api/v1/checkout/subscription-status` is now authenticated and read-only. It
reports effective plan, status, limit, start/end, expiry, server time and remaining
time. Order-specific `paymentConfirmed` requires a matching processed order and
paid receipt. It confirms fulfillment of that purchase independently of later
renewals/expiry; it does not claim current Pro. An order held for review is not
confirmed as fulfilled.

Customer context overlays cached profile entitlement with backend results. Missing
or failed verification displays Unavailable/unverified instead of stale Pro. It
refreshes periodically, on visibility return and at the server-reported expiry
boundary. Browser time is used only to schedule a refresh/display dates. Payment
return still requires backend confirmation. Pro wording shows the actual limit;
settings exposes renewal, and the expiry banner links to settings. Landing/login
policy and unrelated layout remain unchanged.

Polling correction: one `createEntitlementPoller` instance owns the timer for
scheduled, visibility, manual and payment-triggered refreshes. Every request
installs the next attempt before awaiting I/O. Request generations suppress stale
results, never future scheduling; only the latest result may move the timer to
the server-reported expiry boundary. Stop/sign-out/unmount invalidates requests
and clears the timer; restart is idempotent. Profile refresh has its own sequence
and cannot cancel or publish entitlement independently of the poller.

The original failure was reproduced from the old provider source: newest Pro
state with zero timers after an older poll completed. The corrected provider
wiring reproduced the same ordering with exactly one future timer, ignored the
stale result, and left zero timers after cleanup. Deterministic direct scheduler
tests cover normal, overlapping manual/payment, rapid manual, stale generation,
logout, unmount, re-login, expiry, rejected and unresolved requests. These are
runtime scheduling tests, not merely static UI assertions.

Admin consumers/security use a bearer-authenticated Admin-only endpoint for
effective account plan/status and shared account usage, with no per-key fallback.
Existing key status remains a credential diagnostic distinct from account status.

## Rules and test isolation

Customer signup/update cannot assert or remove subscription, quota, payment,
renewal, disabled/deletion fields. Deleting/deleted tombstones cannot be edited,
deleted or replaced by clients, including Admin browsers. Server Admin SDK alone
finalizes deletion. Phase 2A key/quota and Phase 2B1 payment protections remain.

The Phase 2B2 runner uses a fixed pure-module allowlist, scrubbed configuration,
fake auth/provider functions, an injected clock and the optimistic memory adapter.
SDK/network imports and global network APIs are denied. Adapter writes publish
only after version validation and fault checks; deterministic hooks force races.
Rules tests use the real cached Firestore emulator on loopback with demo projects
and synthetic tokens. UI contract tests are static assertions, not browser E2E.

Official API references checked during implementation:
[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
and [Admin Auth deletion](https://firebase.google.com/docs/auth/admin/manage-users#delete_a_user).
No live SDK/provider integration is claimed.

## Validation evidence

Node 22.20.0. All 433 tests passed; none failed or skipped.

| Exact command | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm run test:adviser:phase2b2` | 98 | 0 | 0 |
| `npm run test:adviser:phase2b2:rules` | 35 | 0 | 0 |
| `npm run test:adviser:phase2b1` | 122 | 0 | 0 |
| `npm run test:adviser:phase2b1:rules` | 36 | 0 | 0 |
| `npm run test:adviser:phase2a` | 62 | 0 | 0 |
| `npm run test:adviser:phase1` | 22 | 0 | 0 |
| `npm run test:adviser:phase2a:rules` | 49 | 0 | 0 |
| `npm run test:r0:config` | 9 | 0 | 0 |

Phase 2B2's 98 tests comprise the original 54, 12 deterministic polling tests,
and 16 calendar cases each in isolated UTC and America/New_York processes.
Calendar tests compare the exact base calculation for normal, month-end,
leap-year, spring-forward and fall-back dates, for all three purchase/renewal
anchors. The reviewed New York spring probe now matches the base at
`2026-03-31T11:00:00.000Z` (not the former UTC result at 12:00); the fall probe
matches at `2026-11-19T13:00:00.000Z`. Transactional renewal/replay and expiry-race
regressions remain passing. No timezone is chosen for production by these tests.

No dependency or lockfile changes. Temporary frontend
copies exclude environment files and use synthetic demo Firebase/loopback API.
Admin's unchanged lockfile installed 482 packages offline with scripts disabled.
Both TypeScript checks and production builds passed (Customer 17 pages, Admin 10).

The existing Admin FlatCompat ESLint configuration fails before linting with a
circular-structure error. A temporary native-flat config using the same installed
Next presets checked current and HEAD sources: 6 existing errors/0 warnings in
both, no new diagnostics. The repository config was not repaired. Customer lint
is compared against the same changed files at HEAD: current 8 errors/16 warnings,
base 9 errors/16 warnings. No new diagnostics; removal of the obsolete modal
wording removed one existing diagnostic. No unrelated lint cleanup.

Frontend commands in temporary copies: `node node_modules/typescript/bin/tsc
--noEmit --incremental false`, `node node_modules/next/dist/bin/next build`, and
`node node_modules/eslint/bin/eslint.js` against the changed-file manifest. Admin
lint comparison uses temporary `--config phase2b2-eslint.mjs`. Initial Admin
TypeScript ran before offline extraction completed and could not find Next type
files; the completed-install rerun passed without dependency changes.
`git diff --check` and untracked-file whitespace checks passed. Syntax checks for
the Functions entry and payment services passed. UI tests are not claims of live
Firebase/provider or browser E2E certification.

After the two-blocker correction, all eight suites above were rerun on Node 22.
Customer TypeScript and production build passed again in the temporary copy
(17/17 pages). Lint limited to the two corrected Customer files reports zero
errors and two existing auth-context warnings, with no new diagnostics; the new
poller has none. Admin files were untouched, so its prior validation was not
rerun. No dependency installation or lockfile change was needed.

## Changed-file manifest (44 files)

| Path | Purpose |
|---|---|
| `functions/subscription-lifecycle.mjs` (new) | Canonical pure entitlement, renewal and transactional normalization. |
| `functions/index.js` | Existing scheduler re-reads accounts transactionally. |
| `services/api-key-security.js` | Delegate account policy to canonical evaluator. |
| `services/account-quota.js` | Enforce and persist expiry in quota transactions without resetting usage. |
| `services/api-key-management.js` | Effective metadata and account checks during key mutations. |
| `services/payment-contract.js` | Block disabled accounts and permit verified active renewal. |
| `services/payment-checkout.js` | Read-only effective status and receipt confirmation. |
| `services/payment-webhook.js` | Atomic renewal and paid-review evidence for deletion races. |
| `services/account-deletion.js` (new) | Marker-first, retryable key/Auth/profile cleanup. |
| `services/admin-entitlements.js` (new) | Admin-only effective account/usage projection. |
| `routes/account.js` (new) | Authenticated deletion adapter. |
| `routes/admin.js` | Wire Admin entitlement endpoint. |
| `server.js` | Mount account route. |
| `firestore.rules` | Protect lifecycle fields and deletion tombstones. |
| `dashboard/src/lib/subscription.ts` (new) | Authenticated typed status reader. |
| `dashboard/src/lib/entitlement-poller.ts` (new) | Single timer owner with independent stale-response protection. |
| `dashboard/src/lib/firebase/auth-context.tsx` | Backend entitlement projection and refresh scheduling. |
| `dashboard/src/app/dashboard/page.tsx` | Effective quota wording, renewal CTA and separate payment confirmation. |
| `dashboard/src/app/dashboard/privacy/page.tsx` | Server deletion workflow and accurate partial-completion wording. |
| `dashboard/src/app/dashboard/products/page.tsx` | Unverified entitlement does not display paid access. |
| `dashboard/src/app/dashboard/settings/page.tsx` | Verified state and direct renewal entry. |
| `dashboard/src/components/subscription/SubscriptionModal.tsx` | Enable server-authorized active renewal. |
| `dashboard/src/components/layout/Navbar.tsx` | Warning uses server remaining time. |
| `dashboard/src/components/shared/SubscriptionExpiryBanner.tsx` | Renewal link targets settings. |
| `dashboard/src/hooks/useSubscriptionWarning.ts` | Server-derived active/remaining-time warning. |
| `admin-panel/src/lib/use-account-entitlements.ts` (new) | Authenticated batched account projection reader. |
| `admin-panel/src/app/consumers/page.tsx` | Display effective account plan/shared usage. |
| `admin-panel/src/app/security/page.tsx` | Display effective account plan/shared usage. |
| `package.json` | Two isolated Phase 2B2 test commands only. |
| `scripts/adviser-phase2a-loader.mjs` | Allow shared pure policy in regression graph. |
| `scripts/run-adviser-phase2a-tests.mjs` | Inspect shared policy in isolation checks. |
| `scripts/adviser-phase2b1-loader.mjs` | Allow shared pure policy in regression graph. |
| `scripts/run-adviser-phase2b1-tests.mjs` | Inspect shared policy in isolation checks. |
| `scripts/adviser-phase2b2-loader.mjs` (new) | Fixed manifest and network-import guard. |
| `scripts/run-adviser-phase2b2-tests.mjs` (new) | Scrubbed, isolated lifecycle runner. |
| `scripts/test-adviser-phase2b2-rules.mjs` (new) | Real loopback rules emulator cases. |
| `tests/adviser/phase2a/rules-and-wiring.test.mjs` | Assert replacement server deletion caller. |
| `tests/adviser/phase2b1/memory-firestore.mjs` | Add query support and deterministic conflict hook to atomic adapter. |
| `tests/adviser/phase2b1/payment.test.mjs` | Update authorized read-only status expectation and unresolved-Pro label. |
| `tests/adviser/phase2b2/lifecycle.test.mjs` (new) | Boundary, renewal, deletion, failure and race assertions. |
| `tests/adviser/phase2b2/wiring.test.mjs` (new) | UI/wiring and external-I/O isolation assertions. |
| `tests/adviser/phase2b2/polling.test.mjs` (new) | Deterministic scheduling, overlap, teardown and expiry tests. |
| `tests/adviser/phase2b2/calendar.test.mjs` (new) | Base-compatible initial/renewal calendar tests in explicit UTC/DST zones. |
| `docs/adviser-phase2b2-subscription-lifecycle.md` (new) | State map, decisions, recovery and review evidence. |

Full Phase 2B2 working set: 29 tracked changed files and 15 new untracked files,
nothing staged. The two-blocker correction changes only the provider, its new
polling helper, lifecycle calendar helper, purchase-contract comment, Phase 2B2
runner/loader, polling/calendar/wiring tests and this review document.
The scheduler deletion is replacement of stale batch logic/logging with the
shared transaction helper; endpoint schedule and deployment configuration remain.

## Remaining work and release gates

Customer submission/media, importer, dashboards/reports, login/landing policy,
remaining policy ambiguities and final certification remain outside this phase.
Free Trial is deferred; product submission is not started.

Existing release gates remain: actual production providers/targets and their
Node 22 support, dashboard lint debt (documented full baseline 52 errors/27
warnings), production configuration/secrets, coordinated production
`API_QUOTA_CUTOVER_AT`, production runtime timezone, and separately authorized
PayMongo sandbox validation.
Backend, Customer/Admin callers, rules and any enabled legacy scheduler must be
released as one reviewed unit; no deployment is authorized here.
