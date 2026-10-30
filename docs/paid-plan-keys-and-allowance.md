# Paid plans: API keys, key size and monthly product allowance

Current rules for Free Trial, Pro and Pro Max. Older documents that mention a
daily request quota, monthly request counting or one Pro Max key per segment
describe earlier releases; this file wins.

| Plan | Keys | Products per key (each variant counts) | Monthly allowance |
| --- | --- | --- | --- |
| Free Trial (7 days) | 1 | 50 | none (calls do not use anything up) |
| Pro | 1 | 7,500 | 15,000 products (variants delivered) |
| Pro Max | 1 (all three segments) | 15,000 | 20,000 products, shared by the three segments |

Constants live in `functions/entitlement-limits.mjs`: `TRIAL_MAX_ACTIVE_KEYS`,
`TRIAL_MAX_PRODUCTS`, `PRO_KEY_PRODUCT_LIMIT`, `PRO_MAX_KEY_PRODUCT_LIMIT`,
`PRO_MONTHLY_PRODUCT_LIMIT`, `PRO_MAX_MONTHLY_PRODUCT_LIMIT` and
`monthlyProductLimit(plan)` (older `*_REQUEST_LIMIT` names are aliases).

## Keys

- Generate (`POST /api/v1/api-keys/generate`) creates the one key. A second is
  refused: `409 TRIAL_KEY_LIMIT`, `PRO_SINGLE_KEY` or `PRO_MAX_SINGLE_KEY`.
- Add products (`POST /api/v1/api-keys/add-products`, Pro and Pro Max) puts the
  selection into that key and creates it the first time ("Pro Max API key" for
  Pro Max). Pro accepts products from its business segment; Pro Max from all three.
- Too many products: `400 KEY_PRODUCT_LIMIT`, counting each variant as one (a
  partial selection counts its selected variants) (also when editing a key's products
  with `PATCH /api/v1/api-keys/:id/products`).
- A key can be used in any number of projects; nothing limits where it is used.

## Monthly product allowance

- Unit: **product variants delivered**. Every variant a `GET /daas/v1/catalog`
  response sends counts as one; a product without variants counts as one.
- One limited allowance per account:
  `account_paid_monthly_usage/<uid>_<YYYY-MM>_account`. Pro Max also keeps a
  display-only counter per segment (`..._Grocery`, `..._Pharmacy`, `..._Hardware`).
- Flow:
  1. `consumeAccountQuota` (admission) refuses with 429 once the account total
     reaches the limit; it counts nothing and returns `productCharge`.
  2. The catalog route formats the page and calls `chargeMonthlyProducts` with
     each product's segment and variant count. In one transaction it grants at
     most what is left, decides how many variants of each product may be sent
     (page order; the last may be partial), adds the total to the account and each
     segment's share to its counter. Concurrent calls cannot exceed the limit.
  3. Nothing granted: 429.
- Not counted: empty keys, searches with no results, a repeat of the same request
  within 2 seconds (repeat guard), `/daas/v1/health`. The per-IP limit of 60 DaaS
  requests per minute still applies.

## Apps: once per app per month

- Every DaaS catalog call is tagged with its source by `services/api-consumers.js`
  (no registration): the website domain from `Origin` (else `Referer`), otherwise
  the caller's IP grouped by range (IPv4 /24, IPv6 /48). The IP comes from
  `trustedRateLimitIp`, so it cannot be set by the caller.
- `api_key_consumers/<keyId>_<hash>` records each app: first/last seen, request
  count, last IP/domain, `blocked`. A blocked app gets `403 CONSUMER_BLOCKED`.
  Owner endpoints: `GET /api/v1/api-keys/consumers`,
  `PATCH /api/v1/api-keys/consumers/:consumerId` with `{ "blocked": true|false }`.
- `account_paid_monthly_delivered/<uid>_<YYYY-MM>_<app id>` keeps short hashes of
  the variants that app already received this month. `chargeMonthlyProducts`
  sends those free and counts only new ones, in the same transaction as the
  allowance.
- Limits: a server whose IP leaves its /24 range shows up as a new app (its
  products count once more); a server can fake `Origin`, but only to reuse an app
  label — its real IP is still recorded in history.
- History rows carry `consumerLabel`, `consumerKind`, `consumerDomain`,
  `consumerIp`, `newConsumer`; the dashboard shows a "Source (domain / IP)" column
  and a "New app" badge, and an "Apps using your API key" list with Block.

## Catalog request and response

`GET /daas/v1/catalog?segment=Grocery|Pharmacy|Hardware&q=&page=&perPage=`

`segment` (case-insensitive) returns only that segment's products; useful with
the Pro Max key, which holds all three. Unknown values match nothing.

`meta.quota` for Pro / Pro Max:
`{ used, limit, remaining, resetsAt, period: "monthly", unit: "products", scope: "account" }`.
`meta.variantsSent` is what this response sent and `meta.variantsCounted` the new variants it counted; `meta.app` is the detected source; Pro Max adds `meta.segmentUsage`
(`[{ segment, used }]`). `meta.quotaLimited` / `quotaMessage` appear when the
response was cut short. `meta.requestsUsed` repeats `quota.used` for older clients.

## Dashboard

- Overview: Pro shows one card (products used / 15,000, remaining). Pro Max shows
  four: the shared total (used / 20,000, remaining) and Grocery, Pharmacy and
  Hardware with each segment's share and the products of that segment on the key.
- The API key list response carries this as `monthlyUsage`: `buckets[0]` is the
  account total, `segments` (Pro Max) the per-segment shares, and `products` is
  `{ total, limit, bySegment? }`.

## Tests

- `tests/adviser/plan-request-limits.test.mjs`, `tests/adviser/paid-key-products.test.mjs`
- `tests/adviser/product-allowance/catalog.test.mjs` (real route: variants counted,
  partial last product, Pro and Pro Max limits, per-segment shares, `?segment=`)

## Request history: delete

`POST /api/v1/api-keys/history/delete` with `{ "ids": [...] }` (1–200 of the
caller's own rows) or `{ "all": true }`. Rows are hidden from the customer's view
only (`api_history_hidden/<uid>`: ids, plus `clearedBefore` for "clear all"); the
`api_telemetry` records stay for admin traffic statistics. History rows now carry
their `id` so they can be selected.
