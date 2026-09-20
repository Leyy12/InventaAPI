# R2A — Customer product submission, Admin review and image URL metadata

## Safety and scope

- Branch: `adviser/r2a-product-submission`.
- Reviewed base / unchanged HEAD: `77ceecc07b0c910861290086e9246ccfa3ab525d`.
- Fetched production `origin/master`: `ac3908401fac5732192ac364600c7f397a3a6af6`, unchanged at the safety gate.
- Only the Client repository was changed. Independent was not modified or used for credentials.
- No staging, commit, push, merge, deployment, production Firebase access or live PayMongo call.
- No dependency/lockfile, payment, subscription, importer, Storage or Free Trial changes.

## Verified before/after flows

The active Customer form is `dashboard/src/components/products/AddProductModal.tsx`,
mounted from the Product Catalog. It previously attempted `addDoc(products)` and
claimed immediate catalog publication, while the not-found guidance promised
Admin review. Customer publication was already correctly denied by rules.
There is no active `/dashboard/requests/new` link to repair. The existing catalog
button and not-found guidance remain; no search-prefill or navigation redesign.

Customer now sends content through `POST /api/v1/product-submissions` with a
Firebase bearer token and stable `Idempotency-Key`. The response says submitted
for review, never immediately added to the catalog. No client notification or
catalog write is performed. The existing mounted modal keeps its immutable
attempt across uncertain responses and close/reopen; synchronous busy guarding
prevents double clicks. A validation rejection permits correction. Reloading or
unmounting the page discards that in-memory attempt: cross-page recovery is not
implemented. API callers must reuse the same operation key and normalized content
when retrying an uncertain submission; a new key represents a new operation.

Admin now has a small `/submissions` screen and sidebar link. It lists submitted,
approved or rejected records with pagination (50/page), Customer UID, content,
variants, image URL, submission time and product reference. Approve/reject uses
the authenticated backend; no editable Customer content or mandatory rejection
reason was invented. The image is displayed as text, not fetched or previewed.

The active Admin Add/Edit components live inside `admin-panel/src/app/products/page.tsx`.
Their existing authorized Firestore writes remain, now constrained by authoritative
product image rules. Both expose optional image URL validation/persistence.
Edit seeds canonical `image_url`, falling back to legacy
`image`; saving adopts the canonical field and clears an existing legacy image
alias so explicit removal cannot resurrect it. Existing Admin Add name/brand
variant-append behavior is unchanged: a supplied image replaces the image, while
blank preserves it when appending. That legacy behavior is NOT used as identity
for submission approval. The unmounted legacy `AdminProductTable` upload component
was neither changed nor activated.

## Authoritative data and security

`product_requests/{server-generated-id}` stores version, token-derived `userId`,
normalized `content`, operation binding, state, server UTC ISO timestamps, and
initial null review metadata/product reference. Customers may provide only name,
brand, canonical segment, required category, description, SKU, variants and
`image_url`. Bounded text, at most 50 variants, finite nonnegative prices and a
strict field whitelist prevent authoritative-field injection. Phase 1 normalization
is reused. Description whitespace is normalized rather than treated as executable
content.

All handlers verify Firebase ID tokens with revocation checking. Transactions read
the current user record and Phase 2B2 `accountBlocked` barrier. No Pro restriction
is imposed. Approval also refuses a deleting/deleted submitter; rejection remains
available to an authorized Admin. Every Admin action checks the stored Admin role,
including inside the transaction. UID/role/email text supplied by a caller is not
authority. Responses are `Cache-Control: no-store`.

Two new server-only collections support the small workflow:

- `product_submission_operations`: SHA-256-scoped owner + operation key, payload
  digest and server submission ID, written atomically with creation. Exact retries
  return the same record, including its later final state. Changed payload returns
  409. This binding also prevents old client-writable request documents from being
  approved merely by claiming the new schema/version.
- `product_submission_identity`: hashed Phase 1 identity claims serialize approvals
  of different submissions with overlapping canonical identities. Claims are not
  removed automatically after a later catalog deletion: ambiguity fails closed
  and requires separately authorized operator resolution.

Legacy/malformed requests are never migrated automatically. Malformed content is
sanitized to a placeholder in Admin responses; no arbitrary legacy object reaches
the content renderer. Final review still requires valid server-only provenance.
The queue filters the new exact state labels; it is not a migration UI for older
state conventions.

## Atomic publication and compatibility

One transaction reads Admin authority, stored submission/provenance, owner barrier,
the deterministic destination, existing catalog identities and claim documents
before any writes. It then creates `products/submission_<submission-id>`, claims
its identities and updates the request to approved with reviewer/time/product ID.
Rejected requests receive only final review metadata, with no product.

- Same-decision retries are idempotent; the opposite final decision returns 409.
- Concurrent approvals yield one product. Concurrent approve/reject yields one
  serializable final outcome, never a rejected record paired with publication.
- Stored normalized content, not an approval request body, supplies the product.
- Products use the existing fields, `variants[]`, `status: Active`, `is_active: true`
  and canonical `image_url`; Grocery/Pharmacy/Hardware and DaaS projection remain.
- All existing current/legacy products, including inactive ones, are checked using
  Phase 1 SKU-first, variant-aware identity. Conflicts return 409 without mutation.
  Similar Brand + Name is not a destructive identity policy.
- No existing catalog product is overwritten by this review path.

Approval currently reads the catalog transactionally to check pre-existing legacy
identities without a data migration. Catalog-size/read-cost and transaction latency
must be measured in non-production final certification. Identity claims coordinate
R2A approvals, not independent legacy Admin/importer writers: this phase does not
claim to solve global importer concurrency or deduplication. The explicit classification
is **CASE B / FUTURE R3 DEPENDENCY**. R2A is NOT independently production-certified:
R3 must unify/validate shared product-writer uniqueness before this publication batch
is production-certified. Legacy Admin Add/importer can still race from stale independent
snapshots. Their algorithms are unchanged; the image write contract now applies to
all browser product writes.

## Image URL contract

`image_url` is the only new-write image field. Optional empty values are accepted;
provided values are trimmed, limited to 2048 characters, and must use explicit
HTTPS with a valid host and no credentials, whitespace, backslashes or controls.
HTTP (including localhost), javascript, data, file and ftp are rejected. No URL is
fetched or verified server-side. Customer validation is enforced by the backend
again at review; the two standalone frontends mirror the same validation contract,
with parity cases in the isolated suite. No global Next/Image restriction changed.

Customer image metadata is immutable after submission and reaches the catalog
only through approval. Admin Add/Edit browser writes are independently checked by
`validProductImage(request.resource.data)` in Firestore rules on BOTH create and
update. Frontend bypass cannot persist invalid schemes, userinfo, overlong values,
non-string values, whitespace/control tricks or obviously malformed authority.
**FRONTEND DUPLICATION IS UX-ONLY**: backend validation protects submissions and
approval, while rules protect direct browser writes. No shared package was introduced.

The Rules grammar intentionally accepts conservative ASCII host labels (punycode
for international names), optional valid numeric ports, and HTTPS paths/query/fragment.
It is not a byte-for-byte JavaScript URL parser: literal Unicode hosts, IPv6 literals,
and unsupported host spellings must use a compatible URL for direct Admin writes.
The backend URL parser may impose additional syntax checks. Neither path fetches,
resolves DNS or verifies remote content. These are metadata syntax constraints.

Absent/empty `image_url` is allowed. Unrelated Admin edits of products with no image
field, only a legacy `image` alias, or a valid canonical URL continue to work. An
invalid historical canonical URL cannot be preserved by an unrelated write: the
Admin must correct, clear or remove it. Deletion remains allowed. The constraint also
applies to browser importer writes, without changing importer matching/write algorithms.
Customers still cannot directly change catalog images.

## Three-blocker correction

1. **Authoritative image validation:** previously a valid Admin could bypass the
   browser and persist invalid image strings. Prior real-emulator reproduction
   accepted five invalid classes on create/update. Corrected real-emulator probes
   now deny them, with persisted-state checks proving rejected updates leave the
   original URL unchanged. Empty/absent, ordinary HTTPS and the 2048-character
   boundary are allowed on both create and update.
2. **Stale review conflict:** the original component reproduction confirmed that
   409 displayed an error without refetching and left Reject actionable. The small
   pure `reviewSubmission` helper now performs one mutation only; on 409 it locks
   the row, fetches its authoritative record and replaces the stale row. Approved
   or rejected rows have no stale action. A failed refetch keeps actions locked
   until a successful manual refresh, without claiming success. 401/403 do not
   retry; 5xx/network failures retain manual safe retry. Session-generation checks
   discard obsolete results. Confirmed mutation receipts update the row before
   list refresh, so a later list failure does not resurrect submitted actions.
3. **Suspension wording:** active ProductNotFound previously claimed misleading
   submissions could cause account suspension. It now retains only verification
   and rejection wording. Active Customer source search found no additional such
   claims; targeted wiring coverage prevents recurrence. No suspension was implemented.

The corrected component's real TypeScript handlers were also exercised with mocked
React hooks, authentication, HTTP and Firestore (no SDK/configuration imports or live
requests). Fourteen probes passed, including final Approved/Rejected refetches,
failed-refresh locking, 401/403/503 handling and unchanged Admin image semantics.
This is component-handler validation, not full browser E2E certification.

Only ten files were touched by this blocker correction: `firestore.rules`, the R2A
rules suite, Admin submissions page, new review helper and behavioral tests, active
ProductNotFound copy, R2A wiring tests, isolated runner/loader manifests, and this
document. Submission contract/service, provenance, publication transactions,
Admin product page, importer, payment/subscription code and dependencies were not changed.

The in-memory frontend idempotency key remains an **ACCEPTABLE LOCAL LIMITATION**:
reload can create another queue operation, but R2A canonical publication protection
still prevents equivalent R2A requests from double-publishing. No localStorage was added.

## Rules and deployment boundary

Customer/anonymous product writes remain denied; authorized Admin catalog permissions
remain. All browser writes to `product_requests` are now denied, including Admin
writes: only authenticated backend handlers can create/review. Own-request Customer
reads and Admin reads remain. Both new internal collections deny all client reads
and writes. Existing key/quota, payment and lifecycle/tombstone protections remain.

Backend, Customer form, Admin review, CORS `Idempotency-Key` allowance and Firestore
rules must be released as one reviewed coordinated batch. Do not enable the new
backend alongside the old client-writable request rules. No rollout, rule deployment,
index deployment or production migration was performed here.

## Validation evidence (Node 22.20.0)

| Command | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm run test:adviser:r2a` | 116 | 0 | 0 |
| `npm run test:adviser:r2a:rules` | 95 | 0 | 0 |
| `npm run test:adviser:phase2b2` | 98 | 0 | 0 |
| `npm run test:adviser:phase2b2:rules` | 35 | 0 | 0 |
| `npm run test:adviser:phase2b1` | 122 | 0 | 0 |
| `npm run test:adviser:phase2b1:rules` | 36 | 0 | 0 |
| `npm run test:adviser:phase2a` | 62 | 0 | 0 |
| `npm run test:adviser:phase1` | 22 | 0 | 0 |
| `npm run test:adviser:phase2a:rules` | 49 | 0 | 0 |
| `npm run test:r0:config` | 9 | 0 | 0 |
| Total | 644 | 0 | 0 |

Phase 2B2 count includes 66 main/polling tests plus 16 calendar cases in each of
UTC and America/New_York. R2A tests use a fixed module allowlist and scrubbed
environment, prohibit SDK/bootstrap/network imports and block global network APIs.
The memory adapter models atomic failures, optimistic retries and query conflicts.
Real rules tests run cached Firestore emulator v1.22.0 on loopback under a fixed
`demo-` project, using synthetic tokens/fixtures only; rules suites ran sequentially.

Frontend gates reused dependency-installed temporary copies without copying any
`.env` or credentials, and with synthetic Firebase configuration and API/Auth/
Firestore endpoints pinned to loopback. No repository dependency install, lockfile
rewrite or build output occurred. Commands were TypeScript `--noEmit --incremental
false`, `next build`, and ESLint on the changed-file manifest.

| Gate | Result |
|---|---|
| Customer TypeScript | Passed |
| Customer production build | Passed, 17/17 pages |
| Admin TypeScript | Passed |
| Admin production build | Passed, 11/11 pages including `/submissions` |
| Customer correction-file lint | 2 existing errors / 0 warnings in ProductNotFound; unchanged baseline; no new findings |
| Admin equivalent correction-file lint | 0 errors / 0 warnings in review page/helper; no new findings |
| New Admin review page and both image helpers | 0 lint errors / 0 warnings |
| `git diff --check` | Passed |

The initial sandboxed builds were blocked only by public Google Fonts downloads
(Inter/JetBrains Mono). Re-running the same synthetic-config builds with public-font
network access passed, without source changes to fonts or image policy. Existing
Admin FlatCompat lint still crashes with a circular-JSON error. The permitted
comparison used the same installed Next core-web-vitals and TypeScript flat configs
for baseline/current code in a temporary config; repository lint config is untouched.
These tests do not claim live-provider, production, full browser E2E or release
certification. Pre-existing whole-dashboard lint debt (52 errors / 27 warnings)
remains documented; no unrelated lint cleanup was performed.

## Changed-file manifest (22 files)

| Path | Purpose |
|---|---|
| `services/product-submission-contract.js` (new) | Bounded content whitelist, canonical segment normalization and image URL validation. |
| `services/product-submissions.js` (new) | Token/account authority, immutable creation, operation binding, Admin reads and atomic final decisions. |
| `routes/product-submissions.js` (new) | Firebase/Express wiring for Customer and Admin handlers. |
| `server.js` | Mount scoped endpoints and permit the idempotency header on restricted CORS. |
| `firestore.rules` | Backend-only request/operation/identity writes; preserve existing product boundary. |
| `dashboard/src/components/products/AddProductModal.tsx` | Authenticated review submission, safe retry and accurate wording/image URL input. |
| `dashboard/src/components/product-request/ProductNotFound.tsx` | Remove unsupported suspension promise, preserving verification/rejection guidance. |
| `dashboard/src/lib/product-image-url.ts` (new) | Customer image validator. |
| `admin-panel/src/app/products/page.tsx` | Image URL Add/Edit input, validation and persistence. |
| `admin-panel/src/app/submissions/page.tsx` (new) | Minimal paginated Admin review surface. |
| `admin-panel/src/components/layout/AdminSidebar.tsx` | Review navigation. |
| `admin-panel/src/lib/product-image-url.ts` (new) | Admin image validator with parity coverage. |
| `admin-panel/src/lib/submission-review.ts` (new) | One-mutation conflict refetch, failure classification and stale-row locking. |
| `package.json` | Two R2A test commands, no dependency changes. |
| `scripts/run-adviser-r2a-tests.mjs` (new) | Scrubbed fixed-manifest isolated runner. |
| `scripts/adviser-r2a-loader.mjs` (new) | Runtime module/network isolation. |
| `scripts/test-adviser-r2a-rules.mjs` (new) | Real loopback emulator access-control cases. |
| `tests/adviser/r2a/memory-firestore.mjs` (new) | Atomic/query-aware conflict and fault adapter. |
| `tests/adviser/r2a/submissions.test.mjs` (new) | Authentication/content/identity/state/concurrency/URL/isolation cases. |
| `tests/adviser/r2a/wiring.test.mjs` (new) | Frontend persistence wiring, CTA and route/security checks. |
| `tests/adviser/r2a/review-ui.test.mjs` (new) | Deterministic conflict/final-state/refetch/authentication/retry behavior. |
| `docs/adviser-r2a-product-submission.md` (new) | Review evidence and explicit limitations/release boundaries. |

## Deferred work and release inputs

R2B retains Firebase Storage/file uploads, hardened Storage rules, compression and
file validation, EXIF handling, replacement/deletion lifecycle, orphan cleanup and
usage/cost monitoring. No Storage implementation or permission preparation occurs here.

Remaining first-list work: R2B media/storage, importer, reports/dashboard,
landing/login, API policy/history ambiguities and final certification. Free Trial
(including 500-item quota and Day-4 notification) remains deferred.

Existing release inputs remain external: production provider/project/service IDs
and deployment commands for all apps, actual-provider Node 22 verification,
production config/secrets, coordinated `API_QUOTA_CUTOVER_AT`, production runtime
timezone and separately authorized payment sandbox certification. R2A resolves none
of these by inference and is not production deployment approval.

## Decision

R2A SAFE FOR LOCAL COMMIT

The three local-commit blockers are corrected. Implementation remains uncommitted
for ChatGPT review; this statement neither creates a commit nor authorizes deployment.
