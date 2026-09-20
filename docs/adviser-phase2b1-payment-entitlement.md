# R1 / Phase 2B1 — payment-to-entitlement security review

Status: implemented locally for ChatGPT review; not committed or deployed.
Reviewed base: `0846114920511bd0683e2f9ae66f6c848812508a`.
Production reference at start: `ac3908401fac5732192ac364600c7f397a3a6af6`.
Branch: `adviser/r1-payment-entitlement`. No reference-repository changes.

## Before: trust-boundary map

The Customer modal sent body UID/email to unauthenticated `create-gcash`.
The server chose PHP 149900 centavos but created no durable merchant order.
The unauthenticated status route accepted a query UID and could read/downgrade
that account. The redirect page initially claimed payment receipt and inferred
success from a refreshed Pro profile, without proving this particular purchase.

The webhook had useful raw-body HMAC/timing-safe/freshness checks, but selected
test/live signature by `NODE_ENV`, trusted event type as paid status, selected
the first payment as a fallback, and used payment/session metadata UID (including
a provider metadata lookup) as ownership. Amount, currency, mode, paid state,
session ownership, and stored product terms were not all verified. Event dedup
read errors explicitly continued. User entitlement was updated before a separate,
best-effort transaction record. Concurrent/different-event retries could repeat
the effect. Clients could also write some subscription fields directly.

Authority inventory: body/query UID, body email, webhook metadata UID/email/plan,
event-name-only success, provider-array fallback, unbound session, and redirect
query values were insufficiently trusted inputs. Price/currency/quota/duration
were already server constants; they are consolidated, not changed.

## Verified PayMongo contract (official documentation checked 2026-09-20)

| Item | Existing supported contract retained |
|---|---|
| Create | `POST https://api.paymongo.com/v1/checkout_sessions`; secret API key is Basic-auth username, empty password. No v2 migration. |
| Session | `cs_...`, type `checkout_session`; v1 creates its `pi_...` Payment Intent up front. |
| Fulfillment event | `checkout_session.payment.paid`; standard event envelope `data.id = evt_...`, `data.type = event`, `data.attributes.type/livemode/data`. |
| Payment proof | Nested `pay_...` payment has `status=paid`; matching Payment Intent has `status=succeeded`. Session status is `active`, **not** `paid`; `expired` is invalid. |
| Purchase | Payment/intent integer amount in centavos, currency `PHP`; line-item quantity/amount/currency agree. This route supports GCash only. |
| Signature | `Paymongo-Signature`: `t`, `te`, `li`; HMAC-SHA256 of timestamp + dot + unmodified raw JSON. Timing-safe equality against the configured mode. |
| Freshness | Retains the existing absolute five-minute timestamp tolerance, including future timestamps. PayMongo recommends timestamp comparison but does not prescribe five minutes. |
| Delivery | JSON acknowledgement 200–209 within 30 seconds; failed deliveries retry up to 12 times with backoff. No acknowledgement before durable fulfillment. |
| References | Merchant `reference_number` and string metadata are supported. They carry the order ID for diagnosis only, never resolve entitlement ownership. |
| Redirect | `checkout_url` is hosted by PayMongo. `success_url` is not payment proof; `cancel_url` navigation does not itself cancel provider records. |
| Request idempotency | API-wide resource-creation semantics cover v1 checkout creation, with no documented checkout exclusion. A server-generated key and exact serialized body are persisted before the POST and reused for recovery. Provider retention is 24 hours; local replay stops conservatively at 23 hours. |

Sources:

- [Create a Checkout Session](https://docs.paymongo.com/reference/create-a-checkout)
- [Checkout Session resource](https://docs.paymongo.com/reference/checkout-session-resource)
- [Hosted Checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout)
- [Webhook events/envelope](https://docs.paymongo.com/docs/developer-tools-webhooks-events)
- [Webhook signature setup](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management)
- [Webhook delivery/modes](https://docs.paymongo.com/docs/developer-tools-webhooks-key-concepts)
- [General idempotency guidance](https://docs.paymongo.com/docs/developer-tools-best-practices-1)
- [API-wide idempotent requests and retention](https://docs.paymongo.com/reference/idempotent-requests)
- [Webhook resource and retry exhaustion](https://docs.paymongo.com/reference/webhook-resource)

The generic best-practices signature snippet omits the detailed timestamp/header
format; the explicit signature setup contract is used. Hosted Checkout's newer
v2-oriented abbreviated example differs from the standard event envelope. This
implementation uses the documented standard envelope with an event ID; missing
IDs or incomplete resource evidence fail closed. No provider API or test-delivery
request was made during this task. A separately authorized PayMongo test-mode
integration check remains a release gate, not evidence claimed here.

## After: hardened trust path

Verified Firebase Customer token → durable server order → provider checkout →
persisted session/intent binding → verified raw webhook → stored order UID →
payment/event uniqueness and atomic entitlement transaction.

Both Customer endpoints call `verifyIdToken(token, true)`, require an existing
Developer account whose stored UID matches, reject forged body/query UID, and
disable caching. Email is not authority. Unsupported client plan or conflicting
amount/currency/quota/duration is rejected. The frontend sends only a bearer
token, not a UID/email purchase claim.

`PRO_PURCHASE` preserves PHP 149900 centavos, Pro, 5000 daily requests, and 30
calendar days from server fulfillment time. The prior `Date.setDate(+30)`
calculation is retained; this is not a calendar-month/renewal policy. Successful
fulfillment writes only existing account fields: `plan`, `apiRequestLimit`,
`subscription_status`, `lastSubscribedAt`, and `subscriptionExpiresAt`. The order
and receipt retain the same start/end evidence. Usage counters are not reset.

## Durable state and creation failures

| Collection/key | Authority |
|---|---|
| `payment_orders/{server UUID}` | Owner UID, expected purchase, mode, server creation time, state, provider bindings, fulfillment references/times. |
| `payment_checkout_locks/{UID}` | One current creating/pending/review order per account, across processes. |
| `payment_sessions/{mode}_{cs ID}` | Unique session-to-order/owner binding, committed together with pending order state. |
| `payment_events/{mode}_{evt ID}` | Event-level consumption evidence. |
| `transactions/paymongo_{mode}_{pay ID}` | Underlying-payment uniqueness and successful receipt; existing owner/Admin read-only history rules retained. |

Lifecycle here is `creating → pending → processed`, with `retryable` after an
uncertain provider result/storage outage and `review_required` for binding
conflicts. The order and account lock commit before the provider POST, outside
the Firestore transaction. A 60-second attempt lease excludes overlapping local
calls; stale workers cannot overwrite newer attempts. After failure, a subsequent
authenticated checkout request may recover the same order after five seconds;
after a crash/state-write outage, it may recover after the lease. No browser key
is accepted as authority. A different logical order receives a different key.

Each order persists `idempotencyKey`, the exact `providerRequestBody`, and a SHA-256
fingerprint of the high-entropy secret API key (never the secret itself). Retries
reuse those request bytes, even if redirect configuration changes, and refuse a
different API-key scope or mode. The documented 24-hour key expiry means reusing
an old key could create another object: recovery therefore stops at 23 hours
from server order creation, allowing a one-hour clock/network margin. Missing
legacy replay evidence, clock reversal, expired windows and key rotation require
operator review, never a new key for the uncertain order.

A lost successful provider response is recovered by replaying the persisted key:
the provider returns the original session. A binding outage is likewise retryable
without duplicate provider creation; no entitlement or redirect is allowed while
unbound. An orphan session ID/reason is recorded where available. If that write
also fails, the original creating order/lease remains and a structured error is
logged. A valid early webhook before binding is rejected for provider retry.
Bound pending attempts reuse their checkout URL without another provider call.
Active/unresolved Pro and unsupported tiers are not sold another term. No
renewal/extension engine is added.

Abandoned/expired pending checkouts may remain locked to the old URL; browser
cancellation is not proof of provider cancellation. Operator review must determine
the actual provider outcome before any future recovery/replacement is authorized.
This change supplies no cancellation/unlock API or migration; only same-attempt
idempotent recovery can establish the previously missing binding. Monitor
uncertain orders and delivery failures operationally;
do not release locks or grant manually based only on a browser report.

## Fulfillment, replay, and failure semantics

Missing, malformed, duplicate-field, invalid-hex, wrong-mode, stale/future, or
incorrect signatures reject before database access. Only the signed raw bytes are
parsed; `req.body` cannot substitute different payment data.

An accepted checkout event must include exactly one paid payment, valid stable
IDs, matching session/intent linkage and modes, paid/succeeded states, GCash,
expected amount/currency/line items, and no reported dispute/refund. A stored
pending order must have the same session/intent/mode and unchanged purchase policy.
Unknown/missing fields, cancelled/expired/invalid state, absent accounts, or
incomplete bindings never grant.

One Firestore transaction reads binding, order, event, payment, and target account
before writing. It records the payment/event, marks the order processed, and
grants entitlement together. Event-store/payment-store read failures, write
failures, and commit failures cannot leave partial entitlement. Conflicts retry
the callback against current state. Same-event retries, concurrent duplicates,
and different events for the same payment produce one entitlement write and do
not refresh timestamps. A different payment against a consumed checkout is
rejected. A duplicate is acknowledged only with consistent existing order and
payment evidence; missing/colliding evidence fails closed.

All new authority collections deny all browser access, including Admin clients.
Existing transaction history is read-only. User creation/update rules protect
subscription fields while preserving ordinary Free signup/profile updates and
all Phase 2A key/quota restrictions.

## Historical behavior and UI status

No historical migration or synthetic order creation. A legacy checkout event
without a hardened session/order is rejected, even if a random legacy transaction
claims success. Generic `payment.paid` is not treated as proof of a checkout and
returns an unbound-payment conflict, not a fulfilled acknowledgement. Unrelated
non-purchase events can be ignored without entitlement. Historical fulfillment
acknowledgement is deliberately not inferred from weak legacy records. Proven
duplicates of this hardened architecture are acknowledged without another grant.

Redirect polling waits for Firebase authentication and requests only an owned
order. Success requires backend `paymentConfirmed=true`, based on processed order
and matching current entitlement timestamps. Redirect-only, old-Pro, missing-order,
failed HTTP, and timeout states never claim a successful charge. Pending UI no
longer suggests running a script to force an upgrade. Pending order URLs remain
available for Check Again; no UI redesign is included.

The existing subscription-status expired-Pro-to-Free behavior is retained inside
a transaction solely to avoid its stale read overwriting a concurrent fulfillment.
The scheduled function, expiry enforcement elsewhere, and broader lifecycle are
unchanged. This is not completion of Phase 2B2.

## Test/live and release boundary

Runtime mode is derived from key prefix and must agree with production/live or
nonproduction/test expectations; webhook signature and event/session/payment/intent
modes must all agree with the order. Webhook secrets stay opaque. R0 validation
remains unchanged. Operators must register separate test/live webhook endpoints
and secrets, select `checkout_session.payment.paid`, and use separate nonproduction
Firebase data for testing. No endpoints, real identifiers, secrets, or production
cutover values are fabricated.

Backend, Customer caller/status UI, and rules must be released as one reviewed
unit. Existing legacy in-flight payments need an explicit operator review plan;
they cannot be silently converted into new grants. Retry exhaustion can disable
a provider endpoint; permanent conflicts need investigation, not endless blind
retries. There is no deployment authorization in this change.

## Validation evidence

Node `v22.20.0`, npm `10.9.3`. All unit/rules suites below have zero skipped tests.

| Command | Passed | Failed |
|---|---:|---:|
| `npm run test:adviser:phase2b1` | 122 | 0 |
| `npm run test:adviser:phase2b1:rules` | 36 | 0 |
| `npm run test:adviser:phase2a` | 62 | 0 |
| `npm run test:adviser:phase1` | 22 | 0 |
| `npm run test:adviser:phase2a:rules` | 49 | 0 |
| `npm run test:r0:config` | 9 | 0 |

The payment runner scrubs inherited configuration, imports only a fixed pure
module manifest, refuses Firebase/network/bootstrap imports, and disables global
network APIs. Its optimistic memory store stages all writes and injects read,
write, commit and concurrent-transaction failures. Rules tests use cached
Firestore emulator v1.22.0 on loopback and a `demo-` project with synthetic tokens,
not production Firebase. Memory transactions are not a claim of provider sandbox
or production integration testing.

Frontend validation used a temporary copy of tracked Dashboard files, excluding
environment files, and the current unchanged lockfile. `npm ci --offline
--ignore-scripts --no-audit --no-fund` installed 479 packages. No dependency or
lockfile edit was made. Build/TypeScript subprocesses used a scrubbed environment,
synthetic `demo-inventa-payment` Firebase settings and a loopback API, no credentials.

- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: PASS.
- `node node_modules/next/dist/bin/next build`: PASS; 17/17 static pages. Initial
  restricted attempt could not reach Google Fonts; the permitted retry compiled,
  type-checked and generated successfully without source changes.
- `node node_modules/eslint/bin/eslint.js src/components/subscription/SubscriptionModal.tsx src/app/dashboard/page.tsx`:
  6 errors / 10 warnings, all pre-existing in unchanged portions. The same two
  reviewed-base files report 7 errors / 10 warnings. The modified payment effect
  removes one previous error; no new lint diagnostics were introduced. Unrelated
  modal/profile/UI lint debt was not repaired.
- `git diff --check`: PASS. Untracked additions also checked for whitespace errors.

Final-review reruns: the first Phase 2A rules run hit an emulator setup timeout
while other heavy checks ran; the isolated rerun passed all 49 tests. TypeScript
initially included two temporary baseline-lint comparison copies; deleting only
those generated copies restored a passing check without repository source edits.

## Existing release blockers retained; Phase 2B2 remaining

Release blockers: actual backend/Customer/Admin providers and deployment targets
are unknown; Node 22 compatibility on those providers remains unverified; the
documented full-dashboard baseline is 52 lint errors / 27 warnings; real
production configuration/secrets remain external; production
`API_QUOTA_CUTOVER_AT` must be intentionally selected and coordinated. R0 release
documentation remains unchanged. PayMongo sandbox end-to-end validation and an
operator plan for uncertain/legacy payments are still required before release.

Phase 2B2 remains: Pro expiry enforcement, renewal, downgrade-to-Free lifecycle,
account deletion invalidation, and final entitlement/UI consistency. No new
duration ambiguity was found in the existing 30-day successful-purchase policy.
Free Trial, Day-4 notifications, item quotas, product submission, imports and
dashboard redesign are not started.

## Final pre-commit semantic extraction review

The prior idempotency-support conclusion is superseded by the API-wide reference
above. The current contract covers creation requests; v1 Checkout creates a
resource and its endpoint documentation gives no exclusion. Same-key requests
replay saved responses; parameter changes are rejected; validation/concurrency
failures before execution do not cache a result. This is documentation-based
verification, not a claim that a provider request was made during review.

| Deleted base block | Classification / disposition |
|---|---|
| Lazy DB access, route business logic, provider Basic auth and payload | MOVED TO SERVICE; same endpoint paths and v1 API; lazy Admin access remains in route adapters. |
| Fixed Pro policy and date helper | MOVED TO SERVICE; base checkout amount 149900/PHP, base webhook quota 5000/duration 30, base dashboard plans price 1499 and quota 5000. Existing monthly display text is retained; actual existing fulfillment arithmetic remains 30 calendar days. |
| Raw HMAC, timing-safe comparison, freshness/startup checks | MOVED TO SERVICE and hardened; server raw-body middleware unchanged; duplicate/malformed header parts reject, mode and configuration fail closed. |
| Body/query UID, email/metadata fallback provider GET, first-payment fallback | INTENTIONALLY REPLACED FOR SECURITY by verified Firebase UID, session/order lookup and explicit paid/intent checks. |
| Event query that continued on storage failure; separate user update and random receipt | INTENTIONALLY REPLACED FOR SECURITY by transactional fixed payment/event IDs, order and account writes. |
| Standalone subscription_reviews writes and full signature/provider logging | INTENTIONALLY REPLACED FOR SECURITY by durable order failure state/known orphan ID, structured error logs with verified session/payment/event IDs, and atomic successful transaction evidence; no unverified-signature database writes. No existing client consumes subscription_reviews. |
| Checkout success/redirect and subscription-status return values | MOVED TO SERVICE. Success fields retained with orderId added; redirect paths retained with order query added; status fields retained with paymentConfirmed added. |
| Provider error details and raw exception messages | INTENTIONALLY REPLACED FOR SECURITY by generic error/code responses; current Customer caller handles them. Authentication is now required by design. The active-Pro rejection is consolidated into this response contract, omitting its former expiresAt field; the current caller does not consume that field and authenticated status retains subscription dates. |
| Webhook success/duplicate/failed/ignored acknowledgement | MOVED TO SERVICE; received/processed/reason response fields retained, with additive duplicate/ignored flags. Generic payment.paid and unbound/missing-account grants now reject intentionally. |
| Transaction userEmail | Retained for display from the loaded account only; never ownership authority. |
| Status auto-downgrade | MOVED TO SERVICE, transaction protected; existing Pro → Free, quota → 50, subscription_status → inactive side effect is now restricted to the authenticated owner; expiration timestamp is preserved. Explicit Phase 2B2 lifecycle debt, not expanded. |
| Decorative comments, repeated guards/helpers, success console chatter | Consolidated with moved/replaced blocks; durable success evidence remains in transactions. No functional dead/unreachable removal claimed. |

Zero unexplained/unexpected removals. Server/CORS/limiter wiring, scheduled
functions and unrelated routes are unchanged. Price/name/currency/quota/duration
have no conflicting active purchase definition in the base; product expiry
warnings and UI timer constants are unrelated.

Failure-window review: A (never delivered) replays the same key; B (provider
created, response lost) returns cached session; C (binding write failure) remains
unbound/no-grant until the same attempt binds successfully; D (bound, browser
did not redirect) reuses the same URL. Recovery after retention/key-scope loss
requires operator review. No cancellation was invented.

The failure adapter stages writes, checks all versions for optimistic conflicts,
and rejects simulated read/write/final-commit failure before publishing any
write. Tests assert complete persisted-state equality on fulfillment failure,
not just response codes. The provider recovery model caches by secret-key scope
and idempotency key, verifies exact persisted request bytes, and injects response
loss after object creation. Delayed leases, concurrent replay, expiration and key
rotation are covered. Rules emulator remains a real loopback-only evaluation.
