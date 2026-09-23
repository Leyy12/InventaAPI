# R5C — final requirement alignment

Base: `8408a4dad4cfe10b8fd05b77fd33b9a4f01dc602` (R5B).
Branch: `adviser/r5c-final-requirements`.
Production reference at safety check: `ac3908401fac5732192ac364600c7f397a3a6af6`, unchanged.
R5C remains uncommitted for ChatGPT review.

## Final decisions

- **RESOLVED — 1 per day:** one successful API-key generation per authenticated
  account per UTC calendar day. Never one API request/day.
- **RESOLVED — Consumer Name:** use **Key Name**, the request-time key alias in
  history. No downstream Consumer registry in current scope.
- **RESOLVED — Landing:** first visit per browser/device/profile; returning
  unauthenticated users and successful logout go to Login. R5A code unchanged.
- **RESOLVED — images:** URL-only `image_url` for Admin and Customer submissions.
  No Firebase Storage upload workflow. Avoids adding Storage object/egress costs
  and upload lifecycle; external hosting may still cost money.
- Free Trial: **DEFERRED / OUT OF SCOPE**.

The [authoritative system flow](system-flow.md) contains all accepted flows and
is the final visual/paper source. Physical paper artifact: **NOT UPDATED**.

## Pre-edit audit of creation and lifecycle

Both Customer `/dashboard/api-keys` and `/dashboard/products` submit to
`POST /api/v1/api-keys/generate`, wired in `routes/apikeys.js` to
`createApiKeyHandlers().create` in `services/api-key-management.js`.
Bearer Firebase ID token is verified with `checkRevoked=true`; UID comes solely
from the verified token. Request owner/plan/date fields cannot select authority.
Name, `users/{uid}`, account/deletion barriers, authoritative entitlement and
selected canonical `products` scope are validated. Account is rechecked in the
creation transaction, including plan/segment changes since preflight.

`issueCredential()` preserves the 16-random-byte selector and 32-random-byte
secret: `daas_v2_<selector>.<secret>`. `api_keys/{selector}` stores only the SHA-256
credential hash plus safe prefix/version and existing scope/metadata. Only the
successful creation response returns the raw credential. Lists/views remain
allowlisted metadata; v2 comparison remains constant-time. Legacy plaintext-key
authentication compatibility and its fail-closed collision handling are unchanged.

Before R5C, creation read the account and candidate key in one Firestore
transaction and wrote only the key. No separate maximum-key-count policy exists;
the existing 500-product scope cap is not a key-count cap. DELETE revokes instead
of deleting; scope replacement/rename do not regenerate credentials. `audit_logs`
receives only action, UID, key ID and time after mutation; audit failure is swallowed
to avoid replay. `account_api_usage` is read for metadata but creation does not
consume/reset it. Existing expired-plan normalization remains unchanged.

Repository audit found no separate Admin/operator Customer-key creation endpoint
or tool. Admin inventory/security surfaces read existing keys. Historical diagnostic
scripts can change existing statuses using privileged SDK credentials; none was run
or changed. There is no new bypass. The existing authenticated create handler
applies this allowance to every caller it already authorizes; no role/body switch
exempts Admin tokens or allows creating for another UID.

## Atomic daily generation

Server clock supplies the UTC date on **each transaction attempt**, including
optimistic retries. Window is 00:00:00.000 through 23:59:59.999 UTC. Marker:
`api_key_generation_days/{sha256(tokenUid)}_{YYYY-MM-DD}`. Hashing bounds the path
and prevents UID/day delimiter ambiguity; it is an identifier, not a credential.
The marker contains only `userId`, `window`, `keyId`, `createdAt`, `nextEligibleAt`.
No secret, credential hash or browser data enters it.

Ordinary backend wall-clock time is authoritative: **production backend clocks
must be trustworthy and synchronized**, including across instances. Day, key
`createdAt`, marker `createdAt` and `nextEligibleAt` come from one captured Date
inside each transaction callback. On a conflict, the discarded attempt writes
nothing; the retry captures a new Date and rebuilds all those fields together.
The winning callback's captured UTC day defines the generation day (not HTTP
response arrival time). An attempt begun before midnight may be charged to the
prior day if it commits without retry; a retry after midnight uses the new day.
No mixed-day key/marker metadata survives. Backend time accuracy remains an
operational assumption, not a client-controlled parameter.

After rechecking the account, the transaction reads the deterministic marker and
candidate key. An existing marker fails closed. Otherwise key and marker are
written in the same transaction. Contention retries the transaction: one winner,
other callers receive 409 `API_KEY_DAILY_GENERATION_LIMIT` and server-derived next
UTC midnight. No scan or historical lookup is used. One marker per successful
account/day is retained as audit evidence; no TTL/cleanup job is introduced.
Retention/scale remains an operator release consideration; never remove a current
day marker to refund a generation. Account deletion already preserves protected
quota/financial evidence and leaves these server-only markers inaccessible too.

Invalid/auth-denied/blocked-account/scope-denied/collision/aborted attempts do not
write either record. A committed key consumes allowance even if subsequently
revoked, deactivated, lost, or the response cannot reach the browser. An ambiguous
transport outcome must not be presented as permission to bypass the marker;
retry will consult durable state. No permanent secret-recovery API exists.

Firestore rules explicitly deny all browser reads/writes for markers, including
Admin. Existing authoritative key writes remain server-only. Local emulator tests
exercise get/list/create/update/delete denial for owner, other Customer, anonymous
and Admin identities. No production rules deploy or database access occurred.

## Clean cutover

Enforcement begins with activation of R5C backend behavior, across **all** serving
instances; a mixed-version rollout cannot guarantee the rule. Existing keys are
neither counted retroactively nor deleted/revoked. No migration or invented
historical markers. First successful post-activation generation consumes that
server UTC day's allowance even if an older key was created earlier that day.
Existing markers must survive restarts/rollbacks; removing them is not a supported
refund path. This generation rollout is independent of `API_QUOTA_CUTOVER_AT`.

**Rollout order:** all serving key-creation backends must use R5C before feature
activation. Drain/block key-generation traffic during the coordinated transition
if old instances cannot otherwise be excluded. Deploy the marker-denial rules as
part of that compatible backend/rules release, verifying access remains denied
throughout. The prior catch-all already denies this collection; the new explicit
match documents and tests that policy. Admin SDK transactions remain authorized
through server IAM, not browser rules. Do not roll back to a serving pre-R5C
creator while claiming the daily rule remains active. Markers must be retained.

Repository inventory establishes Express `server.js` and its one mounted
`/api/v1/api-keys/generate` path, but not the production provider, replica count,
traffic routing or rollout mechanism. Those must be supplied and verified by the
operator; no claim of production-wide enforcement is made from local tests.
Marker growth is one small document per successful account/day, with no cleanup
introduced. Retention, storage cost and access to audit evidence are operational
release inputs; they are not a reason to remove current-day enforcement evidence.

Selector collisions preserve the existing 503 `KEY_COLLISION` behavior: no
internal credential-generation retry is implemented. The caller may make a fresh
request with a newly random selector; only its successful commit consumes the day.

## UI and preserved contracts

Both generation forms explain once per account per UTC day; API Keys also states
it before opening the modal. One-time save/copy/download behavior remains.
409 generation denial is distinguished from API request 429 and IP throttling;
valid `nextEligibleAt` is displayed explicitly in UTC. Malformed timestamps fall
back to the safe next-UTC-reset message. Browser clock is not an enforcement input.
Revocation remains available, with a warning about losing the only usable key
after spending today's generation allowance. Clipboard failure keeps the secret
visible; history, token storage and navigation are unchanged.

Request policies remain Free default 50/UTC month with existing lower account overrides,
Pro 5,000/day, Enterprise unlimited; account-level quota is shared across keys.
The existing 60/minute IP limiter, request cutover hold and subscription semantics
remain. Generation does not emit fake request telemetry. R5B history retains its
50-record bound, owner isolation and request-time Key Name. Misleading active
Consumer labels remaining: zero; compatibility names and explanatory non-identity
text are not a downstream registry.

## Validation

Deterministic Node 22 runner: `npm run test:adviser:r5c`, fixed import allowlist,
no Firebase/PayMongo SDKs or external networking. Uses optimistic transaction
fixtures (with real conflicts/retries), injected backend time and actual UI-handler
execution with synthetic dependencies. Phase 2A real rules checks use only the
cached local emulator and a demo project.

Two prior tests explicitly allowed same-day key regeneration. Their generation
expectations are updated to the approved R5C policy; their original request-quota
assertions remain. No baseline test removed or skipped.

Final Node **22.20.0** results (all zero failed / zero skipped):

| Suite | Passed | Rules passed |
| --- | ---: | ---: |
| R5C | 68 | Four new marker-denial cases included in Phase 2A rules below |
| R5B | 144 | — |
| R5A | 150 | — |
| R4 | 115 | — |
| R3 | 168 | 32 |
| R2B | 56 | — |
| R2A | 116 | 95 |
| Phase 2B2 | 98 (66 + 16 UTC + 16 New York) | 35 |
| Phase 2B1 | 122 | 36 |
| Phase 2A | 62 | 53 |
| Phase 1 | 22 | — |
| R0 configuration | 9 | — |
| **Combined** | **1,381 passed / 0 failed / 0 skipped** | Included in total |

Customer standalone TypeScript and production build: **PASS** in a temporary
copy using cached dependencies and synthetic application configuration, with no
real environment-file copying or dependency installation. The sandbox initially
blocked Google Fonts; the authorized rerun fetched public fonts and completed all
18 routes. No source/font workaround was used. Admin is untouched; no Admin build
required in R5C.

Changed-file lint: **0 new findings** against the exact R5B base. Products retains
3 pre-existing errors / 4 warnings; API Keys, API docs and the new presentation
helper have 0 errors / 0 warnings. Comparison accounts for line-number shifts
using rule, severity, diagnostic summary and affected source line. Existing lint
debt remains a release gate; this is not a claim that global lint is clean.
Backend/runner/loader syntax checks and `git diff --check`: **PASS**.

No changes to request-quota enforcement, credential helper, history backend,
subscription lifecycle, IP limiter, Admin source, dependency versions or lockfiles.
All R5C files remain unstaged. Final pre-commit review adds eight narrow behavioral
tests: September/year/leap boundaries, independent handler instances and restart,
pending commit response ordering, post-commit serialization failure/retry, and
key-record deletion without marker refund. No application behavior changed during
this review. Phase 2A and R5B test changes are **EXPECTED POLICY ALIGNMENT**;
security and shared-request-quota assertions remain intact.

Final review outcome: **R5C SAFE FOR LOCAL COMMIT**. All 18 files reviewed;
unexpected functional removals: zero; unrelated changes: zero; remaining
local-commit blockers: none. The 1,381-test result above was rerun after review
additions. Customer standalone TypeScript, production build (18 routes), changed-file
lint comparison and backend syntax passed again; no new lint findings. Admin was
untouched. No files staged and no commit created.

Storage clarification: both pre-existing Firebase configs still export an unused
Storage SDK handle; the legacy AdminProductTable uploader remains unimported and
unmounted. Neither was introduced or activated by R5C. Active Admin/Customer product
flows remain URL-only, and `firebase.json` still has no Storage deployment target.
The system-flow Mermaid was reviewed structurally; no rendered or printed artifact
was generated, and no deployed-origin browser certification is claimed.

## Release gates, separate from feature alignment

Admin traffic permission gap; history index deployment; actual production
origins/provider configuration and `NEXT_PUBLIC_ADMIN_APP_ORIGIN`; Node 22 support;
sibling-source packaging; catalog/report/history/listener/marker retention scale; secrets;
PayMongo sandbox; production `API_QUOTA_CUTOVER_AT`; runtime timezone; R3 production
audit/conflict resolution/backfill/write freeze/rollout; browser E2E at actual
deployed origins; release certification; existing lint debt. R5C adds the all-instance
backend rollout, compatible marker-rule ordering, synchronized backend clocks and
marker-retention requirements described above. These are not fixed or certified by R5C.

Remaining original-list decisions: **NONE**. Remaining original-list feature
implementation: **NONE** under the approved requirements. Production remains gated.
No commit, push, merge, deployment, production Firebase, live PayMongo, Storage
upload or Free Trial work is authorized in this implementation phase.
