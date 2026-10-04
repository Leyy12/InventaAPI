# Pro Max and customer data features — local implementation contract

This document describes candidate code only. It is not deployed and the
replacement client PayMongo account has not been accepted or called.

## Reconciliation with current production

The candidate ports only the original feature commit `5b93ed36` onto production
`6728bbe3`. The old feature `8ec468dc` is retained in the local backup ref
`backup/pro-max-pre-reconcile-8ec468d`; its superseded hotfix was not replayed.
Pro/Pro Max purchase and renewal controls live in Plan & Billing. Settings keeps
the production link to that page. Shared desktop/mobile navigation adds
Recommendations without restoring the permanent Trial item. API Keys stays
management-only; Products retains ordinary generation, and atomic replacement
keeps the released one-time-secret, active-count and daily-marker behavior.
The released Admin Sign Out color is unchanged.

The inherited onboarding source assertion referenced generation-only state
removed by the production management-only hotfix. It now checks the locked
notice and Products-side server-error presentation; the behavioral Free
`TRIAL_REQUIRED` denial tests remain intact. Pro Max is additionally covered
by the existing atomic replacement test matrix.

| Effective state | Account request allowance | Business segments | Sales feed |
| --- | --- | --- | --- |
| Free before session initialization | No protected allowance | Authoritative registered segment | No |
| Active once-only 7-day Free Trial | No request quota; 0–50 linked products, one active key | Authoritative registered segment | No |
| Upgrade Required | Protected DaaS access denied | Registered segment retained | No |
| Active Pro | 500 per UTC day | Grocery, Pharmacy, Hardware | Yes |
| Active Pro Max | Unlimited account quota; usage still recorded | Grocery, Pharmacy, Hardware | Yes |

Pro costs ₱1,499 (`149900` PHP minor units); Pro Max costs ₱4,999
(`499900` PHP minor units). Both purchases last 30 UTC calendar days. The
browser submits only `plan: pro` or `plan: pro_max`; the server purchase catalog
fixes amount, currency, duration, and quota. Pro Max becomes effective after
verified order-bound webhook fulfillment. Pro → Pro Max preserves the previous
valid paid expiry by extending 30 days from the later of that expiry and the
verified fulfillment instant. No proration, refund, or Pro Max → Pro downgrade
is implemented. Active Pro Max can renew. Expired Pro Max loses unlimited
access; a previously used Trial remains used and yields Upgrade Required.
Payment redirects are not proof of entitlement. Provider mode, HMAC signature,
order, session, payment intent, amount, currency, and idempotency remain bound
to the saved server order. Existing Enterprise/Unlimited compatibility is not
migrated or reinterpreted as Pro Max.

“Unlimited” removes only the account quota rejection. API-key authentication,
account/plan checks, product/segment authorization, 60/min IP limiting,
abuse controls, request counters, and diagnostics remain active.

## Customer-owned completed sales

`POST /daas/v1/sales` accepts one completed sale with a stable
`externalTransactionId`, explicitly zoned `occurredAt`, `currency: PHP`, and
1–50 `{ productId, quantity, unitPrice }` items. Prices have at most two PHP
decimal places. Quantity is an integer from 1–1000. The server computes PHP
minor-unit totals. Unknown/unauthorized catalog products, extra fields,
client-provided totals, and consumer PII are rejected. Authentication and the
normal quota middleware run before ingestion. Records live in server-owned
`customer_sales` with deterministic account/reference IDs and transactional
same-payload acknowledgement. A conflicting reference returns 409.
Firestore browser reads and writes to this collection are denied.

`GET /daas/v1/sales-feed` and Firebase-authenticated
`GET /api/v1/customer/insights/sales-feed` share one aggregation service. The
DaaS route is paid-only and consumes account quota; the Customer UI route is
account-UID-authenticated and does not require or reveal an API key. Both query
the same account only. `from` and `to` are inclusive UTC dates, defaulting to
the last 30 days and limited to 90 days. The result includes real PHP summary,
UTC daily buckets, top products, and an explicit empty state. A >5,000-event
range fails closed; there are no mock fallback figures. The new composite
`customer_sales(userId ASC, occurredAt ASC, __name__ ASC)` index must be
reviewed and deployed before application cutover, with the existing index
reconciliation procedure; this local task does not deploy it.

## Product recommendations

`GET /daas/v1/recommendations` uses the key's current linked-product and
segment authorization and consumes the normal protected-request allowance.
The Customer page uses Firebase-authenticated
`GET /api/v1/customer/insights/recommendations`, scoped to the account's
current visible catalog and segment. The deterministic algorithm ranks
authorized products by real units sold in the recent 30 days and notes a
recent-versus-previous 30-day increase only when both periods have evidence.
Products without relevant sales use a `basis: catalog` availability reason.
Empty catalogs produce empty recommendations. It is not AI, a market forecast,
or a claim about competitors or industry-wide demand.

Sales and usage history is not reset by Trial, plan upgrade, renewal, or
expiry. The replacement PayMongo account, real checkout/webhook acceptance,
Firebase index/rule deployment, and Production cutover remain separate gates.

## Reconciliation validation

The accepted repository scripts and hotfix-focused suites passed 1,860 tests
with zero failures, skips, or cancellations. Customer and Admin TypeScript
and production builds passed with process-only synthetic public configuration;
the affected Functions build and lifecycle syntax check passed. Changed
Customer files add no lint findings against the current Production baseline
(14 inherited errors and 6 warnings remain). Admin source is unchanged;
its existing ESLint configuration fails during configuration loading with a
circular-JSON error, before file analysis. No dependency or lockfile changed.
