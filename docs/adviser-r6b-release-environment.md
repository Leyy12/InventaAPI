# R6B — release environment and deployment readiness

Local code/config audit only. Base: `84fe6f33115ec67f29e6f9e8837959e281ce44a4`.
Observed `origin/master`: `ac3908401fac5732192ac364600c7f397a3a6af6`.
No production access, deployment, index deployment, catalog migration, payment
call, Storage activation, commit or push is part of this phase.

## Corrections within R6B

- Both Next configurations validate production public configuration and Node 22.
  The Next command phase controls this guard, so `NODE_ENV=test` cannot bypass a
  production build check. Only the development-server phase permits local defaults.
- Customer `/api` and `/daas` rewrites and Admin `/api` rewrites now use the same
  canonical `NEXT_PUBLIC_API_URL` as their direct browser requests, not hardcoded
  localhost. No image settings, feature, entitlement or quota policy changed.
- The R0 validator now requires Customer's R5A Admin origin, removes the obsolete
  Superadmin UID requirement, checks Customer-origin equality and requires an
  explicit supported runtime timezone. It rejects the unsupported root ADC claim.
- Existing broad CORS patterns are documented, not silently tightened or expanded.
  They remain a release-security decision requiring exact authorized origins.
- Correction review: Storage bucket configuration is optional, with no implicit
  bucket fallback in either Web SDK config. Other required fields remain required.
  The deployment plan now preserves R3's protected freeze/audit/backfill order.

## Deployment architecture and Node 22

| Component | Provider evidence / status | Source / commands | Environment |
|---|---|---|---|
| Express API | UNKNOWN. `server.js` checks `VERCEL` before `listen()`; this is adapter awareness, not a confirmed provider/project. No provider manifest or CI deploy workflow. | Repository root: `npm ci`; `node --check server.js`; preflight below; `npm start` starts `node server.js`. Serverless adapter, route mapping, deploy command and port binding require provider evidence. | Backend runtime contract below. |
| Customer | UNKNOWN. Generic Vercel README guidance is not a target declaration. | Full checkout available; `npm --prefix dashboard ci`; `npm --prefix dashboard run build`; `npm --prefix dashboard start` uses port 3000. | Customer public build/start config. |
| Admin | UNKNOWN. No provider manifest. | Full checkout available; `npm --prefix admin-panel ci`; `npm --prefix admin-panel run build`; `npm --prefix admin-panel start` uses port 3001. | Admin public build/start config. |
| Firestore | Firebase/Firestore CONFIRMED by `firebase.json`; actual project/alias UNKNOWN. | Root `firestore.rules`, `firestore.indexes.json`; explicit project and resource-only commands below. | Operator identity/project authorization, not frontend credentials. |
| Scheduled Functions | Firebase Functions CONFIRMED by `firebase.json`; actual deployed project/runtime UNKNOWN. | `functions/`; `npm --prefix functions ci`; `npm --prefix functions run build` is `node --check index.js`. Managed scheduled runtime, not an Express start command. | Managed service identity and operator project. |

`.nvmrc` and the release validator declare Node 22.x for the repository. Both
frontend production configs enforce that contract. Root/Customer/Admin packages
have no `engines` field; no tracked provider configuration proves their runtime.
Root `google-auth-library@11` requires Node >=22. Functions explicitly declare
`engines.node=22`. No Docker runtime or CI Node selection is tracked. Node 22.20.0
local clean installs/builds prove local compatibility, **not provider support**.
Every actual provider must explicitly select and demonstrate Node 22 build/runtime
support. For Functions, the deployment request is declared; live runtime selection
and project capabilities were not inspected.

No tracked `.firebaserc`, Firebase Hosting target, Storage target, Vercel deployment
manifest or other authoritative frontend/API provider target was found. Functions'
generic deploy script is not project-specific authority and was not executed.

## Firestore index and resource readiness

R5B `services/api-history.js` queries `api_telemetry` using owner equality
`userId == actor.uid`, then `timestamp DESC`, then document ID DESC, with limit 51
to return at most 50 entries and `hasMore`. The tracked COLLECTION-scope index has
exactly `userId ASC`, `timestamp DESC`, `__name__ DESC`. JSON parses; no duplicate
indexes or unrelated index changes. **CONFIGURATION READY; DEPLOYMENT STILL REQUIRED.**

R6A queries global `api_telemetry` ordered by timestamp DESC/document ID DESC with
limit 500 and no owner filter. No additional custom composite index is required
under default single-field indexing. Tracked `fieldOverrides` is empty. An
untracked live timestamp-index exemption would require operator correction;
production state has not been queried.

After explicit authorization only, from a full checkout with the independently
verified project, proposed resource-specific commands are:

```text
firebase deploy --project <OPERATOR_PROJECT_ID> --only firestore:indexes
firebase deploy --project <OPERATOR_PROJECT_ID> --only firestore:rules
firebase deploy --project <OPERATOR_PROJECT_ID> --only functions:downgradeExpiredSubscriptions
```

These are a plan, not executed actions. Wait for index readiness before route
activation. `firebase.json` points to the intended rules/indexes and Functions
codebase only. It does not activate `storage.rules` or Hosting. Product images
remain URL-only; dormant Storage rules remain undeployed.

## Origins, navigation and CORS

All origins must be canonical scheme + host + optional non-default port, with no
credentials, trailing slash, path, query or fragment. Production requires HTTPS,
non-loopback, non-placeholder origins. The operator supplies actual values; this
document selects none.

| Operator input | Consumed configuration | Uses |
|---|---|---|
| `CUSTOMER_APP_ORIGIN` (checklist label only) | Equal backend `DASHBOARD_URL` and `NEXT_PUBLIC_APP_URL` | Payment redirects and product/DaaS Customer action links. |
| Actual Admin HTTPS origin | Customer `NEXT_PUBLIC_ADMIN_APP_ORIGIN` | R5A validates configured origin and navigates to fixed `/login`, with no token/query credential. Separate cross-origin Admin login is expected; no SSO claim. |
| `BACKEND_API_ORIGIN` (checklist label only) | Both apps' `NEXT_PUBLIC_API_URL` | API-key/history/Admin traffic, subscription, checkout/status, catalog, contact, Playground and Next rewrites. Not browser-user editable. |

Public environment values are fixed at build time. Supply the same contract when
loading Next production start config; a runtime-only value change cannot rewrite
already-baked browser bundles. Development localhost helpers remain in source,
but production builds cannot omit the required inputs and rely on those defaults.

| Route group | Origin / credentials | Methods | Allowed headers |
|---|---|---|---|
| `/daas/v1` API-key surface | `*`; noncredentialed; API-key authentication still required | GET, POST, PUT, DELETE, OPTIONS | Content-Type, Authorization, x-api-key |
| Customer bearer `/api` routes | Existing restricted matcher, echo accepted origin; credentials true; no-Origin accepted | GET, POST, PUT, PATCH, DELETE, OPTIONS | Content-Type, Authorization, x-api-key, Idempotency-Key |
| Admin bearer routes including R6A | Same restricted matcher, NOT DaaS wildcard; independent authoritative Admin check | Same as Customer | Same as Customer |
| PayMongo webhook | Same application CORS; server-to-server no-Origin accepted; signature/raw-body/mode verification remains authority | Application CORS methods; actual webhook route POST | Same application headers; provider server-to-server calls do not need browser preflight |
| OPTIONS | CORS handles preflight before limiter/body parsers/auth routing; browser bearer preflight permits Authorization | Route-group methods above | Route-group headers above |

`server.js`'s exact localhost/127.0.0.1 ports 3000/3001 have DEVELOPMENT intent but
are currently allowed in all modes. `/\.vercel\.app$/` is a BROAD PATTERN often
associated with PREVIEW; it does not identify an owned preview or production
deployment. `/^https:\/\/inventa/` is a BROAD PATTERN, not an exact owned-domain
allowlist. No verified PRODUCTION EXACT origin exists in this configuration.
Both patterns can accept domains not controlled by the operator. No environment
variable currently configures this list: setting `CORS_ORIGIN` does nothing.

Before release, obtain exact Customer/Admin production origins and the deliberate
preview/staging policy, then review the necessary exact allowlist change and
positive/negative preflight tests. Do not treat possession of a Vercel suffix or
an `inventa` prefix as authority. Do not deploy a guessed tightening that could
break unknown existing clients. R6B neither broadens nor certifies this policy.

## Complete sibling-source packaging contract

| Frontend | Direct sibling source | Required transitive/type source | Reason |
|---|---|---|---|
| Customer | `services/reporting.js`, `services/auth-navigation.ts` | `services/reporting.d.ts`, `services/product-contract.js`, `functions/subscription-lifecycle.mjs` | Report mapping/types and shared auth/entitlement navigation. |
| Admin | `services/reporting.js`, `services/auth-navigation.ts` | Same three files | Report mapping/types and authoritative-auth UI state helpers. |
| Both Next configs (build/start only) | `scripts/frontend-release-config.mjs` | `scripts/validate-release-config.mjs` | Public config/runtime guard and trusted rewrite destinations. |

Customer import sites: `src/lib/reports.ts`, Firebase auth context, root page,
signup, AuthEntry, LoginModal and LayoutWrapper. Admin import sites:
`src/lib/reports.ts`, Admin auth context, login and AdminLayoutWrapper.
The reporting module imports product-contract; auth-navigation imports the pure
subscription-lifecycle module. These shared modules do not import Firebase Admin,
read server secret env or import `functions/index.js`. Build scripts use Node
utilities but are not imported from either `src/` tree or exposed via Next `env`.

Both Next configs preserve `turbopack.root = resolve(process.cwd(), '..')`.
Run the app's build with its app working directory (e.g. `npm --prefix dashboard
run build`) while retaining the complete checkout. A provider's app-root setting
is acceptable only if it actually retains and permits access to parent sources;
do not assume that behavior. An app-only source upload is incomplete. No standalone
output/tracing override is currently configured. The selected provider must also
prove its deployed artifact includes the files required to load production config
and serve the built app. A successful local build is not runtime artifact proof.

Both apps: **PROVIDER CONFIG REQUIRED** despite successful full-checkout local
builds. Isolated app-only simulations and build evidence are recorded below.

## Environment contract (names only)

| Variable | Type | Required where | Purpose |
|---|---|---|---|
| `NODE_ENV` | Server non-secret, runtime/build | Backend mode; Next command chooses production guard | Production payment mode versus isolated test mode. |
| `API_PORT` | Server non-secret, runtime, optional | Non-serverless API | Listen port; default 5000; provider must supply compatible binding. |
| `VERCEL` | Provider-managed, non-secret, optional | API startup | Suppresses `listen()` only; not target proof. |
| `FIREBASE_AUTH_MODE` | Server non-secret, preflight | Root validator | `service_account_env` supported; not an initializer switch. |
| `FIREBASE_PROJECT_ID` | Server identifier, runtime | Root backend | Admin SDK project. |
| `FIREBASE_CLIENT_EMAIL` | Server identifier, runtime | Root backend | Service identity. |
| `FIREBASE_PRIVATE_KEY` | SERVER SECRET, runtime | Root backend | Secret-store injected Admin credential; never frontend. |
| `PAYMONGO_SECRET_KEY` | SERVER SECRET, runtime | Backend payment routes | Matching test/live credential; never frontend. |
| `PAYMONGO_WEBHOOK_SECRET` | SERVER SECRET, runtime | Backend webhook/checkout config | Endpoint- and mode-matched signature secret. |
| `DASHBOARD_URL` | Server non-secret, runtime | Backend checkout | Canonical Customer origin. |
| `NEXT_PUBLIC_APP_URL` | Public/non-secret, backend runtime | Backend action links | Same exact Customer origin; not a frontend runtime read despite name. |
| `TZ` | Server non-secret, runtime/preflight | Backend instances performing subscription term calculation | Operator-approved stable calendar timezone. |
| `API_QUOTA_CUTOVER_AT` | Server non-secret, runtime | Operator-coordinated release; runtime omission holds safely | Proven-new-account exception; same value across instances. |
| `NEXT_PUBLIC_API_URL` | PUBLIC CLIENT, build + config load | Customer and Admin | Canonical API origin and rewrites. |
| `NEXT_PUBLIC_ADMIN_APP_ORIGIN` | PUBLIC CLIENT, build + config load | Customer | Fixed safe Admin login navigation. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | PUBLIC CLIENT, build + config load | Both apps | Firebase Web SDK key, not Admin secret. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | PUBLIC CLIENT, build + config load | Both apps | Firebase Auth domain. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | PUBLIC CLIENT, build + config load | Both apps | Browser Firebase project. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | PUBLIC CLIENT, optional build configuration | Neither app requires it | Optional SDK bucket hostname; omitted/empty means the option is omitted. Supplied values retain shape validation. URL-only images; no upload authorization or Storage deployment. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | PUBLIC CLIENT, build + config load | Both apps | Firebase sender identifier. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | PUBLIC CLIENT, build + config load | Both apps | Firebase Web app identifier. |
| `NEXT_TELEMETRY_DISABLED` | Build tooling, non-secret, optional | Next tooling | Disable build-tool telemetry; not app authority. |

Functions use managed Firebase identity, not the root private-key contract.
Root `database/firebase.js` supports the environment triple or a local credential
file fallback; it does NOT implement application-default identity. R0's contrary
documentation was corrected and the validator now rejects that selection. Do not
package the fallback credential file. Run backend preflight before importing the
server; R6B does not add a server startup hook or change initialization semantics.

No active use of `NEXT_PUBLIC_SUPERADMIN_UID` remains after R5A. `JWT_SECRET` and
`DAAS_API_KEY` are unused constants in imported legacy auth middleware, not current
release credentials. Legacy PostgreSQL `DB_*` is outside the active Firestore
route path. `NEXT_PUBLIC_DAAS_API_URL` is text in a generated consumer integration
example, not an application env read. Generic shell/npm/SDK-managed environment
is not a new required application contract. No secret values belong in this table.

Firebase Web settings and existing development defaults are public, not leaked
Admin credentials. Actual authorized domains, user/role checks, Firestore rules,
service identity permissions and deployed origin E2E remain security boundaries.

## Payment mode and secret handling

`paymentConfiguration` accepts test-prefixed secret keys in non-production and
live-prefixed keys only in production. Webhook event, fetched checkout/payment
and intent `livemode` must match the configured mode. One `PAYMONGO_SECRET_KEY`
name is used with different secret-store values; there is no second live/test env
name. `PAYMONGO_WEBHOOK_SECRET` must belong to the matching endpoint/mode. Success
and cancellation destinations derive from `DASHBOARD_URL`: success uses
`/dashboard?payment=success&order=<server-order-id>` and cancellation uses
`/?payment=cancelled`. These are fixed Customer paths, not arbitrary user URLs.

Use separate test-mode validation before any live release. **PAYMONGO SANDBOX E2E
OPEN**. No PayMongo request was made. Secret scan results are local/source and
synthetic-build evidence, not an inspection of deployed secret stores. No real
environment file or credential file was read or copied. No NEXT_PUBLIC variable
is intended to contain a server secret. Error formatting reports names, not values.

## Quota cutover and timezone

`API_QUOTA_CUTOVER_AT` accepts canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`; date parsing
must round-trip exactly. No production value is selected. It is a trustworthy
operator assertion, not a browser field or entitlement toggle.

- Before a future cutover, the immediate-init exception is inactive.
- At equality, no account can be both created strictly after cutover and no later
  than now; equality does not establish a new-account exception.
- Afterwards, only authoritative Firestore document `createTime` strictly after
  cutover and no later than now permits immediate initialization without a shared
  counter. A client field/legacy per-key count does not qualify.
- Missing/invalid/ambiguous evidence holds the account until its transactionally
  recorded next UTC midnight; then normal shared counter enforcement activates.
  Existing authoritative counters are not reset by changing the cutover value.
- Select a coordinated instant no earlier than the confirmed removal of all
  legacy quota consumers. Never backdate. All instances use the identical value.

API request counters and R5C generation windows use UTC days and next UTC midnight.
Payment event times/leases use instants, epoch arithmetic or ISO timestamps; they
do not acquire a local-calendar day by display locale. The one active server term
extension calculation in `functions/subscription-lifecycle.mjs` deliberately uses
`getDate/setDate` to add 30 **runtime-local calendar days**; DST can change elapsed
hours. R6B does not convert this to fixed hours or select a new timezone. UTC and
America/New_York lifecycle regressions preserve the distinction.

Legacy string parsers (`dateMillis`, payment retry dates and shared report date
mapping) use JavaScript Date parsing. An offset-free legacy date-time string can
therefore depend on the runtime/browser timezone. New payment/entitlement writes
use ISO instants; do not assume every historical record does. Preserve timezone
and include ambiguous legacy dates in the separately approved data-quality review;
R6B neither rewrites historical dates nor introduces a new parsing policy.

The expiry scheduler explicitly runs at 16:00 UTC daily (`0 16 * * *`, region
`asia-southeast1`). It normalizes expired instants; API enforcement does not wait
for it. Region, PHP currency and the developer's local timezone do not prove a
Philippines production calendar. **PRODUCTION RUNTIME TIMEZONE: OPERATOR DECISION
REQUIRED.** Establish current business/runtime semantics and keep the chosen `TZ`
consistent on every term-calculating backend. Verify actual provider support.

## R5C rollout, clocks and growth

All key-creation backends must converge before activation. Git shows the Express
writer and an unrelated expiry Function, not the complete deployed instance fleet.
Inventory every old replica, background writer and alternate privileged endpoint.
Stop/drain old writers externally; an R3 control flag or Firestore client rule
cannot stop an old Admin SDK writer.

Rules-first under a verified external freeze is the safest sequence: browser
access to daily marker documents is denied, then all backend instances switch.
Backend-first or rules-first WITHOUT a freeze is not a bypass-proof mixed-version
strategy. Admin SDK bypasses client rules, so an old create-key backend can ignore
the marker regardless of rule order. Keep the freeze until convergence is proven.
The marker and new key are written atomically; key revocation must not delete the
day's marker. The cutover concerns quota initialization, not retroactive counting
of all legacy key-generation activity.

Every serving backend must have trustworthy synchronized system clocks. No tracked
provider config proves managed time synchronization; require operator/provider
evidence and UTC-boundary validation. No NTP infrastructure is introduced.

Structural growth is approximately one small marker per successful account-day
generation. No production volumes are assumed. Correctness requires no cleanup;
the collection grows. **MARKER RETENTION: POST-RELEASE/OPERATIONS DECISION** unless
measured scale warrants an earlier gate. No TTL/deletion is implemented; any later
policy must preserve active-window evidence and account for skew/retry safety.

## Proposed deployment order — NOT EXECUTED

The [reviewed R3 rollout](adviser-r3-catalog-import-integrity.md#mandatory-production-rollout-gate-not-executed)
is authoritative for catalog migration safety. This is the single combined sequence;
it does not replace R3's detailed audit/reservation checks.

1. AUTHORIZE / PREPARE: obtain release authorization, recovery evidence, target
   owners, verified deployment targets, immutable artifacts and confirmed operator
   inputs (origins/CORS, Node 22, clocks, timezone, secret stores and coordinated cutover).
2. EXTERNAL FREEZE + DRAIN: freeze external catalog mutations, key creation and
   legacy quota-consuming traffic; inventory and stop/drain every old privileged
   writer. Preserve webhook deliveries under the coordinated payment plan.
3. PROTECTED WRITER FREEZE: apply reviewed maintenance/browser-denial and marker
   protections as required, then explicitly set `catalog_control/writer.frozen=true`
   through approved privileged operator tooling. Verify the canonical writer refuses
   mutations while frozen. Old writers must already be drained: they can bypass it.
4. REQUIRED FIRESTORE INDEXES: deploy approved indexes, including R5B history, to
   the explicitly verified project and wait until ready. Do not deploy Storage.
5. AUDIT FROZEN CATALOG: run separately authorized R3 tooling against the complete
   frozen catalog/reservations; identify historical canonical-identity and reservation
   conflicts. No unresolved conflict may proceed to backfill or activation.
6. RESOLVE HISTORICAL CONFLICTS: obtain explicit operator/owner-approved resolutions;
   no silent merges or invented survivor. Re-export and re-audit corrected records.
7. RESERVATION BACKFILL: use approved privileged R3 tooling while frozen, respecting
   caps and transaction constraints. Independently re-audit actual reservations and
   verify the control document still has `frozen=true`; record checkpoints and
   restart/idempotency/recovery evidence before deployment of the writer stack.
8. DEPLOY COMPATIBLE RELEASE STACK WHILE STILL FROZEN: deploy backend/API, shared
   catalog writer and approval, approved compatible Functions, final compatible
   Firestore rules if not already applied, then Customer and Admin frontends. Supply
   validated origins/config and complete sibling packaging. Do not enable normal writes.
9. VERIFY ALL-INSTANCE CONVERGENCE: prove no old key-generation backend or privileged
   catalog writer remains; R5C enforcement must converge on all instances before it
   is considered active. Verify provider clocks, origins/config and marker denial.
10. SMOKE / E2E WHILE FROZEN: verify auth, Admin/Customer, API-key management,
    history, Admin traffic, reports, catalog reads and approved payment sandbox evidence.
    Approval/import mutation checks must confirm intended frozen rejection in the
    target. Successful mutation/concurrency E2E belongs in a representative isolated
    environment; do not lift the production freeze merely to run those tests.
11. ACCEPTANCE: complete release certification review and confirm no unresolved
    blockers; obtain explicit owner acceptance of data, config, E2E and recovery evidence.
12. LIFT FREEZE: only after acceptance, set `catalog_control/writer.frozen=false`
    through approved tooling, resume approved writers/traffic and monitor. On any
    failed gate KEEP WRITES FROZEN until coordinated forward-fix/recovery is verified.

Backfill is dependency-injected privileged operator tooling, NOT a browser or HTTP
endpoint. It does not require the new Customer/Admin applications to be deployed
first. Admin SDK backfill is not blocked by browser maintenance/marker-denial rules.
Those protections may be applied early while frozen; final compatible rules/writers
must be present before the freeze is lifted. Rules alone cannot stop an old Admin
SDK key-creation backend, so R5C all-instance convergence remains mandatory.

R3 scale gates remain OPEN: bounded catalog scan maximum 5,000 products; atomic
backfill maximum 400 reservations plus its control-document write; representative
payload/throughput/contention/retry/cost validation; and the shared global catalog
control document's scale/contention gate. Larger migrations require separately
reviewed tooling. Sequencing is not production migration or scale certification.

## Rollback compatibility

| Area | Classification | Constraint |
|---|---|---|
| R3 reservation/shared writer | COORDINATED/FORWARD-FIX REQUIRED | Old direct writers can bypass claims after backfill. Revert data/code/rules only under the certified frozen migration plan; Git revert is not data rollback. |
| R5B history route/index | COORDINATED/FORWARD-FIX REQUIRED for the feature pair | Keep the index while any active route uses it. An additive unused index can independently remain (safe); removing it first breaks queries. Roll UI/route back together to a known secure version; do not restore browser telemetry access. |
| R5C daily marker | COORDINATED/FORWARD-FIX REQUIRED | Old create-key code bypasses the new daily policy. Preserve marker evidence and rules; no single-replica rollback or delete-to-reset. |
| R6A Admin traffic | COORDINATED/FORWARD-FIX REQUIRED | Reverting only backend breaks the new UI; reverting UI to direct Firestore conflicts with denied rules. A deliberate unavailable state is safer than reopening browser telemetry reads; coordinate the secure UI/API contract. |

Record prior and proposed artifacts, config versions and data compatibility before
release. R6B does not certify rollback against production data or authorize it.

## Exact operator input checklist

- [ ] Backend/Customer/Admin providers, project/service IDs, regions, immutable
      artifact locations, full-checkout build strategy, runtime artifact contents,
      start/adapter/port settings and exact owner-approved deployment commands.
- [ ] Node 22 build and runtime evidence for each actual provider, including Functions.
- [ ] Exact Customer/Admin/API HTTPS origins; identical Customer backend aliases;
      required `NEXT_PUBLIC_ADMIN_APP_ORIGIN`; Firebase authorized domains and exact
      production versus owned-preview CORS policy with a reviewed allowlist change.
- [ ] Verified Firebase project/target and operator/service permissions; intended
      Functions schedule/region; explicit rules/index deployment authorization and
      index readiness evidence (including absence of conflicting live exemptions).
- [ ] Public Web SDK config for both builds; backend service-account secret-store
      injection. Secret names only: `FIREBASE_PRIVATE_KEY`, `PAYMONGO_SECRET_KEY`,
      `PAYMONGO_WEBHOOK_SECRET`. Do not paste secret values into chat.
- [ ] Correct PayMongo mode, endpoint/signing-secret mapping, webhook URL and
      delivery/retry preservation; sandbox E2E evidence before live authorization.
- [ ] Business-approved runtime `TZ` with evidence of preserved calendar behavior;
      coordinated canonical `API_QUOTA_CUTOVER_AT`, all-instance configuration and
      reliable clock synchronization evidence.
- [ ] Complete backend/writer fleet inventory, external freeze and convergence
      proof; R3 production audit/conflict/backfill/re-audit certification and owner.
- [ ] Query/listener/catalog/report scale and operational budgets, marker-growth
      monitoring owner; retention is optional unless measured scale dictates otherwise.
- [ ] Deployed-origin browser E2E, lint-debt disposition, rollback/forward-fix drill,
      monitoring/stop criteria and explicit final release authorization.

## Local validation record

Validation uses Node 22.20.0 and fresh temporary non-secret repository copies.
All four workspaces passed `npm ci` from their existing locks; dependencies and
lockfiles were not modified. The initial sanitized Windows runner omitted required
shell variables; correcting its environment allowed clean installs. This was not
a dependency or source failure. Public registry/font downloads are not provider or
production service access. No backend/Admin SDK initializer was invoked.

| Local check | Result |
|---|---|
| Clean install | Root, Customer, Admin, Functions: PASS from existing locks. |
| Full checkout Customer | Production build WITHOUT Storage bucket PASS (18 static pages); TypeScript PASS. |
| Full checkout Admin | Production build WITHOUT Storage bucket PASS (11 static pages); TypeScript PASS. |
| Actual installed Firebase Web SDK initialization | Both apps with bucket omitted and supplied: Auth, Firestore and the pre-existing Storage handle initialize successfully. Network guards observed zero network attempts; no bucket operation performed. |
| Strict app-only Customer and Admin | Expected FAIL loading missing sibling build helper. |
| App-only plus build scripts, without services/functions | Expected FAIL resolving auth-navigation/reporting in BOTH apps. This independently proves the application sibling dependency. |
| Missing API config, even with `NODE_ENV=test` | BOTH actual Next production builds reject config before compilation. |
| Generated rewrite manifests | Both use the synthetic configured API origin; no hardcoded localhost destinations. |
| Browser artifact scan | Customer 30 + Admin 23 JS artifacts; zero server-secret variable, private-key, PayMongo-key, Admin-SDK or injected server-sentinel matches. Synthetic API origin present as expected. |
| Tracked textual source scan | 315 files, zero private-credential patterns; public Firebase Web defaults are not secrets. Synthetic fixtures/placeholders are not production credentials. |
| Changed Next/Firebase config lint | Customer 0 errors/0 warnings; Admin equivalent native-flat Next rules 0/0. Existing Admin FlatCompat/full lint debt is not repaired or certified here. |
| Backend/tooling syntax | `node --check` for server and both release helpers: PASS. No Admin SDK initializer executed. |
| Functions build | Existing syntax-only build: PASS. No scheduler invocation. |

Fresh full-checkout builds used temporary directory
`inventa-r6b-5c74fc41a2d1448bbaa5a43e236e89f8`; separate source/dependency copies
in `inventa-r6b-app-only-82165b1541194c0baab6aae5d0caacff` held no service/function
siblings. Both reside outside the repository under the Windows temporary directory.
The app-only failures are deliberate negative controls, not unresolved full-checkout
build failures. The npm wrapper initially failed on the regression invocation;
the installed npm CLI entry point ran the complete requested suites successfully.

The two-blocker correction adds nine focused tests: omitted/supplied/malformed
optional buckets, unchanged required Auth/Firestore fields, both actual initializer
sources with isolated SDK doubles, no active upload implementation, and the explicit
R3 freeze/audit/backfill/deployment/acceptance order. An initial R2B documentation
assertion required its existing exact declaration; restoring "R2B is URL-only"
resolved that documentation-only failure without weakening the regression test.

Final Storage search: `firebase/storage` and `getStorage` occur in the two existing
Web SDK configs; no new initialization was introduced. `ref`/`uploadBytes` remain
only in the previously reviewed unmounted `AdminProductTable.tsx` and unimported
Customer `page.tsx.backup`. No active product upload/delete path, no configured
Storage deployment target, and no required bucket configuration. A supplied bucket
is public SDK compatibility configuration only, not activation/authorization.

| Suite | Passed | Rules passed |
|---|---:|---:|
| R6B | 47 | — |
| R6A | 113 | — |
| R5C | 68 | — |
| R5B | 144 | — |
| R5A | 150 | — |
| R4 | 115 | — |
| R3 | 168 | 32 |
| R2B | 56 | — |
| R2A | 116 | 95 |
| Phase 2B2 | 98 (66 + 16 UTC + 16 New York) | 35 |
| Phase 2B1 | 122 | 36 |
| Phase 2A | 62 | 55 |
| Phase 1 | 22 | — |
| R0 config | 9 | — |

Total: **1,543 passed; 0 failed; 0 skipped; 0 cancelled**. All five rules suites
used isolated local demo-project emulators, not production Firebase.
`git diff --check` passes. Nothing is staged. Ten tracked files are modified and
three new files are untracked. The correction adds only the two Web SDK optional
bucket configuration edits to the previously reviewed file set; no dependency,
lockfile, feature policy, Firestore index or rule change. All work remains uncommitted.

Production provider packaging, actual secrets/domains, production Firestore index
deployment, broad CORS resolution, timezone/clock proof, scale, PayMongo sandbox,
R3 migration, deployed-browser E2E and coordinated rollback/release certification
remain open. Local readiness is not production certification.

**R6B READY FOR FINAL CHATGPT REVIEW.**
