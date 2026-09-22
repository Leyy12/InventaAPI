# R6A — Admin traffic permission remediation

Scope: `adviser/r6a-admin-traffic`, based on R5C
`3f265e59c3e3b4b317308cbab26898a590a36c99`. Safety fetch confirmed
`origin/master` at `ac3908401fac5732192ac364600c7f397a3a6af6`.
No production access, migration, deployment, commit or push is part of this phase.

## Original blocker and consumer inventory

At the base, `AdminDashboardClient` subscribed directly to `api_telemetry`.
Firestore has no matching allow rule; default deny correctly rejects this browser
query even for Admin. Source tracing and local emulator denial assertions reproduce
the permission mismatch; this is not a claim of a production browser reproduction.
All active Admin traffic consumers are in that component and its pure R4 helper.

| Surface at base | Source | Direct browser read? | Authorization | Bound | Fields used |
| --- | --- | --- | --- | --- | --- |
| Recorded requests card | Shared telemetry listener | Yes | Admin UI gate; rules deny | Latest 500 | timestamp |
| Successful outcomes card | Same listener | Yes | Same | Same | timestamp, success |
| Average latency card | Same listener | Yes | Same | Same | timestamp, latencyMs |
| UTC-hour traffic chart and sample annotations | Same listener → `telemetryReport` | Yes | Same | Same | timestamp, success, latencyMs |

Product, account, key-holder and audit sources are not telemetry consumers and are
unchanged. No other active Admin source reads `api_telemetry` after R6A (recursive
source assertion). Customer history is a separate account-scoped maximum-50 API;
its query, index and authorization are unchanged.

## Final authority and data contract

Admin browser → existing Firebase session Bearer header →
`GET /api/v1/admin/traffic` → `verifyIdToken(token, true)` → authoritative
`users/{verified UID}` profile → bounded Admin SDK query → minimal projection →
unchanged R4 `telemetryReport` calculations.

The route requires a case-insensitive stored Admin role and the shared
`accountBlocked` barrier. Missing profiles, Customer/non-Admin roles, disabled,
deleted, deleting and pending-deletion profiles fail closed. Neither token role
claims nor browser state grant authority. No query/body lookup, filter, role, UID,
page, cursor or limit is accepted. The profile is read again after the telemetry
query to catch role/deletion changes during that read. This is a per-request check,
not continuous authorization or a claim of atomic revocation after the response.

Responses are `Cache-Control: no-store`. Missing/invalid/revoked identity gives
401; verified but unauthorized profile gives 403; unsupported parameters give 400;
unexpected profile/query failure gives sanitized 503 `ADMIN_TRAFFIC_UNAVAILABLE`.
No raw Firestore message, index URL, stack, project identifier or diagnostic payload
is returned or logged by this handler.

Success envelope: `success`, `limit: 500`, `records`. Each record contains exactly:

- `timestamp`: normalized recorded ISO time, or null when unavailable/invalid;
- `success`: recorded boolean, otherwise null;
- `latencyMs`: recorded finite nonnegative number, otherwise null.

R4's Date, Firestore Timestamp and parseable legacy recorded-string support is
preserved. Numeric epochs are not invented into dates. Invalid dates remain null,
invalid rows count as excluded in R4, and unknown outcomes/latencies do not become
zero. Finite aggregate behavior remains the existing tested R4 implementation.

The writer currently includes owner UID, API-key ID/name, endpoint, method and
status code alongside these measures. None is needed for this Admin report and
none is returned. Current inspected writers do not add IP/user-agent; any such
historical fields are withheld by the allowlist anyway. Document IDs (potentially
legacy credentials), secrets, selectors, hashes, Firebase tokens, Authorization,
headers, request metadata, payment data and environment data cannot pass through
arbitrary document spreading. The frontend projects the three fields again before
storing them in component state. Credentials are sent only in the Bearer header.

## Query, sample and scale limits

The database query orders by actual `timestamp DESC`, then document ID DESC, and
applies `limit(500)` before fetching. No full-collection fetch or pagination exists.
Stable response sorting puts valid times newest first and invalid dates last while
preserving query order for ties. Firestore excludes missing timestamp fields from
an ordered query; malformed timestamp types can occupy sample slots. The response
does not fill gaps, synthesize dates or assert a complete historical window.

This is a global bounded recorded sample, independent of the catalog segment
filter. It is not total API usage, complete daily traffic, uptime, health, growth,
or a prior-period comparison. Recording is not assumed to capture every request.
R4 aggregation/report source and all catalog/product behavior remain unchanged.

Each snapshot returns at most 500 telemetry documents and performs two Admin
profile reads, plus Firebase token/revocation verification. Actual billed query/index
reads, latency and multi-Admin concurrency require representative measurement.
Reads occur once on authorized report mount and on manual refresh; no periodic
polling or real-time traffic listener remains. Existing unrelated listeners remain.
No retention/TTL policy is introduced; bounded reads do not bound collection growth.

**ADMIN TRAFFIC SCALE: PRODUCTION SCALE GATE.** Retention, index availability,
sample quality, billing and expected concurrent operators require release review.
No production-scale test or history-index deployment occurred.

## UI, failures and races

Loading, data, empty and error remain distinct. Only a successful ready response is
aggregated. Errors clear the previous sample and show unavailable/retry, never
measured zero/no traffic/healthy. The chart retains latest-500/sample/no-comparison
labels and explicitly says global snapshot, entry/manual refresh, not real-time.

The request uses the existing Admin Firebase user and `NEXT_PUBLIC_API_URL`.
Missing production API configuration fails without sending a token; only development
uses the existing loopback default. Production origin configuration is still an
operator-owned release gate. R5A Admin-app origin/auth/navigation behavior is untouched.

Refresh has a ten-second bound, abort and generation guards. Newest refresh wins;
late successes/errors after logout, account switch, timeout or unmount cannot
publish a sample. Firebase current-user identity is checked before token acquisition,
after token acquisition and before publication. Cleanup permanently stops that
controller. The parent retains its auth/profile gate and UID-keyed report mount.
An HTTP 401/403/5xx, network or malformed response becomes a report error only;
R5A auth provider remains solely responsible for session invalidation/recovery.
No traffic failure calls sign-out or changes browser auth storage.

## Rules and validation

`firestore.rules` is unchanged. Customer and Admin browser get/list/create/update/
delete of telemetry stay denied. The existing localhost-only demo-project Rules
suite adds two R6A cases, exercising each operation against seeded/new documents.
Admin SDK authority is tested independently through injected service fixtures.

`npm run test:adviser:r6a` uses deterministic token/profile/query fixtures and
behavioral request/refresh/report tests, with SDK/network imports blocked and a
sanitized runner environment. Covers auth, role barriers, bounds/ties, unknown
historical measures, safe projection, error sanitization, state/races, request
headers, missing config, no false zeros and source/rules wiring.

Validation completed under Node 22.20.0:

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| R6A | 113 | 0 | 0 |
| R5C | 68 | 0 | 0 |
| R5B | 144 | 0 | 0 |
| R5A | 150 | 0 | 0 |
| R4 | 115 | 0 | 0 |
| R3 / rules | 168 / 32 | 0 | 0 |
| R2B | 56 | 0 | 0 |
| R2A / rules | 116 / 95 | 0 | 0 |
| Phase 2B2 / rules | 98 / 35 | 0 | 0 |
| Phase 2B1 / rules | 122 / 36 | 0 | 0 |
| Phase 2A / rules | 62 / 55 | 0 | 0 |
| Phase 1 | 22 | 0 | 0 |
| R0 config | 9 | 0 | 0 |
| **Combined** | **1,496** | **0** | **0** |

Phase 2B2 includes its 66-test suite plus 16 UTC and 16 America/New_York tests.
The baseline 1,381 increases by 113 R6A tests and two real-emulator rule cases.
No skipped or cancelled tests. Emulator access was localhost/demo-project only.

Admin TypeScript passes (`tsc --noEmit --incremental false`). Production build
passes in the existing temporary validation copy with unchanged cached dependencies
and synthetic configuration, not real `.env` files. The initial sandbox build was
blocked fetching Google Fonts; the network-enabled public-font retry passed.
No dependency installation, upgrade or lockfile modification occurred.

The normal Admin ESLint command encounters the existing FlatCompat circular-config
failure. Equivalent changed-file lint using the installed Next core-web-vitals and
TypeScript flat configs passes: **0 errors, 0 warnings** across the dashboard
component and new traffic helper. Existing lint infrastructure/debt remains a
release gate; R6A does not alter lint configuration.

Backend route/service and runner/loader syntax checks pass. `git diff --check`
passes. Customer files are untouched, so no Customer build was necessary. Local
tests and build checks are not deployed-origin browser E2E or production certification.

## Release status and remaining gates

**ADMIN TRAFFIC PERMISSION GAP: CLOSED AT CODE LEVEL.** The isolated backend and
frontend tests plus real local rules-denial tests pass. This supersedes the open
permission-gap note in the historical R5C review; it does not certify deployment.
Production remains blocked pending the following separate gates:

- R5B history Firestore index deployment; R5C coordinated all-backend rollout,
  marker-rule deployment ordering, synchronized backend clocks and marker retention/growth.
- Actual production Customer/Admin/API origins, `NEXT_PUBLIC_ADMIN_APP_ORIGIN`,
  Node 22 provider support and sibling/shared-source packaging.
- Admin traffic and existing catalog/report/listener scale; existing lint debt.
- PayMongo sandbox, production secrets/config, coordinated `API_QUOTA_CUTOVER_AT`
  and runtime timezone.
- R3 production catalog audit, historical conflict resolution, reservation backfill
  and catalog write freeze/coordinated rollout.
- Real-browser E2E against deployed origins, rollback validation and final release
  certification. Validate CORS and the Admin backend route at the actual origins;
  do not broaden browser Firestore permissions as a workaround.

No quota, daily key generation, credential, payment/subscription, Landing/Login,
Customer history, catalog/import, Storage or Free Trial policy changes were made.
