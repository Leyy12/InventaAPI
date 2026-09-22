# R6C — Explicit PayMongo test/live mode

Base: `5f0694c7b7f28ef1e1ee5f16222fbf35ba3ff746`.
Production baseline: `ac3908401fac5732192ac364600c7f397a3a6af6`.

## Scope and mode authority

Previously `paymentConfiguration` inferred mode from the key and required live
keys for `NODE_ENV=production`, test keys otherwise. The release validator also
selected the key prefix from its application `--mode` option. R6C removes both
couplings. Both payment routes now pass `PAYMONGO_MODE` explicitly; only exact
`test` or `live` values pass. Missing/invalid modes, mismatched keys, or missing
webhook signing secrets fail closed without printing credential values.

Current capstone configuration: `NODE_ENV=production`, `PAYMONGO_MODE=test`.
PayMongo Test Secret Key: required. PayMongo Test Webhook Secret: required from
the matching Test Mode endpoint. Real money: **NO**. Live mode:
**DEFERRED UNTIL COMMERCIAL LAUNCH**. No actual environment or credential values
were configured by R6C. Synthetic live fixtures only exercise future logic.

| Explicit mode | Key prefix | Signature field | Event/session/payment/intent |
|---|---|---|---|
| `test` | `sk_test_` | `te` | `livemode=false` |
| `live` | `sk_live_` | `li` | `livemode=true` |

The webhook secret remains opaque; no text-prefix guess determines its mode.
`NODE_ENV` retains production startup validation and HTTPS redirect validation,
but never chooses the payment key, signature field, or event mode. The release
validator's `--mode` still governs application runtime and origin restrictions.

## Preserved contract and security

Checkout Sessions/GCash: `POST /api/v1/checkout/create-gcash`.
Status: `GET /api/v1/checkout/subscription-status?orderId=<orderId>`.
Webhook: `POST /api/webhooks/paymongo`; fulfillment event:
`checkout_session.payment.paid`. Pro remains 149900 centavos, PHP, 30 calendar
days with unchanged entitlement/quota rules. No browser redirect grants access.

Raw body HMAC-SHA256 over timestamp + "." + raw body, five-minute freshness,
timing-safe comparison, event/payment uniqueness, durable order UID binding,
amount/currency/session/intent/order consistency and atomic replay-safe
fulfillment remain unchanged. Orders and event/session/payment records remain
mode-bound. Changing configuration cannot convert existing test orders to live
orders; existing cross-mode recovery failures continue to require review.

`DASHBOARD_URL` equals `NEXT_PUBLIC_APP_URL`. The former creates fixed success
`/dashboard?payment=success&order=<orderId>` and cancel `/?payment=cancelled`
redirects. Frontend code/routes, rules/indexes, auth, catalog, Storage, subscriptions,
quotas and daily key generation are outside this change.

## Validation and release limits

`npm run test:adviser:r6c` uses synthetic credentials, memory-only transactions,
an injected checkout transport and signed local events. Its child process does
not inherit secrets; an explicit module allowlist blocks network and Firebase SDK
imports. It covers both runtime/payment combinations, wrong/missing modes and
keys, opaque required secrets, signature selection, nested resource modes,
unchanged redirects/purchase terms, fulfillment/replay, rejected mismatches and
redacted validation errors. Existing isolated payment security/regression suites
remain required alongside this suite.

Local validation under Node 22.20.0: R6C **51 passed**; the full requested existing
regression matrix **1,543 passed**. Combined final runs: **1,594 passed, 0 failed,
0 skipped, 0 cancelled**. Three rules suites initially hit localhost request
timeouts when five Java emulators ran concurrently; each affected suite passed
on its unchanged sequential rerun. R3 and R2A rules passed on the first run.
Backend/changed-script syntax and `git diff --check` passed. Standalone backend
release validation passed with synthetic `NODE_ENV=production` and
`PAYMONGO_MODE=test` inputs; intentionally missing `API_QUOTA_CUTOVER_AT` produced
the existing clean-window warning. No actual deployment configuration was read.

No PayMongo request, production Firebase access, commit, push or deployment is
part of R6C. Real sandbox E2E and deployed-origin browser E2E remain open, along
with the existing release-provider, Node 22, packaging, catalog/report scale,
secrets/configuration, lint, coordinated quota cutover and rollout gates in the
release runbook. This is local implementation evidence, not deployment certification.
