# Production transition safeguards

This correction is local only. It does not authorize a deployment, payment,
webhook replay, settings write, or historical reconciliation.

## Effective database and payment mode

Checkout and fulfillment inspect `projectId` on the Firestore instance actually
used for transactions. Only `inventaapi-db` and `inventaapi-staging` are supported.
Unresolved identities, configuration conflicts, missing modes and key/mode
conflicts fail closed. Production requires LIVE; staging permits matching TEST.
The exported completion helper enforces the same database/mode boundary.
Production completion also requires the exact payment object privately marked
by the signature-verifying handler, including orders with structured terms.

## Historical offers and outstanding evidence

First-time LIVE legacy Pro fulfillment requires a fresh valid signed paid webhook
with exact saved session/intent/payment/order bindings. The original server-owned
serialized checkout request must contain its reference, plan metadata, one shown
line item and the exact 500/day or 5,000/day offer. The signed provider session
must independently match reference, plan, line item and payment methods. Neither
current defaults nor profile fields establish the offer. Missing/contradictory
proof produces `REQUEST_CONTRACT_EVIDENCE_UNAVAILABLE` and a safe diagnostic.

Only that verified paid operation may capture derived legacy terms atomically
with its ordinary receipt, order finalization, entitlement and private promise.
The derived policy version explicitly identifies legacy signed evidence; it does
not pretend to be an original structured snapshot. Duplicate delivery preserves
existing idempotency. No audit/reconciliation script writes historical contracts.

The two already-paid historical Pro cases remain blocked: local paid receipts,
processed events and checkout text do not supply the original signed provider
payload required by this compatibility path. They need separately authorized,
ownership/period/offer-bound provider corroboration and reconciliation. A webhook
replay is not an authorized reconciliation mechanism. Existing promises and
subscription periods must be preserved; no blanket 500/day fallback is allowed.

All seven pending provider outcomes remain UNKNOWN. Four saved offers are
500/day and three are 5,000/day. Synthetic proof covers these shapes, not their
actual payment state or the completeness of real provider webhook fields.
Missing provider fields require reconciliation rather than relaxed verification.
An overlapping unresolved prior paid contract can still block a new fulfillment.

## Initiation-only hold

`PAYMENT_CHECKOUT_INITIATION_HOLD` accepts only absent, `false`, or `true`.
It defaults OFF. True rejects authenticated checkout initiation before order
creation, replacement/expiry, provider calls, or contract writes. Subscription
status and webhook fulfillment do not consult it. Authentication, Admin recovery,
existing subscriptions and historical evidence remain available.

No existing independent checkout-only control was found. Activation is a
separately authorized release/configuration operation; this task activates none.
Before cutover, cover every serving initiation origin, drain old in-flight
initiations, then recheck old and newly discovered pending orders and provider
states. An alias switch alone does not drain old invocations. Never use global
Maintenance Mode to implement this hold or suppress genuine paid fulfillment.

## Standard and demonstration pricing

Standard catalog prices remain Pro PHP 1,499 and Pro Max PHP 4,999 per 30-day
term. The demonstration override defaults OFF. Existing LIVE PHP 5 receipts and
their saved list-price/offer evidence remain valid with the override OFF.

The prior read-only Production configuration observation has
`PAYMONGO_GLOBAL_TEST_BILLING=true` and amount `500` centavos. That makes new
checkouts use demonstration pricing, including Pro Max. This remains a standard
pricing release blocker until the owner separately authorizes its disposition.
Do not change historical amounts or silently alter the Production flags.

## Prepared Maintenance OFF procedure (not executed)

1. Obtain explicit owner authorization for OFF and a restricted operator change
   reference. Expected previous effective value is `maintenanceMode=true`.
2. Before exposing the enforcing candidate to business traffic, use its isolated
   authorized Admin settings API. Independently confirm the target is Production
   and authenticate the active Admin with revocation checking. No direct browser
   Firestore write or whole-settings overwrite is appropriate.
3. `GET /api/v1/admin/system/settings` and capture its opaque version, expected true value and unchanged
   registration/request-limit settings. If the value is not true, stop and review.
4. Submit exactly `{version: <read version>, changes: {maintenanceMode: false}}`
   using `PATCH /api/v1/admin/system/settings`. Its transaction rechecks Admin
   eligibility and update-time version. A 409 requires a new read and review,
   never a blind retry. Only this field and existing actor/time metadata change.
5. Independently read settings again: verify false and unchanged registration,
   request limits and all pricing configuration. Verify the `System Settings
   Updated` audit identifies the verified actor and true-to-false transition;
   retain the operator approval reference with the release evidence.
6. Audit append is best-effort. If it fails, do not repeat a successful settings
   write to manufacture an audit. Stop release activation and obtain separately
   approved audit recovery with the original change provenance.
7. Verify Admin recovery and PayMongo fulfillment remain accessible before
   promoting enforcement. A rollback must not silently restore true and cause
   an unapproved maintenance outage.

## Review and staging before any Production authorization

Independently review the database boundary, WeakMap-owned signed legacy proof,
concurrency/idempotency and hold defaults. Regress the new candidate in staging:
TEST operation, invalid modes/projects/signatures, LIVE synthetic proof without
real charges, both historical offer sizes, ambiguous proof rejection, duplicate
delivery, request floors/UTC usage, settings concurrency/audits and recovery
routes. No UI, Firebase rules or subscription policy changes are part of this
correction. Coordinate the previously required corrected expiration Function
before any eventual enforcing API release.

Production still requires provider status verification, historical Pro
reconciliation authorization, a pricing decision, Maintenance OFF/ON approval,
approved hold/drain controls and fresh release-time checks. Preserve all terms,
receipts and counters. After new promises are captured, verify compatibility
before rolling back an older backend/normalizer; prefer a reviewed forward fix
where rollback would ignore protected promises.
