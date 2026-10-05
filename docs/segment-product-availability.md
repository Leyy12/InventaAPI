# Segment-scoped product availability

Base: `c797e4c80f5856bb35c281c716060b568d2b8c66`. This is a new local candidate, not a reopening of the completed add-only Trial release.

## Before-state audit

- Product Catalog fetched all Firestore `products` documents with `getAllProducts()`. Its client visibility check was the weaker `is_active === true OR status === Active/active`.
- Restricted accounts used `activeCustomerSegment(appUser)`: canonical `businessSegment`. Paid accounts retained their existing All Categories / Hardware / Grocery / Pharmacy selector.
- Client-only segment/search filtering drove the grid and badge. The badge was `filteredProducts.length`, so search changed its meaning. No independent Product Available metric or catalog pagination metadata existed.
- No fixed 497 catalog total or base-plus-generated calculation was found in the active Catalog. The 500 references are entitlement limits, unrelated to catalog availability.
- The mounted public `/api/v1/products` list read the global collection without filtering or totals. The PostgreSQL `filtered-products.js` route is not mounted by the current server; it is not a suitable parallel path.
- Customer Add Product submits `product_requests` with canonical `content.segment` to Admin review. Approval creates `products/submission_<request-id>` through the existing catalog writer, retaining canonical `segment`, status Active, and `is_active=true`. Submitted/rejected requests are not catalog products.

## Contract and query

`GET /api/v1/products?businessSegment=Hardware&limit=200&offset=0` reuses the existing public discovery endpoint. `segment` is also supported. Requests canonicalize through the unchanged `normalizeSegment` contract. Invalid/conflicting segments or malformed pagination/search return HTTP 400 before reading the database.

Hardware is the canonical key for Hardware/general merchandise; labels are not a second identity system. The existing selector values remain unchanged. `All` explicitly preserves paid all-categories discovery; no segment also preserves the existing global discovery choice. This endpoint is not account entitlement authorization. Protected DaaS and API-key handlers continue to enforce account scope independently and are unchanged.

Selected-segment reads use `products.where('segment', '==', canonicalSegment)`. A single-field equality query requires no new composite index. It reads only that segment, applies the existing Phase 1 `projectProduct` publication predicate, deduplicates by actual Firestore document ID, and sorts by name/ID before slicing pages. System and approved generated records share this exact pipeline. Negative/malformed publication signals, missing name/category, or invalid segment fail closed under that existing predicate, even if an active flag is also present. No Admin review semantics changed.

- `availability.total`: all unique eligible products in the selected segment, before search, across all pages.
- `pagination.total`: matching segment-and-search results, across all pages.
- `pagination.returned`: just the current page length.
- `availability.segment`: canonical segment, or null for explicit/global All.
- `limit`: optional, 1–500; omitted retains the unpaginated discovery response. `offset`: nonnegative safe integer.
- Search preserves existing name/description/SKU matching; it cannot cross the segment boundary.

The response keeps the existing `products` array and adds metadata. No fixed catalog constant or separate generated-product addition is used. Stored `id` fields cannot override document identity. No global count is used for a selected segment.

Canonical writers already persist `segment`. Historical records with absent, unsupported, alias-only, or alternate-field-only segment storage are data-quality cases: they are not silently assigned to a selected segment. Selected-segment equality queries intentionally do not guess legacy classifications. No Production data was inspected or backfilled, so the prevalence of such records is unknown.

## Customer behavior

The Catalog now reads the existing products API, assembling every page of the selected segment in batches of 200. It no longer downloads the global Firestore collection for a restricted/specific segment. The current nonpaginated grid and client search are retained. This avoids a UI pagination redesign while proving full-segment totals independent of page length.

Product Available and the segment badge use the same verified response total. Search has a separate results label. Grid records must belong to that response. Paid All Categories remains available; paid pending selections survive category switches but never appear as current-segment cards.

The request controller uses generation checks and AbortController. Switching segment clears the prior grid/count immediately; a prior request cannot publish after switch, refresh, timeout, or unmount. A UID-keyed component isolates account changes. Pages with conflicting totals, duplicate IDs, wrong segment, missing metadata, or incomplete results fail visibly instead of accepting a global fallback. Deploying Customer against an old backend is intentionally not considered dynamic acceptance.

Reads use no-store. Focus/visibility return and a 60-second mounted refresh pick up approvals. Each cycle publishes grid/count together; unavailable reads show an error and retry after 60 seconds. A 15-second request deadline cancels uncertain reads. There is no indefinite cross-request catalog cache. This established segment-sized in-memory publication evaluation is not a new full-database scan; larger catalog scale/pagination optimization remains a future gate.

Select All displays the number of new items it actually adds after search, excluding selected/included items and respecting remaining Trial capacity. Included Trial cards/variants remain locked. Add Selected Products and Clear New Selections are preserved. Persisted Products Included and Remaining Slots still come from the authoritative Trial catalog, not discovery totals; 123 available can coexist with 45/50 included and 5 slots. Trial lifecycle, product/key caps, paid quotas, prices, and payment behavior are unchanged.

## Validation and release boundary

`npm run test:adviser:segment-catalog` runs a fixed module manifest with sockets/fetch/SDK imports blocked and synthetic fixtures only. It proves Hardware 120+3=123, Grocery 80+2=82, pending/rejected exclusion, unique IDs, exact equality queries, full pagination totals, scoped search, approval visibility, atomic Customer count/grid behavior, races, timeout/unmount cleanup, and Trial usage separation. Existing Free Trial/add-only, Business Segment, submission, Phase 1/2A and R5C suites remain regression gates.

Customer TypeScript, production build (process-only synthetic public configuration), backend syntax checks, lint baseline comparison and diff-check are required before the single local commit. Inherited Catalog lint findings are reported separately, not suppressed.

The requested Customer deployment is Preview-only from the exact clean committed tree. It is for static/visual review: no sign-in/session initialization, key generation, Trial catalog update, checkout, quota request, or Production data mutation is part of this task. Dynamic backend acceptance uses local synthetic handler-to-Customer tests until a safe API rollout is authorized. No API Preview against Production Firebase, no Production promotion, no Git push, no environment changes, no rules/index/Functions deployment.
