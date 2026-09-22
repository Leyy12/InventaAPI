# Production release and rollback runbook

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
