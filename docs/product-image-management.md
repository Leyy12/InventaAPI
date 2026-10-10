# Product images: implementation and staging activation

This branch implements actual managed file uploads in isolation. It does **not**
activate an API deployment, a bucket, IAM, Firebase rules, cleanup, or Production.
The accepted baseline is `8f027281c8167b109b431f43dffae96c39984e08`.

## Reviewable milestones

- M1: Customer cards contain-fit images, preserve responsive geometry/fallback,
  and Admin CSV import/export carries optional validated `image_url` metadata.
- M2: trusted processing, private immutable objects, authoritative media bindings,
  Customer/Admin file controls, and authenticated Admin review thumbnails.
- M3: isolated lifecycle/processing/UI tests, real Storage and Firestore emulator
  authorization checks, existing regressions, TypeScript, builds and lint comparison.

## Verified infrastructure and prerequisites

Read-only bucket inventory for `inventaapi-db` found only Functions source/upload
buckets in `ASIA-SOUTHEAST1`. No approved product-media bucket was verified. Those
Functions buckets are not appropriate targets and were not used or changed.

Managed mode defaults off. Every media endpoint returns descriptive 503 until
explicit activation. Existing external HTTPS images continue to work. File upload
controls remain implemented; a 503 is an unsuccessful upload, never a successful
submission or catalog write.

Separate operator approval is required before all of the following staging work:

1. Choose an isolated Firebase/GCP staging project, approved private media bucket,
   region, billing arrangement and quotas. Do not infer a bucket from web config.
2. Verify the bucket's exact name and project number, uniform bucket-level access,
   enforced public access prevention, and absence of public IAM grants/download
   tokens. Review inherited IAM too. Give the API identity only required object
   create/read and bucket metadata access; reserve deletion for a separate operator.
3. Install/test `product-media.storage.rules` in that staging project only. It
   denies every direct client read/write, including Admin client claims. The API
   is the only authorized media gateway; its server SDK uses IAM instead of rules.
   Pending/published permissions are implemented in the authenticated gateway.
   The old `storage.rules` stays dormant and must **not** be deployed.
4. Provision the staging API with Sharp and explicitly configure
   `PRODUCT_MEDIA_ENABLED=true`, `PRODUCT_MEDIA_BUCKET`,
   `PRODUCT_MEDIA_BUCKET_PROJECT_NUMBER`, and `PRODUCT_MEDIA_PUBLIC_ORIGIN`.
   The latter is the canonical HTTPS origin of that API, with no trailing slash.
   Check `product_media` uid/open equality queries against staging Firestore; create
   an index only if staging requires it. Client writes to media/operation receipts
   remain denied by Firestore's existing catch-all.
5. Point both frontend Previews at the staging API and staging Firebase Auth.
   Verify CORS, revoked tokens, authoritative roles, private cache behavior and
   complete authenticated Add → review → approve/reject → display flows there.
6. Review cost/retention controls and obtain VISUAL PASS plus explicit approval
   before any Production release. None of those infrastructure actions occurs here.

Local builds use explicit synthetic public Firebase identifiers and reserved
documentation IP API origins. They cannot exercise Production account/catalog
mutations. A frontend-only Preview cannot provide a functioning staging backend.

## Transport and trusted processing

Upload is raw bytes to `POST /api/v1/product-media/upload/submission|catalog`,
with a Firebase Bearer token and stable `Idempotency-Key`. No client-supplied path
or public URL determines ownership. The server verifies token revocation and reads
the current account/role from Firestore before decoding or object access.

Input: JPEG/PNG/WebP, non-empty, at most **3 MiB**. Browser selection also checks
file extension against MIME. Server signature, declared MIME and trusted decoder
must agree; SVG, executable/spoofed/truncated content and animation are rejected.
Dimensions are bounded to 24 megapixels and 12,000 pixels per side. Sharp applies
EXIF orientation, removes metadata, preserves transparency/aspect ratio, never
upscales, and produces WebP quality 82 within 1,400 × 1,400, capped at 2 MiB.
Decoder timeout is 10 seconds. No original upload is retained.

The raw-body parser is mounted before JSON parsing, with a 3 MiB limit and no
compressed transport. This leaves room under Vercel's documented 4.5 MB request
limit. There is no server fetch of external image URLs and no arbitrary URL proxy.

References: [Sharp inputs](https://sharp.pixelplumbing.com/api-constructor/),
[Sharp metadata](https://sharp.pixelplumbing.com/api-input/),
[Vercel limits](https://vercel.com/docs/functions/limitations).

## Ownership, retries and atomic publication

Media ID = SHA-256 of authenticated UID, workflow and stable operation key;
object path = `product-media/<id>.webp`. Private Firestore metadata records source
and processed digests, dimensions, size and state. Bytes never enter Firestore.
Conditional object creation uses `ifGenerationMatch: 0`. A replay must retain
identical bytes. Durable bytes are read/hash-verified before acknowledging ready;
existing mismatched objects or download tokens fail closed.

States: `uploading → ready → pending → published`, with `rejected` and `retired`
terminal states. Admin catalog upload goes `ready → published` inside the writer.
Twenty open uploads per account bound unfinished allocation; published/rejected/
retired records are not counted as open. This is not a monetary spend cap.

Customer submission binds a ready asset owned by that submitter and the exact
submission operation. Its immutable request/key remains stable across uncertain
upload/submission responses and modal close/reopen. Failed uploads never create
requests. Successfully uploaded but unsubmitted media stays ready for safe retry
or eventual operator cleanup. Invalid input can be corrected under a fresh key.

Approval atomically commits the product, identity reservations, review decision
and `published` media binding in **one Firestore transaction**. Rejection commits
the decision and `rejected` state together. Bytes already exist privately and are
immutable: no Storage copy occurs during approval. Storage and Firestore are not
atomic with one another. A lost upload response/failed ready commit leaves an
`uploading` record that recovers with identical bytes/key. A failed decision commit
leaves the private pending state unchanged and the same review can safely retry.

Admin create adds an optional stable operation receipt to the authoritative
writer transaction, preventing duplicate create after a lost response. Edit keeps
the prior image if image fields are omitted. Replacement/removal retires the old
binding only when the expectedRevision transaction succeeds. Canceling a form
does not delete objects. Stale or failed edits retain the prior published image
and leave an unbound replacement available for retry/cleanup. Canonical identity,
duplicate policy, variant separation, entitlements and Trial limits are unchanged.

## Read privacy and caching

`GET /api/v1/product-media/<id>/private` checks current owner or authoritative
Admin access and returns only ready/pending/published WebP bytes, with
`private, no-store` and `nosniff`. Admin UI sends the token in a header, creates a
temporary blob URL, aborts obsolete requests and revokes the URL on unmount.
Tokens never appear in CSV, product URLs or Storage object metadata.

`GET /api/v1/product-media/<id>/image` returns bytes only if media is published,
the current product references that exact asset and the catalog product is visible.
The canonical persisted/exported URL uses this gateway. It is not a signed URL
or a public bucket object. Pending/rejected/unbound/retired media is not public.
Public cache lifetime is five minutes; previously served approved bytes may remain
in browser/CDN caches for that interval after retirement. Already downloaded bytes
cannot be recalled. Private review responses are never shared-cacheable.

## Presentation and CSV

Customer cards retain `h-44`, the accepted auto-fill minmax responsive grid,
selection borders/controls and segment badge. `object-contain` plus padding fits
tall, square, wide and transparent photos without crop/stretch/hover scaling.
Lazy images have fixed geometry. Existing validated HTTPS sources and bounded
local placeholder fallback remain; changing the source remounts fallback state.

CSV recognizes optional `image_url`, `image url`, `imageurl`. Blank is optional;
malformed/unsafe/local URLs cause per-row errors rather than being discarded.
Preview shows validated image presence/thumbnail. Commit still uses server-owned
selected rows, canonical exact-existing skip, duplicate acknowledgment and
idempotency; image metadata does not define product identity. No downloaded bytes
or automatically mirrored external images are implied by a CSV.

Export adds the persisted approved/legacy HTTPS image URL, blank when absent.
All cells are quoted, embedded quotes escaped, CRLF supported and spreadsheet
formula prefixes neutralized. Export filters/scope stay unchanged. The accepted
export aggregates variants into **Flavors/Specs/Pricing** display columns, while
import expects row-level variant fields such as size/price. Therefore an unchanged
full export is **not a full-fidelity import round trip**; this task adds image
metadata without redesigning those unrelated columns or merge rules.

## Published cross-origin delivery and local regression

Published image delivery overrides Helmet's default resource policy with
`Cross-Origin-Resource-Policy: cross-origin` only after publication, current
product binding/visibility, Storage read, and byte-integrity checks succeed.
Private images and denied/unavailable responses retain the global `same-origin`
policy. Content type, caching, CSP, CORS, authentication and rate limits are
unchanged, including authorized conditional 304 responses.

Run `node scripts/run-product-media-http-tests.mjs` for synthetic local HTTP and
two-origin Chromium regressions at desktop/mobile sizes. The fixture executes
the checked-in server middleware and media router with synthetic SDK adapters;
it cannot contact real Firebase or Storage. It verifies ordinary no-CORS image
decoding, denied states, private ownership, failures and unchanged headers.
Before correction, the same fixture recorded HTTP 200 / image/webp / same-origin
with valid 140×240 bytes while Chromium blocked both cards with
`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`. This is local delivery verification,
not proof of an activated staging upload workflow.

Staging still requires approved private bucket configuration, effective metadata
and object permissions, isolated API/frontend bindings, Auth domains/origins,
stable media origin, cost approval, resource measurements and synthetic E2E.
Cloud Run keyless initialization is now explicitly supported through
`FIREBASE_CREDENTIAL_MODE=adc` and `FIREBASE_PROJECT_ID=inventaapi-staging`.
Omit certificate variables and `GOOGLE_APPLICATION_CREDENTIALS`; the attached
service identity supplies ADC. See `docs/release-environment.md`. This source
support does not activate media or change credentials/infrastructure.

## Ordered staging activation approval packet (not executed)

Read-only Cloud Run configuration verified the API's attached identity as
`inventaapi-api-staging@inventaapi-staging.iam.gserviceaccount.com` on revision
`inventaapi-api-staging-00006-9sb`. No service-account replacement or key is needed.
Effective resource authorization remains a separate live integration gate.

| Order / approval scope | Expected impact | Verification before proceeding | Rollback / containment |
| --- | --- | --- | --- |
| 1. Read-only existing bucket consumer/object/ACL/token inventory | Establish whether the existing staging bucket can safely change | Record consumers, effective policies, object generations and any public dependencies | No writes; choose a separately approved media bucket if shared consumers conflict |
| 2. Staging bucket uniform access and enforced public-access prevention | Remove ACL-based/public grants; may affect existing consumers | Verify metadata matches the approved bucket/project and test client denial | Record previous settings; uniform-access rollback is time-limited by the provider; do not bypass the private-bucket gate to restore unsafe media access |
| 3. Staging identity IAM only | Permit bucket metadata and immutable object creation/read | Prove `storage.buckets.get`, `storage.objects.create`, `storage.objects.get` using the deployed identity; verify denials outside approved scope | Revoke only newly approved grants and disable media; reserve deletion authority for approved cleanup |
| 4. Staging API environment and reviewed revision | Select explicit ADC, staging project, API_PORT=8080, approved media bucket/project number and stable HTTPS API origin | Confirm existing attached identity, no key/file override, default app project, token availability and resource access | Restore the previous staging revision/environment; do not switch to Production certificates |
| 5. Customer/Admin staging build configuration and Auth domains/origins | Isolate both applications from shared Production Firebase/API bindings | Verify staging project/app IDs, API base, private CORS/preflight and published-image decoding; retain CORP fix | Restore prior staging builds and remove only newly added domains/origin entries |
| 6. API resource/concurrency measurements | Establish safe Sharp/Storage capacity and image-grid rate limits | Measure cold/warm, maximum dimensions, concurrent uploads, retries, memory and latency | Reduce approved concurrency, restore resource settings/revision or disable media |
| 7. Synthetic account/data approval and end-to-end review | One Customer, Admin and temporary second Customer for denial checks; pending/approved/rejected/replacement/image-less/CSV fixtures | Prove upload replay, isolation, current roles, approval atomicity, replacement conflict safety, desktop/mobile/CSV behavior | Retire/delete only manifest-listed synthetic references/objects with generation and reference checks; preserve audit receipts |
| 8. Storage/bandwidth budget and retention owner | Account for optimized objects, Firestore metadata, processing, Storage/API egress and soft deletion | Approve regional usage budgets/alerts, 24-hour abandoned and seven-day rejected/retired proposals, pending-age alerts; alerts are not spend caps | Disable media for containment; separately approve cleanup, never delete published assets by blanket lifecycle |

Scope IAM to the staging project/database and selected bucket. Media workflows
also need Firestore transaction/query/write permissions and Auth user-read access
for revocation checks (`firebaseauth.users.get`). Existing broader API account
management permissions require separate least-privilege review. Do not grant
Storage Admin, public access, token-signing or Production roles merely to enable
media. A proposed cleanup identity may need generation-specific object deletion;
this is not required by normal media upload/read handlers.

All four `PRODUCT_MEDIA_*` values remain explicit. Keep media disabled until
bucket/security/IAM/configuration checks are approved and integration passes.
Staging Auth web apps already exist, but future Preview domains and exact API
origins require approval. Shared Vercel Preview bindings must not be reused with
Production Firebase defaults. No deployment, configuration, IAM, data or billing
operation is authorized by this packet.

## Retention, cleanup and cost recommendation (not activated)

No cleanup job or live deletion runs here. Recommended operator policy, pending
retention approval: abandoned uploading/ready assets older than 24 hours; rejected
assets after seven days; retired assets after seven days and beyond cache expiry.
Pending submissions are retained until a review decision, with age alerts. These
are proposals, not selected production policy or budget commitments.

Implement cleanup separately as dry-run inventory first. Before deletion, re-read
the authoritative asset and every current product/submission reference in a
transaction, acquire a cleanup fence/closed state so uploads cannot revive it,
then delete only the recorded immutable object generation. Keep audit records;
handle missing objects and failed deletes idempotently. Orphan objects without a
metadata record require independent age/reference verification. Never apply a
blanket bucket lifecycle to published objects; never delete on cancel/open/edit.

Monitor stored optimized bytes, object creation/replay reads, processing CPU,
Firestore transactions/query/index usage, abandoned and rejected counts, API
egress, Storage reads and CDN cache hit ratio. Record actual regional prices,
set operator-approved quota/budget alerts, review repeated failure/rate-limit
events and assess caching costs. Alerts are not hard spend caps and costs are not
zero. The first release keeps one optimized primary image, not multiple originals.

## Validation and URL-only transition

Run `node scripts/run-product-media-tests.mjs` (network denied), and add
`--storage` for the cached official Storage emulator bound only to loopback.
The Storage test uses a fresh demo project/persistence directory and forbids
automatic emulator downloads; it needs local Java and installed Firebase tools.
It tests anonymous/owner/other/Admin-claim client read/create/overwrite/delete/list
denial plus real local HTTP → Sharp → Storage → submit → approve → public image.
Synthetic Admin/Auth and in-memory Firestore in that flow are supplemented by
existing real Firestore rules suites. It does not prove deployed IAM or live Auth.

R2A/R2B assertions that forbade any file picker/backend byte handling were updated
to require actual active pickers, authenticated gateway uploads, server-owned
bindings, immutable private storage, feature gating and no external URL fetching.
The obsolete R3 assertion that ignored `image_url` became URL rejection/alias/
blank/exact-existing tests. Direct client SDK writes, dormant component activation,
the old rules deployment, identity changes and variant merging remain forbidden.
The historical R2B document is retained with a supersession notice.

Admin's accepted legacy FlatCompat ESLint configuration crashes with current Next
flat exports, reproduced on both baseline and candidate. Changed-file comparison
uses the same temporary Next flat configuration for both; no repository-wide lint
configuration or unrelated existing findings are changed.

## Candidate validation results (2026-10-09)

| Check | Result |
| --- | --- |
| Focused processing, adapter, lifecycle, CSV and actual form tests | 42/42 |
| Storage emulator, direct access denial and local HTTP lifecycle | 21/21 |
| R2A / R2B / R3 | 116/116, 56/56, 178/178 |
| Segment catalog | 46/46 |
| Free Trial, including add-only catalog | 171/171 |
| Pro Max | 89/89 |
| Customer selection UX/layout | 12/12 |
| R2A / R3 Firestore emulator rules | 95/95, 32/32 |
| Customer / Admin TypeScript | PASS / PASS |
| Customer / Admin optimized production builds, synthetic config | PASS / PASS |
| Backend syntax and isolated handler validation | PASS |
| Customer changed-file lint | Baseline 6, candidate 6, no new findings |
| Admin changed-file lint with identical temporary flat config | Baseline 13, candidate 13, no new findings |
| Diff whitespace check | PASS |

All 858 tests pass. The final build guard initially rejected reserved `.invalid`
origins in synthetic build configuration; the corrected build uses reserved
documentation IP origins and passes without source/config-validator changes.
New static tests with obsolete grid/no-token assertions were corrected to assert
the unchanged auto-fill grid and explicit rejection of existing download tokens.
No failing regression tests were deleted or unrelated source failures assumed.

Local browser checks used real React/source components, synthetic accounts/products
and generated images with a network-denying CSP. Desktop (1440), tablet (768) and
mobile (390) cards retain 176px contain-fit geometry without page overflow. Customer
and Admin file selection/removal, preview, URL source exclusion, and existing Admin
image display were checked. The Customer fieldset is contained on mobile and file
controls wrap. Synthetic photo URLs map only to fixed local fixture images; no
remote URL is fetched/proxied by the fixture server. API writes are disabled in
this visual fixture; actual upload/publication is tested in the isolated emulator.

Customer/Admin Vercel Previews are **not created**: exercising managed uploads
requires staging API/storage infrastructure. Per the requested stop-before-staging
instruction, no API, bucket, rules or other infrastructure is deployed. Authenticated
staging and operator visual approval remain activation prerequisites.

Serving Production aliases were inspected read-only and still point to the supplied
API `dpl_czibXCBoVkKe6sueTecSTVxq3yFj`, Customer
`dpl_5GLk7CJ12RrQcYdMxbjpQVLUgQnh`, and Admin
`dpl_Ak9VCyfBFEp65ZRES6iXMhNnFbST` deployments. No Git push or live mutations occur.
