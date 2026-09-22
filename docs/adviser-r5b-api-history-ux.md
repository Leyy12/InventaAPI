# R5B — API policy copy, recorded request history, developer UX

## Scope and safety

Base: `a84cb69ab46b32c1b5ccb8275770d3d5d06c92f5` (R5A).
Branch: `adviser/r5b-api-history-ux`.
Production reference: `ac3908401fac5732192ac364600c7f397a3a6af6`.
Local implementation only: no commit, push, merge, deployment, production Firebase,
live PayMongo call, Storage upload, credential migration or Free Trial.
The Independent repository was not accessed or modified.

## Before-state inventory (inspected before implementation)

| Surface | Actual prior behavior / issue |
| --- | --- |
| Customer API Keys | Authenticated metadata and one-time secret creation; repeated account counters inside key cards; list failure could resemble empty/stale success; clipboard success was reported without awaiting it |
| Customer dashboard summary | R4 `CustomerUsageSummary` already reads account quota from authenticated key metadata endpoint and distinguishes unavailable, unlimited and clean-window hold; retained as authority |
| Customer Products | Scoped key creation and deliberate one-time secret exports; clipboard-and-leave did not await success; Postman host parsing only removed `http://` |
| Customer API docs | Stale `/products`, `/api/products/:id`, Bearer API-key header, `success/data`, category/limit/offset examples; four language examples duplicated; no truthful recorded history |
| Customer Playground | Header credential execution already correct; examples interpolated the entered secret; offered an Admin endpoint with the wrong credential type; stale response panels and query parameters |
| Shared CodeSnippet | cURL/JavaScript/Python; variable credential prop and stale port 5001 default; copied without awaiting; assumed success before response handling |
| Plan / auth / navigation copy | Free and Pro each claimed one key without backend enforcement; generic paid greeting claimed 5,000 even for Enterprise; sidebar called the Customer an SME Consumer |
| Admin `/consumers` | Key inventory joined by owner UID to Customer profiles, including revoked rows; title implied downstream Consumers; description incorrectly said every row active; account allowance repeated per key without clear shared semantics |
| Admin security / traffic / account entitlements | Existing backend account entitlement summaries; R4 traffic is explicitly a bounded operational sample, not Customer history; retained |
| Backend management / quota | Six token-authenticated key handlers; list returns `usage.scope = account`, UTC window/used/limit/reset/optional hold; shared quota transaction and credential checks already authoritative |
| Backend telemetry | Server-written `api_telemetry` for catalog route responses and sales-feed success; no Customer history endpoint; no downstream Consumer model |
| Repository documentation | Phase documents describe historical decisions; release docs describe unresolved operator gates. No separate current API guide outside the stale Customer docs. Historical reports are not rewritten as current policy |

### Policy occurrence classification

- No active literal one-request-per-day or once-per-day key-generation enforcement/copy was found.
- Free 50/day and Pro 5,000/day in plan marketing, Free privacy-policy example and Pro-specific login description match the default contract. Marketing is not current-account authority; explicit lower server caps remain unchanged.
- Free/Pro one-key feature text and unused `apiKeys: 1` marketing metadata were removed. Neutral shared-account copy replaces the claims; no new key limit is selected.
- Generic paid-login success copy now points to the verified dashboard allowance. Only text changed in LoginModal/AuthEntry; R5A auth/navigation behavior is untouched.
- Enterprise unlimited marketing remains in Enterprise context. Runtime displays show Unlimited only from verified backend `limit: null`. Existing `Unlimited` plan aliases remain untouched; Admin auth's display label is not quota authority.
- Per-key language describing names, inventory rows or the 500 linked-product scope cap is not a per-key daily allowance. That scope cap and all enforcement code remain unchanged.
- No active instruction to regenerate keys after product edits was found. Explicit same-key/subsequent-request wording was added, with no real-time delivery promise.
- Existing legacy `.backup` files and historical phase reports are not active API UX and were not changed. Internal legacy role aliases Consumer/Business remain supported, not redefined as downstream applications.

## Final product decisions (resolved by R5C)

**RESOLVED:** “1 per day” means one successful API-key generation per account per
UTC calendar day. R5B did not implement that rule; R5C implements it transactionally.
See [R5C decisions and cutover](adviser-r5c-final-requirements.md) and the
[authoritative system flow](system-flow.md). API request quotas remain Free 50/day (including existing lower server caps),
Pro 5,000/day, existing Enterprise/unlimited behavior, shared ACCOUNT quota across
keys, UTC windows and the existing cutover hold. Creation/revocation does not reset
usage. R5C changes generation frequency only; credential format, subscription/payment
policy and catalog/import behavior remain unchanged.

“Existing lower server caps” specifically means the existing Free/Starter account
field `users/{uid}.apiRequestLimit`: the unchanged entitlement evaluator requires
a nonnegative integer and uses `Math.min(apiRequestLimit, 50)`. A server-stored
override of 7 is therefore a daily account cap of 7; it is not a new Free product
tier or an inference from traffic. Default provisioning remains 50. Expired Pro
normalizes to Free 50. Separately, the unchanged Express limiter permits 60
requests per minute per IP across the `/api/` and `/daas/` mounts, including history.
That abuse limiter does not change the daily entitlement or provide per-key quota.
R5B added no management limiter; R5C adds a separate generation allowance. Request quota exhaustion/IP limiting use
429; clean-window activation hold uses 503 `QUOTA_CUTOVER_PENDING`.

**RESOLVED — Consumer Name:** use **Key Name**; no downstream Consumer registry is
required in current scope. No real downstream Consumer Name is captured. A Customer owner,
business name, key holder or key alias cannot truthfully fill that field. History
uses **Key name (at request)**, **Date**, **Endpoint**, **HTTP status**. Names are
untrusted display labels recorded at request time, not current key names, proof
of key validity or Consumer identities. No registry was created or is required.

## History authority, query and privacy

`GET /api/v1/api-keys/history` precedes `/:id`. Firebase Bearer verification checks
revocation; UID comes only from the decoded token. Server `users/{uid}` must be
present, unblocked and have an existing Customer role alias: Developer, Consumer
or Business (case-insensitive). Admin is not a Customer alias. Role/token query
claims are not authority. The account/deletion barrier is rechecked after reading.

The query is `api_telemetry.where(userId == token.uid)`, ordered by `timestamp DESC`
then document ID DESC, limited to **51**. At most **50** records are returned;
the extra row only supplies `hasMore`. No cursor, document-ID, key-ID, owner-ID,
limit or arbitrary lookup is accepted; nonempty query/body parameters fail 400.
Records are checked for the expected owner again before projection. Success and
errors are `Cache-Control: no-store`; SDK/internal failure text is not returned.

Actual writer fields are `userId`, `apiKeyId`, `keyName`, `timestamp`, `endpoint`,
`method`, `statusCode`, `success`, `latencyMs`. The response allowlist contains only
`keyName`, UTC ISO `timestamp`, known `endpoint`, known `method` and integer
`statusCode` (100–599) or null. Unknown endpoint strings are not echoed, preventing
historical query-string credentials from leaking. No owner/email/customer name,
record ID, key selector, legacy ID, raw key, token, hash, header, IP, user-agent,
payment metadata, stack or latency is returned. Key names containing recognizable
credential material or malformed/overlong text are suppressed. Missing safe names
show “Key name unavailable”; legacy ID values are NEVER used as label fallbacks.

Firestore's ordered query omits documents without the timestamp field. Values
that are not a valid Date/Firestore timestamp become null rather than invented
dates. Within the bounded result, valid recorded dates sort newest-first and
unavailable dates sort last; document-ID order breaks equal-date ties. Corrupt
timestamp types can occupy slots in the bounded query, so this is not a complete
chronological archive. No unbounded fallback scan is attempted.

**Logging limitations:** telemetry writes are best-effort. Auth failures write a
different audit collection; quota middleware rejection (including 429) is not
currently recorded in this telemetry collection. No logging/accounting changes
were made. A recorded 429 is displayed as `429 · Client error`, never success;
tests cover it without pretending that current middleware writes such events.
`success` booleans never override the recorded HTTP status. Missing/invalid status
is “Not recorded,” not success. The existing sales feed is demonstration data,
not an authoritative sales report; docs now state this.

### Index / rules deployment gate

`firestore.indexes.json` adds the actual query's collection-scope composite index:
`api_telemetry: userId ASC, timestamp DESC, __name__ DESC`. An authorized operator
must deploy it and wait for readiness before enabling history in production.
No index was deployed here. Missing index/read failure is a sanitized 503 and an
explicit UI error. Emulator tests cannot certify production index readiness/scale.
Existing Firestore rules are unchanged: direct Customer telemetry reads/writes
remain default-denied. Admin account-entitlement summaries are backend-mediated.
The existing R4 Admin traffic listener is a direct browser Firestore query, NOT
backend-mediated: current default-deny rules also deny that Admin browser read.
This pre-existing report-access gap remains unchanged by R5B and is an explicit
release follow-up, not evidence that the new Customer history authorization fails.
Server Admin SDK reads remain available. No rule was loosened during this review.

Historical trust limitation: the reviewed writer and current repository rules do
not prove which rules were actually deployed when every legacy row was created,
or whether privileged imports/edits occurred. No production data or deployed rules
were accessed in this review. Old rows are recorded telemetry, not a certified
audit trail. An authorized release operator must verify historical provenance;
projection and ownership checks do not retroactively authenticate legacy content.

## UI and developer experience

- API Keys reuses the R4 authoritative account summary: used, current limit,
  remaining, UTC reset, unlimited and cutover/unavailable states. Key cards no
  longer duplicate quota counters. Backend failure never becomes false zero.
- History has loading, successful data, successful empty and error states. Refresh
  clears old rows; failure is not empty. A ten-second timeout fails visibly, and
  generation plus AbortController guards discard late responses. The reader is
  keyed by authenticated UID; account switches/unmount cannot repopulate old rows.
  UTC is preserved in the payload and dates display with browser locale/timezone.
- History is a recent 50-record view, not full-history pagination or a usage sum.
- Key list errors are explicit with retry, stale rows cleared, account-keyed
  mounting and overlapping-read guards. Create/revoke remain backend-authoritative;
  list shows active-status records only. Admin clearly distinguishes stored active
  key status from actual account/credential authorization; unknown is not revoked.
- Admin **API Key Inventory** accurately describes key rows and Customer owners.
  Shared account usage repeats for the same owner, not fresh allowances per key.
  Listener errors are visible and unknown usage does not render a false-zero bar.
  R4 operational sample labeling is unchanged.
- Shared examples preserve cURL, JavaScript/fetch, Python and PHP, use only
  `x-api-key: YOUR_API_KEY`, validate allowed endpoint/query shapes, and escape
  code-literal characters. The Playground still sends a deliberately entered key
  in the header when Execute is clicked; example text never receives that key.
- Contextual **Copy API key**, **Copy endpoint**, **Copy example** and **Copy response**
  actions are deliberate, await clipboard completion and report failure. Failed
  copy in the Products one-time dialog no longer navigates away and loses the key.
  Existing deliberate one-time `.env`/Postman secret export remains; secrets are
  never added to URLs, logs, analytics or manual browser persistence.
- Large deletions are stale/duplicated API examples, unsupported documented routes,
  old response panels and their styling, replaced by one shared example renderer
  and concise current-contract documentation. Existing languages, quick start,
  error guidance, support link, request execution, product expansion, raw response
  and response download remain. No auth, product/import or report logic was removed.

## Verification

Node 22 isolated `npm run test:adviser:r5b`: 144 passed, 0 failed, 0 skipped.
Tests directly execute the history handler with bounded query fixtures and include
negative identity/owner/role/deletion cases, projected secret suppression, multiple
keys, legacy revoked history, ordering/ties/bounds, errors, invalid timestamps and
statuses; frontend helpers cover refresh/timeout/unmount/races and quota semantics.
Real existing key creation and quota services prove same-day multiple keys still
share usage. Wiring checks supplement behavioral tests; they are not browser E2E.

Phase 2A's static route-count assertion was updated from six to seven for the new
history route, retaining all original handler assertions. Its existing emulator
tests now also assert Customer/stranger/anonymous telemetry read/write denial.
No enforcement or Firestore rules were changed to make tests pass.

Implementation validation was **1,292 / 0 / 0**. Final pre-commit review validation
is **1,309 passed / 0 failed / 0 skipped**: 144 R5B plus 1,165 prior regression
tests. All suites in the table below were rerun under Node 22.20.0 after correction.

| Suite | Functional passed | Rules passed |
| --- | ---: | ---: |
| R5B | 144 | covered by extended Phase 2A emulator assertions |
| R5A | 150 | — |
| R4 | 115 | — |
| R3 | 168 | 32 |
| R2B | 56 | — |
| R2A | 116 | 95 |
| Phase 2B2 | 98 (66 + 16 UTC + 16 New York calendar cases) | 35 |
| Phase 2B1 | 122 | 36 |
| Phase 2A | 62 | 49 |
| Phase 1 | 22 | — |
| R0 config | 9 | — |

Customer and Admin TypeScript and production builds pass in the existing temporary
validation copies, using existing dependencies, synthetic demo Firebase settings,
loopback API/emulator endpoints and no real environment files. Only the existing
Google Fonts build step required network. Backend history/route syntax checks pass.

Changed-file Customer lint: **10 pre-existing errors / 5 warnings**, versus **28 /
7** in the same files at R5A. Remaining errors are in the existing Products page,
auth components and Sidebar. The new history/helpers, rewritten docs/examples,
API Keys and Playground have zero errors/warnings. Admin equivalent changed-file
lint: **0 errors / 1 pre-existing unused-import warning**, versus **3 / 1** before.
Admin validation uses the existing temporary native Next flat-config workaround;
repository ESLint configuration is untouched. These results do not waive the
pre-existing repository-wide lint release gate.

During initial implementation, one Phase 2A emulator rerun timed out while both production builds were running;
rerunning without concurrent builds passed all 49 tests, including the new
telemetry-denial assertions. No timeout or test assertion was weakened. The initial
six-route static assertion was the expected maintenance failure described above;
after its narrow correction the full Phase 2A suite passed. Final tracked/new-file
whitespace checks pass. No dependency installation, lockfile change or staging.

## Remaining work / release gates

The R5A remaining-list API policy/history implementation is addressed as far as
current requirements permit. The pre-existing Admin traffic listener/rules gap
means this review cannot certify all original-list feature work as complete.
The two product decisions above were resolved by the approved R5C requirements;
Free Trial is separately deferred, not an R5B policy decision. This is local
implementation evidence, not production certification or a new audit of every
historical client-list item.

Retain real-browser E2E at actual Customer/Admin/API origins, production provider
and deployment targets, Node 22 support, `NEXT_PUBLIC_ADMIN_APP_ORIGIN`, API origin,
existing frontend lint/configuration debt, production secrets, coordinated
`API_QUOTA_CUTOVER_AT`, PayMongo sandbox verification, sibling reporting-source
packaging, catalog/report scale gates and catalog audit/backfill/rollout gates.
Retain account/key-listener scale, runtime timezone, R3 catalog conflict resolution,
reservation backfill and the R3 rollout/write freeze explicitly as release gates.
Add history composite-index readiness, actual timestamp/data-shape/retention and
bounded-query scale verification. Do not certify auth/history production-ready
without authorized deployed-origin E2E and deployment checks.
The Admin telemetry read-path/rules mismatch must also be resolved through an
explicitly approved follow-up before certifying that report surface.

## Final pre-commit review

All 26 R5B files were reviewed. Unexpected functional removals: zero. The large
diff is DOCUMENTATION/EXAMPLE REPLACEMENT, SAFE SHARED EXAMPLES EXTRACTED,
DUPLICATE API UX REMOVED, MISLEADING POLICY COPY REMOVED and DEAD/STALE CODE.
ADMIN CONSUMER UI REWORKED is limited to accurate inventory/status/account-usage
labels and error handling. Creation, one-time secret display, revocation, quota,
Products, Playground, docs, Admin inventory and the distinct active-holder metric
remain. No dependency/lockfile, auth-navigation, quota enforcement, credential,
catalog/import, payment/subscription or Storage changes were introduced.

Review corrections: Customer API error documentation now distinguishes the actual
503 activation hold from 429 quota/IP limiting. The notes above explain account
overrides versus abuse limiting, legacy provenance limits and the pre-existing
Admin telemetry permissions mismatch. Seventeen focused
tests were added: both token owners, malformed decoded UIDs, additional caller
identity selectors, API-key-only rejection, lower daily overrides/expired Pro,
actual clipboard handlers with deferred success/failure, and telemetry snapshot
wiring. Runtime authorization/enforcement behavior was not changed.

Remaining Consumer matches are compatibility route/component names, internal
Customer role aliases/comments, historical reports and explicit statements that
key names are NOT downstream identities. Misleading active UI labels: zero.
Completeness matches are qualified limitations or unrelated canonical-product
refresh semantics. R5B did not enforce a one-per-day rule; R5C now enforces only daily key generation.

**R5B HISTORY FIRESTORE INDEX: PRODUCTION DEPLOYMENT GATE.** This review does not
authorize deployment or establish production readiness.

Final frontend review: Customer and Admin standalone TypeScript and production
builds pass again. Customer changed-file lint remains 10 pre-existing errors / 5
warnings; Admin equivalent lint remains 0 errors / 1 pre-existing warning. No new
lint findings. Backend syntax and all functional/rules tests pass. Review runs
used only isolated fixtures, local demo emulators, or synthetic temporary build
configuration. No dependency install or real environment-file copying occurred.

Final review disposition: **R5B SAFE FOR LOCAL COMMIT**. Remaining R5B local-commit
blockers: none. All 26 files remain unstaged and uncommitted; tracked diff remains
+197 / -1,088. Tracked and new-file whitespace checks pass. The pre-existing Admin
traffic permission gap is documented for an authorized follow-up, not silently
fixed or misrepresented as working. Release gates remain outstanding. The two
original client decisions are now resolved above by R5C.
