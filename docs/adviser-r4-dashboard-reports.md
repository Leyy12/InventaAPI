# R4 — Dashboard/report correctness and segment filtering

Base: `a87c3c6076984856a8d03cb7256d70892ca0ce68` (R3); parent R2B:
`77b84a01088318b074f58e06c7d2b571c1eb5f81`. The earlier `a87c3a...` value
was a transcription error, not a repository commit. Production reference:
`ac3908401fac5732192ac364600c7f397a3a6af6`. R4 is not committed or deployed.

## Source-of-truth inventory

| Active surface/widget | Previous source, fields and calculation | Issue | Final source / scope |
|---|---|---|---|
| Customer home: keys | Authenticated API-key list length | Failure became zero | Same backend list; active-status label; loading/error explicit |
| Customer home: requests | `api_telemetry`, userId, local-day timestamp count | Telemetry is not quota; UTC mismatch | Authenticated API-key list `usage`: account scope, used, limit, window, resetsAt, holdUntil |
| Customer home: plan | Auth context refreshed subscription status | Inconsistent unlimited/missing formatting | Existing authenticated entitlement; account quota supplies numeric allowance |
| Customer home: status | Literal 99.9% gateway and operational database/auth | No monitoring source or history | Removed; no uptime claim |
| Customer analytics: product count | `products` via getAllProducts, permissive active flags | Diverged visibility/segment semantics; failures returned [] | One product listener; unchanged Phase 1 projectProduct; scoped report |
| Customer analytics: price buckets | Root price or zero | Ignored variants, invented zero, decimal gaps | Canonical base price; finite nonnegative only; preserved cutoffs |
| Customer analytics: category share | Root segment/category; top eight categories | Inconsistent filter; truncated distribution | Same filtered canonical dataset; all categories, scrollable |
| Customer analytics: stock, inventory value, top inventory | Root stock; price × stock | No inventory ledger/quantity authority | Removed, not inferred |
| Admin catalog / segment share | Server products API fetch plus browser products listener; raw counts | Duplicate reads; error zeros; no dropdown; included unpublished | One authenticated Admin product listener; shared visible-product report and filter |
| Admin active key holders | Distinct userId values of api_keys documents with status active; Admin rules permit these reads | Initial R4 incorrectly substituted customer-account count | Restored distinct active-status holders, legacy and v2 together; existing users dataset excludes orphan/deleted/disabled owners; account-document count remains separately labeled |
| Admin traffic / success / latency | Latest 500 api_telemetry docs; current−1 previous; latency divided by all docs | Fabricated previous; bounded sample mislabeled daily total; unknown samples treated as zero | Latest 500 recorded sample, actual dated UTC hours; valid boolean outcomes and finite latency denominators |
| Admin audit feed | Latest 20 audit_logs, timestamp/action/endpoint/actor | No loading/error distinction | Same source, explicitly global recorded events; independent states |
| Customer/Admin navbar status | Literal Operational | Unmeasured | Removed |
| Admin Settings database status | Literal Connected even on read failure | Unmeasured | Database monitoring: Not configured; Uptime: Not tracked |

Admin home is the active combined dashboard/report surface; there is no separate
mounted Admin reports route. Customer reporting is `/dashboard/analytics`. Product
management, consumer registry and audit management pages are outside this correction.

## Report semantics

`services/reporting.js` is a browser-safe pure module importing only the existing
Phase 1 product contract. Neither product normalization nor write-time pricing is
reimplemented. Both frontends consume this same module via small typed re-exports.
The Phase 1 contract, R3 writer/importer, rules and dependencies are unchanged.

Each product contributes one canonical base price: lowest usable variant price,
with the exact Phase 1 legacy fallback. Missing/malformed/non-finite/negative prices
are excluded from averages/distribution, not counted as zero. Valid zero remains
valid. The published-product count includes visible products lacking a usable price;
the separately labeled priced count and excluded-price count explain the denominator.

Established upper bounds remain 50, 100, 500 and 1000 pesos. Intervals are now
[0,50], (50,100], (100,500], (500,1000], (1000,+∞). Decimal prices no longer fall
between buckets; every valid canonical price contributes once. Labels state the
exclusive lower bounds. Canonical visibility excludes archived, inactive, unpublished,
contradictory and malformed identity states. Unknown segments never become Pharmacy.

Grocery, Pharmacy and Hardware are the only business segments. All segments preserves
the existing overall view for Admin and eligible paid Customer accounts. One selector
controls every product count, price, category and segment widget on a report surface.
Global Admin account/telemetry/audit widgets are explicitly labeled outside that filter.

Free accounts with a valid normalized preference stay restricted to that segment;
the other supported options remain visible but disabled. Missing/invalid preferences
show a neutral support/confirmation message without fetching reports or writing a
preference. The Customer home no longer uses missing selectedSegment as a loading
condition. Unverified entitlement yields an unavailable state, not expanded access.
R4 does not implement signup/first-visit policies or add automatic preference writes.

## Availability, telemetry and quota

All report queries distinguish loading, successful empty data and retrieval errors.
Errors discard prior report data and never render measured zeros. Report selection
belongs to a UID-keyed account session. Transient entitlement verification hides the
report without discarding selection or restarting an already-authorized public-catalog
listener. A verified downgrade synchronously constrains selection to the Free segment;
missing/invalid preference disables the dataset and shows the neutral state. Initial
unverified/missing-preference accounts start no listener. Logout/UID changes discard
the session. Live listeners unsubscribe on unmount.

Traffic is a bounded sample of stored telemetry, not comprehensive request history,
daily quota consumption or service availability. No previous series or growth rate is
generated. Hour keys include the UTC date. Unknown outcomes/latencies are excluded
from their respective denominators; no samples means unavailable. Invalid timestamps
are excluded and counted. Customer daily usage comes only from the backend account
summary, never per-key counters or telemetry. Limits are not hardcoded: current Free
50/day, Pro 5000/day and Enterprise behavior are supplied by the existing backend.
Unlimited/zero limits avoid division by zero. Stale UTC windows become unavailable;
pending clean-window holds do not claim measured zero usage or a fresh allowance.

The home payment-confirmation effect/banner and existing entitlement refresh mechanism
are preserved. No payment, subscription, key generation or quota policy is changed.

## Four pre-commit corrections

The pre-correction review reproduced Pro-to-Free showing 5000/4990 after the plan
changed, and Grocery returning to All after transient verification. Source inspection
also confirmed the static Settings Connected claim and the removed, valid Admin
active-key-holder metric. These were local-commit blockers, not production gates.

Quota is now mounted only while authoritative entitlement is available, keyed by UID
and the verified response identity (serverTime plus subscription fields). Revalidation
immediately removes the old summary. Both downgrade and upgrade require a fresh
authenticated account quota response; plan fields never supply the displayed numbers.
The existing subscription poller is unchanged and is the sole recurring verification
source. There is one quota request per completed verification, no success polling loop,
and unrelated rerenders retain the same key. A 10-second quota-read deadline aborts
hanging requests; errors show unavailable and retry after 30 seconds. Cleanup aborts
requests/cancels timers, and request generations reject late responses, including
after account changes. No hardcoded Free/Pro allowance is used as a fallback.

Active key holders preserves the original DISTINCT userId + status === active
definition across legacy/v2 records, not total keys or total Customer accounts. The
restored summary additionally excludes malformed/missing owners and owners known from
the existing users dataset to be deleted, disabled, pending deletion or otherwise
blocked. It does not inspect credentials, infer subscription validity, or invent key
expiry semantics: the UI explicitly labels active status rather than usable credentials.
Only status/userId from key snapshots enter report state; no key secrets are rendered,
logged or persisted. Both datasets must succeed before a count is shown; empty success
is zero, while loading/error is unavailable. Product reads remain a single dataset.

The final active health-text search finds only Settings Uptime: Not tracked, the
telemetry disclaimer that it is not uptime, and the playground's actual Health Check
endpoint option. Remaining fabricated health claims: zero. No monitoring system was added.

## Fabricated-data search classification

- Active 99.9% / operational labels: removed from Customer home and both navbars.
- Active synthetic previous=current−1 traffic: removed with its legend/series.
- Active stock-based charts: removed; no authoritative inventory quantity exists.
- Unused Admin static segmentData (58/22/20) and generateTrafficData: removed.
- Remaining “sample” labels refer to the actual bounded telemetry sample.
- Test fixtures are deterministic test data and remain; unrelated UI configuration,
  product/import code and legitimate state-update variables named previous are retained.

## Scale and release gates

Product reporting still reads the permitted catalog into one dataset per mounted
report surface. It does not fetch separately per widget or per segment change. This
is not production-scale certification: representative catalog sizes, browser memory,
snapshot update/read cost and aggregation strategy must be validated before release.
The existing Admin users count is also a collection listener; production read cost
requires validation. Restored api_keys and users listeners are PRODUCTION SCALE GATES;
they do not certify production cost or implement API History. Telemetry (500 records) and audit (20 records) are bounded and
their completeness limits are explicit. No analytics backend redesign was introduced.

Both Next builds now resolve the repository parent so they can bundle the actual pure
shared helper and Phase 1 source. Frontend build inputs must include `services/reporting.js`,
its declaration and `services/product-contract.js` as sibling repository files; do not
deploy an isolated frontend source folder without these inputs. No server-only SDK or
credential module is imported by the report helper. Provider configuration, coordinated
release checks and browser E2E remain external certification gates.

## Validation

The isolated `test:adviser:r4` runner permits only reporting/product-contract modules,
the small quota controller, existing entitlement poller and deterministic tests.
SDK/network/configuration imports are denied. It covers
segment scope, missing preferences, canonical price/visibility, every bucket boundary,
error/empty states, account quota, telemetry denominators and active-page wiring.
Final results under Node 22.20.0:

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| R4 | 115 | 0 | 0 |
| R3 | 168 | 0 | 0 |
| R3 rules | 32 | 0 | 0 |
| R2B | 56 | 0 | 0 |
| R2A | 116 | 0 | 0 |
| R2A rules | 95 | 0 | 0 |
| Phase 2B2 (including both timezone runs) | 98 | 0 | 0 |
| Phase 2B2 rules | 35 | 0 | 0 |
| Phase 2B1 | 122 | 0 | 0 |
| Phase 2B1 rules | 36 | 0 | 0 |
| Phase 2A | 62 | 0 | 0 |
| Phase 2A rules | 49 | 0 | 0 |
| Phase 1 | 22 | 0 | 0 |
| R0 | 9 | 0 | 0 |
| Total | 1015 | 0 | 0 |

The prior Phase 2A home wiring assertion was updated to follow the rendered
CustomerUsageSummary component; it still requires authenticated apiKeyRequest and
rejects direct api_keys reads. No behavioral assertion was removed. Rules are unchanged;
there is no unnecessary R4 rules suite. The home payment effect/banner and navbar
subscription notification effect were compared with R3 and are unchanged.

Both frontends passed TypeScript (`--noEmit --incremental false`) and production
Next 16.2.9 Turbopack builds in isolated copies: Customer 17/17 pages, Admin 11/11.
Copies used the existing installed dependencies, no real .env files, synthetic demo
Firebase settings and loopback API/emulator addresses. The restricted Customer build
was initially blocked downloading existing Google Fonts; public-font access allowed
the production builds to pass. An Admin lint-comparison baseline was moved outside
build inputs after it was inadvertently included in a temporary build's type scan;
the actual source typecheck and final clean-input build passed.

Customer changed-file lint is 0 errors / 0 warnings, including the new quota controller.
Admin report/config files also have 0/0. The newly included Settings correction file
retains exactly the R3 baseline's 1 error (react-hooks/immutability, line 20) and 1 warning
(react-hooks/exhaustive-deps, line 21); only neutral health copy changed there. No new
lint findings, dependency upgrades or unrelated lint fixes were introduced.
Customer home/analytics/config baseline: 6 errors /
10 warnings. Admin equivalent flat Next-config comparison: 9 errors / 13 warnings
before, 0 / 0 after for the original report files. The repository's older Admin FlatCompat configuration was not
rewritten; the equivalent comparison uses the installed Next lint rules. Unrelated
lint debt remains outside R4. Repository build output and dependencies were not modified.

`git diff --check` and new-file whitespace checks pass. These checks do not constitute
production browser E2E or reporting-scale certification.

Remaining first-list work: landing/login behavior, API policy/history and final
browser E2E/release certification. Free Trial remains deferred. No commit, push, merge,
deployment, production Firebase access, live PayMongo call or Storage upload.
