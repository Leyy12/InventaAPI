# Paid plans: API keys, key size and requests

Current rules for Free Trial, Pro and Pro Max. Older documents that mention a
daily request quota, a product/variant allowance or one Pro Max key per segment
describe earlier releases; this file wins.

| Plan | Keys | Products per key | Monthly allowance |
| --- | --- | --- | --- |
| Free Trial (7 days) | 1 | 50 | none (calls do not use anything up) |
| Pro | 1 | 7,500 | unlimited API requests |
| Pro Max | 1 (all three segments) | 15,000 | unlimited API requests |

Constants live in `functions/entitlement-limits.mjs`: `TRIAL_MAX_ACTIVE_KEYS`,
`TRIAL_MAX_PRODUCTS`, `PRO_KEY_PRODUCT_LIMIT`, `PRO_MAX_KEY_PRODUCT_LIMIT`,
and `monthlyRequestLimit(plan)` (returns `null`: no monthly limit).

## Keys

- Generate (`POST /api/v1/api-keys/generate`) creates the one key. A second is
  refused: `409 TRIAL_KEY_LIMIT`, `PRO_SINGLE_KEY` or `PRO_MAX_SINGLE_KEY`.
- Add products (`POST /api/v1/api-keys/add-products`, Pro and Pro Max) puts the
  selection into that key and creates it the first time ("Pro Max API key" for
  Pro Max). Pro accepts products from its business segment; Pro Max from all three.
- Too many products: `400 KEY_PRODUCT_LIMIT` (also when editing a key's products
  with `PATCH /api/v1/api-keys/:id/products`).
- A key can be used in any number of projects; nothing limits where it is used.

## Requests

- Paid plans have **no monthly request limit**. Every `GET /daas/v1/catalog` call
  that passes authentication is still recorded as one request in
  `account_paid_monthly_usage/<uid>_<YYYY-MM>_account` (request history and admin
  views); `consumeAccountQuota` never refuses a paid call for volume.
- The per-IP rate limit protects the service: 60 DaaS requests per minute per IP
  (`server.js`, `daasLimits`), answered with `429` and `Retry-After`.
- Not recorded: a repeat of the same request within 2 seconds (repeat guard) and
  `/daas/v1/health`.

## Catalog request and response

`GET /daas/v1/catalog?segment=Grocery|Pharmacy|Hardware&q=&page=&perPage=`

`segment` (case-insensitive) returns only that segment's products; useful with
the Pro Max key, which holds all three. Unknown values match nothing.

`meta.quota` for Pro / Pro Max:
`{ used, limit: null, remaining: null, unlimited: true, resetsAt, period: "monthly", unit: "requests", scope: "account" }`.
`meta.requestsUsed` repeats `quota.used` for older clients.

## Dashboard

- Overview shows the products on the key: Pro one card (total / 7,500); Pro Max
  one card each for Grocery, Pharmacy and Hardware. There is no requests card.
- The API key list response carries this as `monthlyUsage` (`buckets[0]` is the
  account's requests; `products` is `{ total, limit, bySegment? }`).

## Tests

- `tests/adviser/plan-request-limits.test.mjs`, `tests/adviser/paid-key-products.test.mjs`
- `tests/adviser/product-allowance/catalog.test.mjs` (real route: requests are
  recorded but never refused for volume, `?segment=`)
