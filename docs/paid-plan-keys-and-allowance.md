# Paid plans: API keys and monthly product allowance

Current rules for Pro and Pro Max (since Leyy12/InventaAPI#62, #63 and #64).
Older documents that mention "requests per month", daily request quotas or one
Pro Max key per segment describe earlier releases; this file wins.

## Keys

| Plan | Keys | Products per key | Segments on the key |
| --- | --- | --- | --- |
| Pro | 1 | 500 | the account's business segment |
| Pro Max | 1 | 1,500 | Grocery, Pharmacy and Hardware |

- Generate (`POST /api/v1/api-keys/generate`) creates the one key; a second is refused
  with `409 PRO_SINGLE_KEY` / `PRO_MAX_SINGLE_KEY`.
- Add products (`POST /api/v1/api-keys/add-products`) puts the selection into
  that key, creating it the first time ("Pro Max API key" for Pro Max). A Pro Max
  account that still has older per-segment keys adds into the oldest of them.
- Too many products: `400 KEY_PRODUCT_LIMIT`. Limits live in
  `functions/entitlement-limits.mjs` (`PRO_KEY_PRODUCT_LIMIT`,
  `PRO_MAX_KEY_PRODUCT_LIMIT`).
- The Pro Max key has no `segment` field; Pro keys keep theirs.

## Monthly allowance

- 15,000 per UTC calendar month (`PAID_MONTHLY_PRODUCT_LIMIT`), reset on the 1st.
- **Unit: product variants delivered.** Every variant a `GET /daas/v1/catalog`
  response sends counts as one; a product without variants counts as one.
- **Buckets** (`account_paid_monthly_usage/<uid>_<YYYY-MM>_<bucket>`):
  Pro uses `account`; Pro Max uses `Grocery`, `Pharmacy` and `Hardware`, and each
  variant is charged to its own product's segment (`general` only for a product
  with no segment).
- **Flow**:
  1. `consumeAccountQuota` (admission) refuses with 429 only when every bucket the
     plan has is used up. It no longer counts anything; it returns `productCharge`.
  2. The catalog route formats the page, totals variants per bucket and calls
     `chargeMonthlyBuckets`, which grants at most what each bucket has left in one
     transaction. Concurrent calls can never take a bucket past 15,000.
  3. Products are sent in page order within each bucket's grant; the last product
     of a bucket may carry only some variants, and products whose bucket is empty
     are left out. Nothing granted at all: 429.
- Not charged: empty keys, searches with no results, a repeat of the same request
  within 2 seconds (repeat guard), `/daas/v1/health`. `/daas/v1/sales` and
  `/sales-feed` (switched off) deliver no products.
- Free Trial: one API key (`TRIAL_MAX_ACTIVE_KEYS = 1`) with up to 50 products, no monthly allowance.

## Catalog request and response

`GET /daas/v1/catalog?segment=Grocery|Pharmacy|Hardware&q=&page=&perPage=`

`segment` (case-insensitive) returns only that segment's products, so an
integration with one Pro Max key can fetch, and be charged for, one segment at
a time. Unknown values match nothing.

`meta` adds:

- `quota`: Pro `{ used, limit, remaining, unit: "products", scope: "account" }`;
  Pro Max `{ limit, unit, scope: "segment", buckets: [{ bucket, used, remaining }] }`.
- `variantsSent`: variants this response used.
- `quotaLimited`, `quotaMessage`: present when the allowance cut the response short.
- `requestsUsed`: kept for older clients (Pro: same as `quota.used`).

## Where it shows

- Customer Overview: one card for Pro, three (one per segment) for Pro Max.
- API Keys page and Documentation page describe the same rules.

## Tests

- `tests/adviser/product-allowance/catalog.test.mjs`: real route, variants, partial
  last product, 429, empty search, Pro Max segments and `?segment=`.
- `tests/adviser/plan-request-limits.test.mjs`, `tests/adviser/paid-key-products.test.mjs`.
- `tests/adviser/product-allowance/deliver.mjs`: helper that models one catalog
  call (admission + charge) for older quota tests.
