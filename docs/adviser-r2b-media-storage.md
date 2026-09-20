# R2B — Media architecture and storage monitoring

## Decision and scope

**MODE A — URL-ONLY.** Reviewed from R2A `0585fb33dfa85533216f0dcfe8de81ad5745206a`;
production ref `ac3908401fac5732192ac364600c7f397a3a6af6` was unchanged.
No uploads, bucket provisioning, rule deployment, production access or migration.
This closes the architecture/monitoring-documentation part of the client's
“Monitor Image Storage Costs” item; it does not claim live monitoring is configured.

## Reachability inventory

| Surface | Evidence | Reachable / mounted / product runtime |
|---|---|---|
| Customer Add Product | `dashboard/src/app/dashboard/products/page.tsx` imports and mounts `components/products/AddProductModal.tsx`; authenticated submission sends validated `image_url` to `/api/v1/product-submissions`. | YES; URL only |
| Admin Add/Edit | `admin-panel/src/app/products/page.tsx` mounts its local AddProductModal/EditModal; validates canonical URL before Firestore writes. | YES; URL only |
| Admin review | Sidebar links `/submissions`; page displays URL as escaped React text; backend approval copies reviewed content to product. | YES; URL only |
| Customer catalog / Admin details | The two active products pages use browser `<img>` with local icon fallback. | YES; browser downloads only |
| Admin legacy uploader | `admin-panel/src/components/admin/AdminProductTable.tsx` contains uploadBytes/getDownloadURL and a file picker, but no source imports or mounts it. Active `/products` implements its own table/modals and imports only the CSV importer. | NO / NO / NO; DORMANT / NOT PART OF ACTIVE PRODUCT FLOW |
| Customer old uploader | `dashboard/src/app/dashboard/products/page.tsx.backup` contains dynamic Storage import and uploads. `.tsx.backup` is not a Next route/module extension and no source imports it. | NO / NO / NO; DORMANT / NOT PART OF ACTIVE PRODUCT FLOW |
| Both frontend Firebase configs | getStorage initializes/exports an SDK handle and includes bucket configuration. No active consumer performs object operations. Initialization is not an upload. | Imported; no active object I/O |
| Backend and Functions | Product submission, canonical projection, DaaS and filtered export paths serialize URL strings. No image fetch, upload, image proxy or Storage trigger; no reachable binary media endpoint. `sharp` dependency alone is not a processing workflow. | No image-byte I/O |
| CSV importer | Mounted Admin ImportCsvModal accepts CSV data, not binary product images. Existing shared-writer work remains R3. | Active, not a media uploader |
| Tests/config | Existing R2A tests cover URL validation/publication and Firestore rules; firebase.json has Functions, Firestore rules/indexes/emulator, no Storage target/emulator. | Local validation only |

Inventory covered tracked Customer/Admin sources (including backup), backend routes,
services, Functions, Firebase configuration, rules, scripts and tests; searched Storage
SDK operations, bucket references, image_url/imageUrl, image elements and uploader
references. R2B guards scan source trees, not only these two pages. Dormant files and
SDK setup are retained, not activated or broadly removed. Repository evidence cannot
establish whether a bucket has objects uploaded outside this application.

## Image contract, rendering and cost interpretation

- Canonical `image_url` is optional HTTPS text, at most 2048 characters; credentials,
  malformed values and dangerous schemes are rejected. R2A validation and Firestore
  publication authorization are unchanged. Customers submit for review, never publish.
- Firestore stores URL strings in submission/product documents, not image binary data.
  Those strings and applicable indexes still contribute to document storage and normal
  reads/writes. Merely saving an external URL creates no Firebase Storage objects or bytes.
- Images are hosted outside this application's managed lifecycle. Browser `<img>`
  requests consume host bandwidth/egress; there is no backend URL fetch or Next image
  optimization proxy, and no new remote-host wildcard configuration. If an operator
  supplies a URL to an existing Firebase bucket, downloads can still incur that bucket's
  costs even though this application did not upload it. URL-only does not guarantee a
  zero Storage bill for unrelated/previous objects.
- Rendering rejects invalid legacy URLs, uses escaped attributes (no raw HTML), honors
  an explicitly empty canonical URL over legacy `image`, and supports legacy image-less
  records. An adjacent local icon replaces broken images. A URL-keyed wrapper resets
  the error state on replacement. `no-referrer` avoids sending the application URL to
  image hosts. Valid URLs remain untrusted remote content: hosts can change content,
  redirect, disappear or observe browser IPs. No availability/content guarantee or
  server-side SSRF is introduced; this is not an arbitrary-host reputation policy.
- No upload, replacement/delete object lifecycle or orphan cleanup is active. Clearing
  a URL does not delete externally owned images. EXIF stripping and compression are
  **NOT APPLICABLE** to URL-only metadata; no processing guarantee is claimed.

## Dormant Storage rules — DO NOT DEPLOY

`storage.rules` remains unchanged, unconnected to `firebase.json`, unvalidated by a
Storage emulator and NOT approved for deployment. Its bare `get`/`exists` and undefined
`database` path variable are incorrect for cross-service Storage checks. The official
[Storage rules reference](https://firebase.google.com/docs/reference/security/storage)
uses `firestore.get()` / `firestore.exists()` with fully qualified
`/databases/(default)/documents/...` paths and escaped variables. Existing write logic
also assumes request.resource exists (not a deletion policy). Correct syntax alone
would not establish a safe managed-media lifecycle. R2B deliberately adds no Storage
deploy target or rule changes; no Storage rules test command is warranted.

Do not run a blanket deployment based on this file's existence. A future managed-media
proposal needs approved owner/role, path, size/type, read access, replacement/deletion,
cleanup and trusted-processing policies plus real Storage emulator coverage before
activation. It must not mount dormant Customer/Admin upload code as-is.

## Operator monitoring runbook

Official guidance checked 2026-09-20; no production console was accessed.

1. An authorized operator records the actual project, bucket(s), owner, region, plan,
   billing account, baseline, review cadence and client-approved budget/notification
   recipients. These are release inputs, not invented identifiers or thresholds.
2. For URL metadata, use Firebase **Firestore → Usage** and billing reports to review
   storage and read/write trends. See [Firestore monitoring](https://firebase.google.com/docs/firestore/monitor-usage).
   Investigate growing submission/catalog volume separately from image bytes.
3. If any actual bucket exists, review **Firebase Storage → Usage** for stored bytes,
   object count, bandwidth and download requests; **Storage → Rules** / Cloud Monitoring
   for ALLOW/DENY/ERROR evaluations. Metrics are delayed, not a real-time cost ceiling.
   Use Google Cloud Storage bucket metrics/Cloud Monitoring to examine operation volume
   and response errors/upload failures; investigate unexpected growth and orphan objects
   only with the responsible workflow owner, never delete objects merely from a guess.
   See [Firebase Storage monitoring](https://firebase.google.com/docs/storage/monitor-storage).
4. Use **Firebase Usage and billing** / Google Cloud Billing reports for billed usage.
   Current Firebase guidance requires Blaze for Cloud Storage access. Bucket generation,
   region and applicable current allowances affect charges; verify current console and
   [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
   instead of assuming a universal free tier. Stored bytes, egress and operations can
   have separate costs. External hosts have their own pricing/limits.
5. With billing authority, open **Google Cloud Billing → Budgets & alerts**, scope the
   budget to the approved project/services and select client-approved amount, thresholds
   and recipients. Configure Cloud Monitoring alert policies for approved usage/error
   conditions, test delivery and record ownership. Budget alerts **do not cap charges**;
   no shutdown automation is supplied. See [Firebase cost controls](https://firebase.google.com/docs/projects/billing/avoid-surprise-bills).

**Configuration status: documentation only; alerts NOT implemented or verified.** No
hard-coded GB/currency threshold. For URL-only operations, monitor external host health,
link failures and its costs using that host's approved tools; this change only provides
safe rendering fallback, not automated link probes. If unexpected bucket activity is
found, establish its real owner/workflow and obtain a separate security review.

## Validation boundary and remaining work

`npm run test:adviser:r2b` runs an explicit local-only module manifest: URL contracts,
in-memory reviewed publication, fallback handler behavior and source/config guards.
It does not initialize Firebase, contact image hosts or bootstrap the application.
Source guards detect known architecture changes; they are not a universal SSRF proof.
R2A Firestore emulator regressions remain the authorization proof. Frontend TypeScript,
builds and changed-file lint must run with synthetic config in temporary copies.

Live monitoring setup/thresholds remain operator inputs. Managed upload policies,
Storage rules/lifecycle and trusted EXIF/compression are only future work if uploads
are separately requested, not missing features of Mode A. Other first-list work remains
R3 importer/shared writer, dashboard/reports, landing/login, API policy/history and final
certification. R2A CASE B external writer concurrency remains unresolved by R2B.
Free Trial remains deferred. No commit, push, merge or deployment is authorized here.

## Recorded local validation — Node 22.20.0

| Command suffix (`npm run`) | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `test:adviser:r2b` | 56 | 0 | 0 |
| `test:adviser:r2a` | 116 | 0 | 0 |
| `test:adviser:r2a:rules` | 95 | 0 | 0 |
| `test:adviser:phase2b2` (66 + 16 UTC + 16 New York) | 98 | 0 | 0 |
| `test:adviser:phase2b2:rules` | 35 | 0 | 0 |
| `test:adviser:phase2b1` | 122 | 0 | 0 |
| `test:adviser:phase2b1:rules` | 36 | 0 | 0 |
| `test:adviser:phase2a` | 62 | 0 | 0 |
| `test:adviser:phase2a:rules` | 49 | 0 | 0 |
| `test:adviser:phase1` | 22 | 0 | 0 |
| `test:r0:config` | 9 | 0 | 0 |
| **Total** | **700** | **0** | **0** |

Both temporary-copy TypeScript checks and Next 16.2.9 production builds passed
(Customer 17 pages; Admin 11). Synthetic Firebase config, loopback API/emulator
addresses and no environment files were used; only public Google Fonts needed
build network access. No application server or production Firebase was started.
No dependencies were installed or lockfiles changed.

Changed-file lint compared against the exact R2A HEAD: Customer products page
3 errors/4 warnings before and after; Admin products page 15 errors/2 warnings
before and after; both image helpers 0/0. No new diagnostics. Admin comparison
used the existing temporary equivalent Next flat config because its repository
FlatCompat config has a pre-existing circular-JSON problem. This is not a clean
full-project lint claim: dashboard 52/27 release debt remains as documented in R0.
`git diff --check` passed. Fallback verification uses handler unit tests and JSX
wiring assertions, not live image hosts or a production browser session.
