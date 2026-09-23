# Production release and rollback runbook

## Free Trial integration review candidate

The separate [Free Trial integration contract](adviser-free-trial-integration.md)
defines one-time seven-day Pro Trial access, 500 total account-wide requests,
owned-segment authority and rules/backend/frontend coordination. It is local
review work only, not authorization to deploy. Existing release gates remain.

The [final client quota contract](adviser-free-trial-quota-contract.md) grants
Free accounts 50/UTC month before their one-time Trial (lower caps retained).
At Trial expiry OR 500-request exhaustion, protected API access and new key
generation require paid Pro; existing key records and Customer application
access remain. A later paid expiry returns a used-Trial account to Upgrade
Required. The contract also specifies the approved monthly migration hold.
Coordinate restrictive rules
and all backend instances; do not infer a monthly opening balance from daily
history or reuse the earlier daily cutover timestamp. No production value or
migration is authorized by these local integration changes.

The [Phase 2 client TODO implementation](adviser-free-trial-integration.md#phase-2-client-todo-implementation--uncommitted)
adds the `monitorFreeTrials` scheduled Function and Admin/Customer UI changes.
Its Day-4 copy warns that API access pauses until paid upgrade; the scheduled
Function is not the entitlement authority.
Before any separately authorized release, verify the Resend Secret Manager
binding and sender, run the Functions-scoped config preflight, and exercise
email/notification delivery in an isolated non-production environment.
Uncertain sends older than 23 hours require manual provider-evidence review;
never blindly retry them. No new composite Firestore index is required.

Production is not the first test environment. Every production batch must be a
reviewed atomic unit and must complete all gates below. Do not infer deployment
targets from source-code comments or provider-generated environment variables.

## Current tracked deployment inventory

`firebase.json` currently represents:

- Firebase Functions source: `functions/`;
- Firestore rules: `firestore.rules`;
- Firestore indexes: `firestore.indexes.json`;
- local Firestore emulator configuration.

It does not represent Firebase Hosting for either frontend or Cloud Storage rules.
Although `storage.rules` exists, it is not a deployable resource in the current
`firebase.json`. R2B establishes MODE A — URL-ONLY: no active product-image
upload workflow. Do NOT deploy `storage.rules` or add a Storage deploy target for
this release. That dormant file contains incorrect cross-service calls and has
no Storage emulator certification. See [R2B media architecture and monitoring](adviser-r2b-media-storage.md)
for reachability evidence, external-image costs and operator monitoring inputs.

No `.firebaserc`, Express backend provider manifest, Customer dashboard deployment
manifest, Admin panel deployment manifest, or CI deployment workflow is tracked.
`server.js` contains Vercel-aware startup logic and the Customer dashboard README
contains generic Vercel guidance, but neither establishes an authoritative
production target. Those targets remain explicit release inputs documented in
`docs/release-environment.md`.

## Required gate for every production batch

R6B's [environment inventory, packaging proof, deployment sequence and operator
checklist](adviser-r6b-release-environment.md) is the detailed local-readiness record.
Both frontends require the repository sibling sources and build-only validation
scripts. Run `npm --prefix dashboard ci` / `npm --prefix dashboard run build` and
the equivalent `admin-panel` commands from a full checkout; app-only source uploads
are incomplete. Configure public origins before building and preserve them for
Next startup. No real provider/project/hostname or deploy command is inferred.

The root backend must pass its release validator before `npm start`. R0's claimed
application-default root credential path was incorrect; it is now rejected by the
validator. Use the implemented environment credential triple. Functions use their
separate managed identity. Explicit operator-approved `TZ` preserves the existing
subscription calendar behavior; do not pick or change it during deployment by accident.

For the current capstone release, keep `NODE_ENV=production` and explicitly set
`PAYMONGO_MODE=test`. Supply a PayMongo Test Secret Key (`sk_test_`) and the signing
secret for the matching Test Mode webhook endpoint. Run backend validation with
`--mode=production`; that option governs application runtime/origins, not payment
mode. Missing/invalid `PAYMONGO_MODE` or a mismatched key fails closed.
Real money: **NO**. Live mode is **DEFERRED UNTIL COMMERCIAL LAUNCH** with separate
authorization; do not enable it as a side effect of a production build/deployment.
Before a future mode/key change, resolve outstanding orders through the existing
review/recovery process; do not relabel stored orders or replay cross-mode events.
Keep `DASHBOARD_URL` equal to `NEXT_PUBLIC_APP_URL` and validate the fixed success
and cancel routes. [R6C](adviser-r6c-paymongo-mode.md) preserves webhook security;
real PayMongo sandbox E2E remains a separate gate and was not executed locally.

R5C marker retention is a post-release operations decision without contrary scale
evidence. Markers are small and correctness does not require cleanup. Measure
growth/cost; do not add TTL/deletion casually or delete current-day evidence.

`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` is optional for both frontend builds. Supplying
it only configures the existing Web SDK; it does not authorize an upload workflow
or Storage deployment. Product images remain URL-only.

Admin traffic permission gap: **CLOSED AT CODE LEVEL** by
[R6A](adviser-r6a-admin-traffic.md), not production-certified. The Admin browser
uses an authenticated backend latest-500 snapshot; browser telemetry access stays
denied. Validate actual-origin CORS/auth/query behavior in deployed browser E2E.
Admin traffic query cost, multi-operator concurrency and retention remain a
**PRODUCTION SCALE GATE**. No polling or retention policy is introduced.

Keep the R5B history index deployment and R5C all-backend coordinated rollout,
marker-rule ordering, backend clock synchronization and marker retention/growth
gates open. Also retain actual origins/targets, `NEXT_PUBLIC_ADMIN_APP_ORIGIN`,
Node 22 provider support, shared-source packaging, catalog/report/listener scale,
lint debt, PayMongo sandbox, production secrets/config, `API_QUOTA_CUTOVER_AT`,
runtime timezone, R3 production audit/conflict resolution/reservation backfill and
write-freeze rollout, deployed-origin browser E2E, rollback validation and final
release certification. R6A resolves none of these deployment gates.

1. Fetch `origin/master` without modifying the working tree.
2. Stop if production moved from the reviewed SHA; do not reconcile automatically.
3. Reconcile the adviser branch against the newly reviewed production state.
4. Verify the correct branch and a clean working tree.
5. Run all relevant isolated unit/regression suites.
6. Run Firebase and Security Rules emulator suites for affected resources.
7. From clean installs, run frontend TypeScript, lint, and production builds.
   The reviewed Dashboard baseline currently reports 52 lint errors and 27
   warnings in unchanged source. This is pre-existing lint debt surfaced by the
   full gate, not an R0 source regression; it remains a release blocker until
   separately remediated.
8. Run relevant browser E2E against an isolated non-production environment.
9. For payment changes, pass PayMongo test-mode/sandbox validation; never use a live key as a test fixture.
10. Complete ChatGPT review of code, tests, configuration, and release scope.
11. Create the reviewed local commit; do not silently add later changes.
12. Record the current production Git SHA and deployed artifact/version identifiers.
13. Obtain explicit production authorization for this exact batch.
14. Merge or fast-forward the reviewed commit into `master` using the approved strategy.
15. Push the authorized `master` update.
16. Deploy the complete coordinated batch to the verified targets; do not independently enable coupled backend, frontend, rules, indexes, or entitlement changes. Separate providers are not atomic: use the batch-specific write-freeze/transition plan.
17. Run immediate, narrow production smoke tests without destructive data or live payment side effects.
18. Monitor application errors, authentication, quota, rules denials, webhook delivery, latency, and resource usage for the approved observation window.
19. If acceptance or monitoring fails, execute the reviewed rollback/revert procedure below and record the incident.

## R6D index reconciliation — local only, not deployed

The operator-supplied `production-indexes.json` snapshot contained nine composite
indexes. Eight matched the prior tracked set semantically; production alone had
the legacy `notifications` COLLECTION index ordered by `user_email ASCENDING`,
`is_read ASCENDING`, `created_at DESCENDING`, `__name__ DESCENDING`. Preserve that
exact index for release safety, independently of the camelCase notification index.
Its ongoing necessity may be reviewed after the capstone; **no production index
deletion is authorized in this release**.

The desired tracked set is now **10 indexes**: all nine snapshot indexes plus the
R5B `api_telemetry` COLLECTION index (`userId ASCENDING`, `timestamp DESCENDING`,
`__name__ DESCENDING`). Comparison accounts for Firestore's implicit final document
name ordering; `fieldOverrides` remains empty. Against this snapshot, expected
additions: **1**; expected deletions: **0**. No indexes were deployed by R6D.
The snapshot is temporary read-only operational evidence, not a tracked release file.
Before a separately authorized deployment, recheck target `inventaapi-db` and the
current production index set; stop if the deployment proposes unrelated changes
or any deletion. Storage and other release-resource configuration are unchanged.

## Rollback

### Code/config-only release

Before deployment, record the pre-release Git SHA and every provider artifact or
deployment identifier. Revert or redeploy the complete prior code/config/rules
unit, using the provider-specific procedure approved before release. Confirm the
rollback with the same smoke checks and monitoring. The concrete deploy command
must come from the verified target owner; this repository does not yet establish it.

### Data/schema mutation release

A Git rollback does not reverse written data, account entitlements, counter state,
Storage objects, or schema migrations. Such a batch must not receive production
authorization until it has an explicit forward migration, backup/restore plan,
idempotent rollback or compensating migration, owner, dry-run evidence, and stop
conditions. Roll back application compatibility first only when the migration plan
proves the earlier code can safely read the post-migration data.

## Atomic deployment reminders

- Phase 2A backend, Customer frontend, and Firestore rules are one coordinated unit.
- Payment checkout, webhook fulfillment, entitlement writes, and checkout UI are one unit.
- Customer submission, Admin review, publication rules/indexes, and both frontends are one unit.
- Quota configuration and backend enforcement are one unit.
- Only if separately approved managed uploads are introduced: media UI, Storage
  rules, object lifecycle, and cleanup behavior must be one reviewed unit.

## R3 catalog transition

Follow the [R3 frozen audit/backfill and coordinated rollout gate](adviser-r3-catalog-import-integrity.md)
before enabling catalog writes. Stop old privileged writers and browser mutations;
the new catalog_control flag alone cannot freeze old backends. After draining them,
explicitly set `catalog_control/writer.frozen=true` with approved privileged operator
tooling and verify canonical writes are denied. Resolve historical identity conflicts
explicitly, backfill/re-audit reservations, then deploy all shared writers and final
compatible rules while still frozen. Earlier reviewed maintenance/marker-denial rules
may protect the frozen transition; they do not prevent approved Admin SDK backfill.
Use the single reconciled [12-step R6B sequence](adviser-r6b-release-environment.md#proposed-deployment-order--not-executed),
with R3 authoritative for migration details. Backfill is not a browser/HTTP endpoint
and does not require deploying the new frontends first. Pass the frozen checks,
isolated mutation/concurrency E2E and acceptance before setting
`catalog_control/writer.frozen=false` and resuming approved writers.
Archived/deleted/retired identities remain reserved. Never roll back to an uncoordinated
direct writer against the new claims. On failure KEEP WRITES FROZEN until a coordinated
forward-fix/recovery is verified. Production migration/deployment was not executed.

### Frozen export tooling (R7C — not production authorization)

The [R7C exporter contract](adviser-r7c-frozen-exporter.md) provides a standalone
read-only exporter with explicit project/database/credential confirmation, boolean
freeze checks, two-pass completeness/stability checks and a 5,000-product cap.
Its identity source is `product_submission_identity`; the 400-reservation backfill
limit is not an export limit. It does not establish the external freeze or perform
audit repair/backfill. R7C ran locally only; production has NOT been exported or
audited by this work. Production invocation still requires a later review and
authorization gate. Capture/reconcile actual deployed rules before designing the
temporary maintenance rules; do not substitute repository rules without that check.

### R8C frozen repair and missing-only migration (local implementation only)

R8C has NOT executed production repairs, backfill, deployment, or unfreeze. Production
execution requires separate authorization after review. Maintain the browser freeze
and privileged-writer maintenance window throughout. Never run seed/import/cleanup
tools concurrently. The operator target is explicitly `inventaapi-db`, database
`(default)`; credentials must be supplied by absolute file path and their project
metadata must match. No ADC, implicit CLI project, environment credential bootstrap,
emulator or proxy override is supported. Never commit credentials or release evidence.

The six human decisions are fixed in `scripts/frozen-catalog-repair.mjs`:

| Exact document ID | Authorized change only |
| --- | --- |
| KWusUA5m2FEP6Y5fQQx6 | x-o: set missing segment to `Grocery` |
| W3dRbwFB91ehYNr0XPVr | stick-o: set missing segment to `Grocery` |
| MZwdfSGk0ZPl6sihK1Ya | DOLFENAL: collapse identical variants to stored variant 0 (price 6.5) |
| S0SuWh7m289ND8oUBZge | Biogesic: collapse identical variants to stored variant 0 (price 4) |
| jpjrb14dyZY4jQARduq9 | GLUCOPHAGE: retain 500mg/Tablet/16.5; remove duplicate priced 18.5 |
| oDKhLkR5wfA5DfzVf1oP | SOLMUX: retain 500mg/Capsule/11; remove duplicate priced 12.5 |

The withdrawn `Biscuits & Wafers` segment decision is not used. R3 segment and
identity rules are unchanged. No generic document, patch, price, field or value
arguments exist. The repair source must be the reviewed local R8 export whose SHA-256
is `0627226fd3a9c4726b0081c01150de112632fd4483a9e007ceec6fdc3fd3788c`.
The CLI rejects any other export bytes. The entire stored data of all six documents
is compared to that source, including all unrelated fields and nanosecond timestamps.
All six updates are one transaction after all six before-states and the boolean
freeze have been checked. Only segment/variants fields are updated. No product is
deleted; unrelated data, publication state, timestamps, images and descriptions
remain unchanged. Each repaired document and the freeze are read again afterward.
All-six-already-repaired is a verified no-op; mixed/partial or unexpected state aborts.

For a later authorized run, invoke `node scripts/migrate-frozen-catalog.mjs` with:

- `--operation repair` or `--operation backfill` (one operation per invocation).
- `--project inventaapi-db --confirm-project inventaapi-db`.
- `--database "(default)" --confirm-database "(default)"`.
- `--credentials <absolute service-account JSON path>`.
- `--evidence-dir <new absolute directory, parent already exists>`.
- Repair only: `--source-export <absolute reviewed R8 frozen export path>`.

Evidence directories must not already exist. Durable `started.json` and `before.json`
precede mutation; `after.json` and `complete.json` are written only after readback.
Keep every directory, especially an uncertain attempt. A commit can succeed even
when its response, postcheck, or evidence write fails. On any failure, KEEP FROZEN,
inspect actual persisted state and reconcile evidence before any explicit retry.
The repair's before/after records include full snapshots and the exact changed fields.
No credential contents or SDK exceptions are logged.

After repair, run the unchanged R7C exporter to a NEW artifact and unchanged R3 audit.
Require zero structural/identity/reservation/hash conflicts before backfill. Backfill
re-audits the complete <=5,000-product catalog and existing claims inside each
transaction; it selects only missing required claims, in deterministic ID order.
The hard limit is **400 new claims per invocation**, plus one control-fence write.
Explicit reads of the selected absent claim documents prevent overwriting a racing
creator. Existing valid claims retain every stored field, including original metadata;
retired/deleted claims retain the unchanged R3 treatment. No products are mutated.

Each successful invocation reports `attempted`, `created`, `alreadyValid`, `conflicts`
(zero on success), `remaining`, and `frozen`. `alreadyValid` counts required bindings
present before that transaction, excluding unrelated historical tombstones. Conflicts
abort before mutation, rather than producing misleading success counts. Remaining is
independently re-audited after commit; concurrent authorized batches can reduce it
further. Operators should run sequentially and reconcile each decrease. The control
fence serializes batches; transaction retries reselect current missing claims. A fully
completed retry is a no-op. Partial batches clear any stale completion timestamp;
only the final batch records completion. No success is claimed if postcheck fails.

Repeat with a new evidence directory until `remaining=0`; never increase the 400 cap.
A 1,634-claim synthetic fixture completes as 400/400/400/400/34, but real counts must
come from audit results. Firestore transaction payload/time limits still apply; an
oversized/failed batch stops without a partial commit and needs review, not a cap
override. Finish with another NEW frozen export and unchanged R3 audit proving zero
missing claims and conflicts, then retain the freeze for the next release gate.
