# R3 — Catalog write integrity and safe importer

## Pre-change inventory (completed before implementation)

Base: `77b84a01088318b074f58e06c7d2b571c1eb5f81`; origin/master:
`ac3908401fac5732192ac364600c7f397a3a6af6`. Reference repository untouched.

| Writer | Authority / mechanism before R3 | Identity / validation / concurrency before R3 | Reachability |
|---|---|---|---|
| Admin Add, products page | Browser Admin Firestore addDoc/updateDoc | Name + brand append; local checks, image validator; stale array snapshot, no reservation | Mounted |
| Admin Edit | Browser Admin updateDoc | Rebuilds variant whitelist; price fallback zero; no identity reservation/version check | Mounted |
| Admin archive/restore/delete | Browser Admin updateDoc/deleteDoc | Status toggles/hard delete; no identity-index coordination | Mounted |
| CSV ImportCsvModal | Browser Admin addDoc/updateDoc per row | SKU then name+segment/name-only; stale preview; replace payload/variants | Mounted from products page |
| Submission approval | Verified Admin backend transaction | Phase 1 identity; catalog scan + protected product_submission_identity; atomic decision | Mounted backend route and Admin review |
| Customer addProduct helper | Browser addDoc | No authoritative identity | Export unused; direct Customer writes already denied |
| AdminProductTable | Browser addDoc/deleteDoc, Storage upload | Legacy local checks | No imports/mounts; dormant |
| Customer products page.tsx.backup | Browser legacy writes/uploads | Old request flow | Backup extension, unimported |
| routes/products.js | GET only; mutations 410 | No live write path | Mounted read-only |
| Functions | Subscription lifecycle only | No catalog mutations | No product writer |
| database/seed.js and scripts | Privileged standalone maintenance scripts | Direct SDK writes without shared identity | No imports from app/server/Functions or npm runtime scripts; operator-only legacy tools |

Maintenance writers found include clean-variants, cleanup-stale-root-fields,
create-expiring-product, migrate-bucket2, migrate-variants, seed-real-ph-products-batch1/2,
fix-555-sardines, fix-luckyme-typo, fix-missing-active, batch2/source-url correction
scripts and deletion test scripts. They are not part of normal operation and must
not run against a unified live catalog; privileged maintenance requires write-freeze,
audit and reservation reconciliation. Firebase Admin credentials can bypass rules;
R3 does not claim IAM can be enforced by Firestore client rules.

## Importer before R3

PapaParse `header:true`, skipEmptyLines, trimmed headers; alias lookup by lowercased
header with spaces replaced by underscores. Recognized reordered columns already
work: YES. Unknown-header manual mapping: NO. Unknown headers pass through as keys;
duplicate aliases silently take first value. Parser errors were not checked.
Only product name was enforced (also checked against the first row).

Segment: CSV, then filename inference, then local default, then Pharmacy; unknown
segment also becomes Pharmacy: YES. Price strips non-digit/dot characters and uses
parseFloat; negative signs are lost, missing/NaN become zero: YES. Zero was already
accepted. SKU optional; match root/variant SKU, then name+segment, then name only.
Brand was not part of that fallback identity.

Each CSV row becomes one variant containing flavor/size/price/SKU/expiry. Dosage,
form and several size aliases all mapped to size. Preview labels were new/update/
appended/rejected. Update and appended both update the entire payload with a
one-element variants array: existing siblings can be replaced: YES. Exact duplicates
were skipped. No within-file canonical deduplication, transaction or stable operation
ID. Sequential writes can partially succeed; one catch stops the loop and reports
generic failure. This is not a safe established merge policy, so R3 uses explicit
exact-match skip, with edits handled separately.

## After R3: authoritative writer and authority

| Active writer | Authority / mechanism after R3 | Identity, validation and concurrency |
|---|---|---|
| Admin Add | Verified, revocation-checked Firebase ID token; authoritative users/{uid} Admin role; backend POST /api/v1/admin/catalog | Shared prepareCatalogWrite transaction |
| Admin Edit | Same authority; backend PATCH /api/v1/admin/catalog/:id; expectedRevision required | Shared writer; atomic new claims/old retirement; stale edits conflict |
| Admin archive/inactive/restore/delete | Same authority; backend actions (Inactive via Edit) | Shared writer; archive/inactive keep claims; hard delete leaves tombstones |
| CSV importer | Same authority; server-owned preview then explicit selected-row commit | Shared writer per row; atomic receipt + product + claims |
| R2A submission approval | Existing provenance, Admin authority, submitter account/deletion barriers plus shared writer | One transaction for catalog mutation and final decision |
| Other browser/legacy mutation helpers | Not active/mounted; even an Admin token is denied by deployed R3 rules | No alternate client write path |
| Disabled product route / Functions | Read-only route / no catalog writer | Unchanged |
| Privileged maintenance/seed tools | Outside normal operation; forbidden on a live R3 catalog | Operator must freeze all writers and reconcile identities; no IAM bypass claim |

The authoritative service is `services/catalog-writer.js`. No caller-supplied userId,
email, role, query override, product ID for Add, identity key or reservation is trusted.
Disabled/deleting/deleted accounts fail authorization. Role reads participate in the
transaction, including every imported row, so a concurrent role revocation retries
and denies the write. Protected preview/receipt/control/index collections cannot be
read or written with a browser token. Product reads retain their prior permissions.

### Canonical identity and concurrency

`services/product-contract.js` is unchanged. All writers, importer classification
and the offline audit call its `productIdentityKeys`: normalized SKU-first, with the
reviewed variant-aware fallback when no usable SKU exists. Brand + Product Name is
NOT an authoritative identity. It uses the same Phase 1 comparison normalization as
a secondary possible-duplicate group only; distinct SKUs/variants are never merged.
Admin Add shows a warning and the backend returns matching product IDs; import
requires explicit acknowledgement before selected possible duplicates can create.

R3 reuses the existing protected `product_submission_identity` collection and its
SHA-256(JSON.stringify(identity)) document IDs. Each transaction reads every old/new
claim, rejects another owner or a retired/deleted claim, then writes product and
claims together. The protected `catalog_control/writer` document is also read and
updated by every writer: its revision serializes competing decisions even for an
unindexed legacy catalog. A full bounded catalog scan detects existing owners and
historical collisions; query-only duplicate checks are not the concurrency mechanism.
All reads precede writes. This follows Firestore's [transaction retry and atomicity
contract](https://firebase.google.com/docs/firestore/manage-data/transactions) and
[serializable isolation](https://firebase.google.com/docs/firestore/transaction-data-contention).

Reservation IDs remain the full SHA-256 of the JSON-encoded, unchanged Phase 1
canonical identity. Each reservation stores the exact canonical identity as protected
server evidence; the ID alone is not evidence. Audit separately reports
`RESERVATION_ID_COLLISION` when distinct identities derive the same document ID,
rather than treating it as a canonical duplicate or a Brand+Name warning. Audit
returns `ok:false` and no executable plan. Missing, invalid or mismatched stored
identity evidence fails closed; ambiguous legacy claims are not silently rewritten.

Backfill independently validates plan coverage, ownership, ID mapping and existing
evidence before staging any writes, even after a successful audit. Collision or
evidence conflict writes no reservations or completion marker; unchanged retries
still refuse. Claim/control write failures roll back the entire transaction. Clean
resolved plans remain idempotent. The live shared writer checks the complete old/new
identity union, existing catalog mappings and stored claims before mutation, including
multi-key edits, archive/restore/delete, importer and atomic approval. Ordinary HTTP
responses use a generic 409 reservation-integrity conflict; import reports a hard
FAILED row, never a possible-duplicate acknowledgement bypass. Detailed identity/ID
diagnostics stay in local audit reports/service errors, not public responses.

Deterministic tests inject an internal service-construction key derivation function;
production defaults remain unchanged, with no environment, HTTP or client-controlled
switch. Forced-collision tests cover audit/backfill/completion, ambiguous evidence,
cross-writer races and atomic edits/approval. No real SHA-256 collision was discovered:
the original forced reproduction exposed missing application-level collision checks.

Editing a canonical identity reserves new keys, retires removed keys and updates the
product in one transaction. Existing claimed keys remain bound. Failure leaves all
old state intact. Revision mismatch returns conflict instead of overwriting a stale
edit. Archived/inactive products retain bound claims. Hard delete removes the product
but marks its current claims deleted; earlier retired claims remain retired. No
historical key, even one formerly owned by the same product, becomes reusable. Any
future reuse policy requires separate approval, not an R3 delete side effect.

### Validation and compatibility

Publication requires non-empty name/category, a recognized Phase 1 segment and 1–50
priced variants. Brand and SKU are optional, because the reviewed identity supports
missing brand and no-SKU fallback; description, image and variant attributes are
optional. Segments normalize only to Grocery, Pharmacy or Hardware using Phase 1
aliases. No category/name/filename inference is used.

Every variant price must be a finite number or strict decimal string in 0..1e9.
Empty, missing, NaN, infinity, negatives, currency text and comma-formatted prices
are rejected, never coerced to zero. A literal zero remains accepted as before.
Legacy invalid/missing prices require operator correction rather than invented data.

Supported arbitrary JSON variant payload is preserved (bounded nesting/size, safe
keys and finite numbers); known attributes retain their values and siblings. Admin
Edit spreads stored variants rather than rebuilding a whitelist, and changing a
segment no longer discards other segment attributes. Legacy root fields and
variations[] survive non-identity edits. Explicit removal in Edit is an Admin action;
import never removes, replaces or automatically appends variants. Existing partial
flavor|size selection semantics remain in unchanged Phase 1 readers and regression
tests. Unsupported/malformed payload fails closed rather than being silently dropped.

R2A's HTTPS/no-credentials/2048-character image validator is reused for Add/Edit,
approval, and resulting archive/restore images. Legacy image aliases are cleared
when explicitly replaced/removed through Edit. Invalid legacy images must be corrected
before publication-state changes; hard delete remains possible if the catalog audit
otherwise permits it. Contradictory legacy publication flags are not silently cleared:
an Active edit/restore that Phase 1 would still hide conflicts for operator resolution.
No image fetch, DNS lookup, Storage upload or change to R2B URL-only rendering occurs.

R2A requests remain immutable/provenance-checked. Approval and final decision share
the writer transaction; identity collision leaves the request submitted, not falsely
approved. Untrusted legacy requests, stale final states and deleted submitters remain
denied. A submitted suggestion without priced variants may remain valid for review,
but is not publishable under R3; reject and request corrected information rather than
inventing prices or mutating immutable submission content.

## Safe importer contract

1. Browser PapaParse uses header:false, preserving duplicate source columns. It rejects
   parser errors before requesting preview; no catalog writes occur during parsing.
2. Server normalizes headers, validates all rows, classifies and stores a protected
   Admin-owned 30-minute preview. Unknown columns generate visible warnings.
3. Admin sees total/counts, every row, reason, price/variant and matching catalog IDs;
   selects rows and explicitly acknowledges possible duplicates.
4. Commit accepts only preview ID, row numbers and acknowledgement. It reads stored
   validated data, rechecks authority and all current identities, and invokes the
   shared writer. Client-supplied replacement product content is not accepted.

Headers may be reordered and trimmed; existing aliases are preserved without guessing.
Examples: Product Name/product_name/ProductName/generic_name -> name;
manufacturer -> brand; department -> segment; product_category -> category;
barcode -> sku; srp -> price; pack_size/dosage/form -> size. Two aliases for the same
canonical field are an explicit ambiguity error, including form plus size. The full
recognized map is in `services/catalog-import.js`. No manual mapping existed to retain.
Required headers and row values are name, category, segment, price. Brand/SKU optional.
The previous importer did not persist image_url; R3 does not silently introduce it:
that column is ignored with a warning, including dangerous strings. Add/Edit and
submission URLs continue using the existing authoritative validator.

| Classification | Commit behavior |
|---|---|
| NEW | Selected row creates through shared writer |
| EXACT_EXISTING_MATCH | Skip; never update price, overwrite payload or merge variants |
| POSSIBLE_DUPLICATE | Different canonical identity, same normalized Brand+Name; explicit review/acknowledgement |
| INVALID | Actionable field/column error; no mutation |
| CONFLICT | Multiple existing owners or conflicting same-file identity rows; no mutation |

Repeated identical same-file rows create at most one operation; conflicting repeats
are all blocked, never last-row-wins. Same brand/name with distinct identities can
be separate products after review. Preview can become stale: commit rechecks canonical
claims and current possible duplicates; acknowledgement never overrides a collision.

Limits: 256 KiB browser file, 200 data rows, 64 columns, 4000 characters/cell,
200000 characters parsed matrix, 800000 UTF-8 bytes stored preview. Whole-file atomicity
is NOT claimed: rows commit sequentially, each atomically with a receipt. Successful
receipt replay works even after preview expiry; not-yet-committed expired rows fail.
Transient failures report FAILED, unsupported selections SKIPPED, successful/recovered
rows IMPORTED. Retrying the same preview/row cannot create another product. If response
delivery is uncertain, keep that preview and retry. A new preview still sees existing
canonical identities and skips them. No automatic receipt/preview deletion job is added.

## Offline audit and migration tooling

Local audit (read-only, no Firebase SDK, .env or credentials):

`node scripts/audit-catalog-identities.mjs tests/adviser/r3/fixtures/catalog-clean.json`

Export shape: `{products:[{id,data}], reservations?:[{id,data}]}`. Supply reviewed local
JSON later; do not copy credentials into an export. Exit 0 means clean, 1 means audit
conflict, 2 means invalid input/tool failure. The report separates canonical collisions
from possible Brand+Name duplicates, lists malformed/missing identity fields, invalid
prices, ambiguous variants and conflicting/orphan bound reservations. Archived/inactive
products are included. No survivor is selected; no executable backfill plan is emitted
while any problem/collision remains. Existing R2A claims require valid exact canonical
identity evidence as well as the correct owner/hash. Legacy claims lacking that evidence
require explicitly reviewed operator resolution under freeze; the document ID alone
is not a safe legacy interpretation. Valid deleted/retired tombstones stay.

Read-only emulator audit is also supported:

`node scripts/audit-catalog-identities.mjs --emulator 127.0.0.1:PORT --project demo-ID`

It accepts only a literal loopback IPv4 address/valid port and demo- project, performs
only paginated GET requests with the emulator's fixed owner bypass, and rejects
redirects/other hosts/projects. It reads products and protected identity reservations;
it cannot select production Firebase or load real credentials. Fixture and real emulator
paths were validated. Export conversion/coverage is an operator responsibility.

`backfillCatalogReservations(db, at)` is dependency-injected tooling with memory tests,
not an exposed HTTP operation or production CLI. It requires frozen:true, audits all
products/existing claims, and writes a clean <=400-reservation plan atomically. It
leaves frozen:true and records auditCompletedAt, never enables writers. Larger plans
fail explicitly and require a separately reviewed, idempotent chunked migration under
freeze. Live writers scan at most 5000 products; larger catalogs fail closed with 503.
Every mutation scans the catalog and shares one serialization document. Production
catalog size, transaction-size limits, latency, retry/contention and read cost must be
verified on a representative isolated export before deployment; this is not a claim
of unbounded scale. Malformed/colliding legacy catalogs block writes even to unrelated
products, including deletes: resolve those conflicts through reviewed frozen maintenance.

These remain production gates, not resolved by the collision correction: the shared
control document is a PRODUCTION SCALE/CONTENTION GATE; 5,000 products is an acceptable
fail-closed tooling cap with production fit unverified; the 400-reservation atomic
backfill cap requires representative payload, index, retry, timeout and cost validation.

## Mandatory production rollout gate (NOT executed)

Separate providers cannot deploy atomically. Treat backend, Admin UI, approval and
rules as one coordinated release, with a real write freeze across old and new versions:

1. Obtain explicit release authorization, verified provider/Node 22 targets, backups,
   rollback/forward-repair plan, operator and complete product/reservation export.
2. Stop/drain every old privileged catalog writer, including approval, scheduled/admin
   scripts and seed tools. Block browser mutations with a reviewed maintenance rules
   version. Setting the new control flag alone does NOT stop old R2A backends.
3. Set protected catalog_control/writer.frozen=true via separately approved operator
   tooling; confirm no old backend/privileged maintenance can still write.
4. Audit the entire frozen catalog and claims. Resolve each collision/malformed record
   explicitly with owners; never automatically merge/delete/select a historical survivor.
   Re-export/re-audit after resolution, including tombstones and publication/image flags.
5. Backfill all canonical reservations with the approved frozen migration. Re-audit actual
   bindings, preserve retired/deleted claims, verify restart/idempotency/rollback evidence.
6. Deploy shared-writer backend and R2A approval, Admin Add/Edit/actions/importer, and final
   backend-only mutation rules to all verified targets. Keep the freeze throughout and
   retire old instances/bundles. Test cross-provider API URL, CORS, authentication and errors.
7. Pass isolated browser E2E and representative real-SDK/emulator concurrency checks:
   Add/Edit/archive/restore/delete, CSV parse/preview/commit/retry, canonical and Brand+Name
   collisions, R2A approve/reject/deletion barrier, denied direct Admin/Customer writes,
   URL-only images. Unit/rules/build results below are not browser certification.
8. Only after sign-off, unfreeze the complete coordinated deployment and perform approved
   narrow smoke checks. Monitor identity conflicts, permission denials, transaction retries,
   timeouts, latency/read costs and pending import receipts. Select operational retention
   for preview/receipt data without breaking retry guarantees; no cleanup was run here.

On failure keep the freeze. Do not restore old direct browser/privileged writers while
new identity claims or import receipts are active. Git rollback alone does not undo
data/reservations; use the approved compatible full release or forward-repair plan.
Production provider IDs/deploy commands, secrets/config, Node 22 provider compatibility,
dashboard lint debt (52 errors/27 warnings), and coordinated API_QUOTA_CUTOVER_AT remain
external release gates. R3 resolves none by inference and does not deploy.

## Verification (Node 22.20.0)

| Command (npm run) | Passed | Failed | Skipped |
|---|---:|---:|---:|
| test:adviser:r3 | 168 | 0 | 0 |
| test:adviser:r3:rules | 32 | 0 | 0 |
| test:adviser:r2b | 56 | 0 | 0 |
| test:adviser:r2a | 116 | 0 | 0 |
| test:adviser:r2a:rules | 95 | 0 | 0 |
| test:adviser:phase2b2 | 98 | 0 | 0 |
| test:adviser:phase2b2:rules | 35 | 0 | 0 |
| test:adviser:phase2b1 | 122 | 0 | 0 |
| test:adviser:phase2b1:rules | 36 | 0 | 0 |
| test:adviser:phase2a | 62 | 0 | 0 |
| test:adviser:phase2a:rules | 49 | 0 | 0 |
| test:adviser:phase1 | 22 | 0 | 0 |
| test:r0:config | 9 | 0 | 0 |
| Total | 900 | 0 | 0 |

The reservation-integrity correction adds 36 repository tests to the 864-test baseline.
All suites above were rerun under Node 22.20.0. The isolated standalone reproduction
now reports audit `ok:false`, `RESERVATION_ID_COLLISION`, zero planned/persisted unsafe
reservations, refused backfill and no completion marker. A first live binding succeeds;
the distinct colliding second binding returns 409 with the first product/claim intact.
Unchanged retries refuse; resolved clean backfill remains idempotent. No frontend or
shared browser source was touched by this correction, so the prior frontend validation
below was retained rather than rebuilt. Production hashing and Phase 1 identity remain
unchanged; the collision is deliberately injected, not a discovered SHA-256 collision.

Cross-writer memory transaction tests disable query phantom conflict detection, proving
the shared claims/control revision rather than an optimistic query shortcut. Admin/Add,
Admin/import, import/import, approval/Admin, approval/import, approval/approval and
Edit/import races yield one canonical binding; approval losers do not falsely finalize.
Fault injection covers product/claim/control/receipt rollback, role revocation, frozen
writes and retry recovery. Existing R2A fixtures were given explicit legitimate prices
and wiring/rules expectations changed only for the intentionally denied Admin browser
path. R2A/R2B fixed test manifests now allow the shared writer dependencies; isolation
still blocks SDK, bootstrap, network and credential configuration.

Real cached Firestore emulator v1.22.0 tests use localhost, demo projects and synthetic
tokens only. R3 denies direct creates/updates/deletes for Admin, Customer, another
Customer and anonymous callers; protected collections deny their reads/writes; public
product reads and emulator owner/server bypass remain working. An initial R2A rules
run hit its 5-second startup request timeout before assertions. A 30-second request
timeout in touched R2A/R3 runners and sequential execution passed all rules tests.

Admin validation reused the existing dependency-installed temporary copy; only changed
source was copied, no .env/credentials/dependencies/lockfiles. Synthetic demo Firebase
configuration and loopback API/Auth/Firestore endpoints were used. TypeScript
`--noEmit --incremental false` passed; production `next build` passed, 11/11 pages.
The first restricted build failed only downloading public Google Fonts; the same
build with public-font access passed. Repository build artifacts were not generated.
Equivalent changed-file ESLint comparison (installed Next flat configs; existing
repository FlatCompat error left untouched): products 15 errors/2 warnings before,
12/1 after; importer 4/3 before, 0/0 after; new catalog-client 0/0. No new lint findings.
Customer/shared frontend files were not changed, so Customer gates were not rerun.

## R2A dependency and decision

R2A SHARED-WRITER DEPENDENCY CLOSED

The CASE B code dependency is closed: all active writers now use identical canonical
validation/transactional claims and browser bypass is denied. This is implementation
closure, NOT production certification; the frozen audit/backfill/coordinated rollout
and E2E gates above remain mandatory.

R3 READY FOR CHATGPT REVIEW

No commit, push, merge, deployment, production Firebase access, PayMongo call or Storage
upload. Reference repository untouched. Free Trial remains deferred. Remaining first-list
work primarily concerns reports/dashboard, landing/login, API policy/history and final
browser E2E/release certification; these were not started in R3.
