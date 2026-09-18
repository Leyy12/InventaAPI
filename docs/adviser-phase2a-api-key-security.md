# Phase 2A — API-key security and account quota

Local review branch: `adviser/phase2a-api-key-security`.
Base: `0da6712171e94f1eec9fda7c24c4a9d0f893a896` (reviewed Phase 1).
Production baseline: `8ee6e71407fc6b792876c7ba6bc50546e50bec64`.
No deployment, production migration, commit, or payment operation belongs to this phase.

## Inspected architecture

- `routes/apikeys.js`: creation verified a Firebase ID token; listing trusted a query user ID, while product updates and revocation trusted a body user ID. Full key documents were returned by listing.
- Issuance combined a timestamp with `Math.random()` and persisted the raw `key` field. DaaS queried plaintext credentials with active status and selected the first match.
- `middleware/planGate.js`: account plan/limit selection, but separate per-key read/reset/write operations. Multiple keys multiplied the daily allowance; concurrent requests could lose increments. Enterprise/Unlimited bypassed finite counters.
- Firestore permitted customer ownership-based direct key reads and writes. Customer API-key pages, dashboard counts, playground autofill, and privacy revocation depended on those paths. Admin consumer/security dashboards only read keys.
- Account deletion requests mark user metadata and revoke keys; entitlement cleanup is a separate lifecycle concern. The SQL `routes/filtered-products.js` path is not mounted by the active server.

## Management boundary

All six management handlers verify `Authorization: Bearer <Firebase ID token>` with revocation checking and derive identity from the verified `uid`. Supplied user IDs cannot authorize anything. Missing/invalid tokens return 401; another owner's document returns 403. IDs and editable metadata are validated.

The supported operations are create (`POST /generate`), list (`GET /`), metadata view (`GET /:id`), name update (`PATCH /:id`), product scope replacement (`PATCH /:id/products`), and revoke (`DELETE /:id`). DELETE remains a soft revoke; it never deletes account usage. No customer operation can assign status, ownership, credential material, plan, counters, or expiry. Revoke does not require a valid quota entitlement, so owners can revoke even when entitlement data needs repair.

Scope changes verify products and the current Free account segment. The transaction rechecks ownership and clears embedded legacy `linkedProducts` snapshots so removed IDs cannot remain authorized through Phase 1's compatibility fallback. Partial-variant selection remains authoritative over whole-product input. Current catalog projection remains unchanged.

## Credential design and compatibility

New credentials are `daas_v2_<128-bit random selector>.<256-bit random secret>`, using `node:crypto.randomBytes`. The selector is the Firestore document ID; the document stores version 2, a SHA-256 digest of the full credential, and a non-secret display prefix. High random entropy makes an unkeyed digest appropriate here; these are not human-chosen passwords. Comparison uses `timingSafeEqual` on equal-length digests.

Only a successful create response contains the raw new credential. List/view use an explicit metadata allowlist and never return raw keys or hashes. Responses are `no-store`. Customers must save the initial secret; there is no recovery endpoint. Customer playground autofill/reveal controls are removed; manual use of a saved credential remains available.

Legacy `daas_...` credentials still use the existing plaintext field without rewriting documents. Exactly one matching document must exist. Versioned syntax never falls back to legacy lookup; a document carrying secure credential markers cannot authenticate using a leftover plaintext field. Malformed/unknown version syntax and duplicate legacy values fail closed.

Legacy plaintext and any pre-existing credential exposure remain residual risks: this is compatibility, not rotation, migration, or retroactive remediation. Existing read-only Admin key access is retained and therefore still includes legacy plaintext. Raw credentials are excluded from new audit entries and SDK error responses. Application request logging omits query strings. Legacy `?apiKey=` transport remains accepted for both credential formats so existing integration URLs keep working; first-party UI uses `x-api-key` only. Upstream infrastructure URL logging must also be reviewed before release. User-initiated clipboard, `.env`, and Postman exports intentionally contain the creation-time secret on the customer's device; server persistence never does for new credentials.

## Authoritative status and account usage

Authentication requires exact `status: active`, a valid owner ID, and an unexpired credential if `expiresAt` exists. Both ISO/Date and Firestore Timestamp expiry are supported. No subscription-expiry field is used, and no expiry schedule is added.

Every admitted DaaS request runs a Firestore transaction that reads the key, `users/{uid}`, and `account_api_usage/{uid}` before writing. It revalidates ownership, credential, state, optional credential expiry, account existence, account entitlement, and paid-endpoint eligibility. The same transaction consumes one account unit and updates per-key diagnostic usage/last-used fields. Those per-key fields never determine the allowance.

The authoritative entitlement remains `users.plan` and `users.apiRequestLimit`; client plan claims, key snapshots, and `subscription_status` are ignored. Free/Starter and Pro/Professional use the validated account number (including zero). Existing Enterprise/Unlimited semantics remain unlimited, with usage still recorded. No account entitlement is modified. Unknown/malformed entitlement fails closed instead of guessing a default.

The daily counter records a UTC date window, count, and next midnight. Server time determines rollover, not a client/reset timestamp. Malformed/future windows and invalid counts fail closed. All of an owner's keys share this counter; issuing, revoking, deleting, or replacing a key does not reset it. Separate accounts have separate counters. Failed transaction commits do not admit requests; contention retries re-read the state. A request admitted before a later revocation may finish, while subsequent admissions fail. As before, admission consumes quota even if downstream catalog processing later fails.

## Firestore and rollout review requirements

- Customer clients cannot read or write `api_keys` documents. Trusted Admin reads remain; all authoritative mutations use backend Admin SDK handlers.
- Clients cannot create/update/delete `account_api_usage`; only Admin reads are allowed. Existing account plan/quota write protections remain unchanged.
- Backend, customer frontend, and rules changes require coordinated release. Until the hardened rules are deployed, old direct-write permissions remain a bypass. Nothing has been deployed here.
- Missing counters no longer grant a fresh deployment-day allowance. The fail-closed cutover below supersedes the initial implementation's zero-balance initialization. No production backfill or migration was performed.
- Account plan versus UI subscription flags and any Enterprise numeric display mismatch remain Phase 2B consistency work. Admin per-key counters remain diagnostics, not shared quota displays. Analytics has not been redesigned.

## Final-review cutover decision

Historical `requestsUsed` and `resetAt` cannot reconstruct a reliable opening balance. The previous implementation reset each key lazily to one when `resetAt` was absent/past, otherwise separately read and incremented its counter; reset was next UTC midnight. Old customer rules permitted editing those fields and deleting entire keys. Therefore even summing every surviving active/revoked key for the same reset window cannot recover deleted records, tampering, or lost concurrent increments. No legacy-counter scan is used as quota authority.

An uninitialized account now enters a transactionally persisted hold through the next UTC midnight after its first eligible request. The hold contains the current UTC `window`, placeholder `used: 0`, and `holdUntil` equal to the next midnight. No request is admitted and no per-key counter is incremented. A 503 `QUOTA_CUTOVER_PENDING` response reports unknown historical usage (`used: null`) and the boundary. The error is raised after commit, so the hold persists. Concurrent first requests serialize/retry against the same account document. Issuing/deleting/replacing keys does not shorten the hold.

At or after the recorded boundary, the same transaction discards the hold, starts the new UTC window at zero, and consumes the first unit (stored result: one). A malformed hold fails closed. Existing valid shared counters are never reinitialized merely because a new key is used.

Immediate initialization is allowed only when the existing `users/{uid}` document has server-assigned snapshot `createTime` strictly after a trusted deployment cutover and not in the future. This is **not** `data().createdAt` or a body/query claim. Customer deletion/recreation of the account document is forbidden by the existing rules; emulator tests verify deletion denial and that editing profile `createdAt` cannot change the server creation metadata. Privileged Admin restoration/recreation is outside customer authority and must preserve quota continuity operationally.

The optional backend-only `API_QUOTA_CUTOVER_AT` setting must be a canonical UTC ISO timestamp with milliseconds, e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`. It is an operator assertion that all legacy quota traffic/writes were retired at that instant, not merely the time a new binary was first deployed. Set it consistently across instances only after that transition is verified; do not backdate it or run mixed legacy workers afterward. No value or production configuration was set during this review. Missing/invalid/future cutover settings or missing/ambiguous creation evidence take the hold path, including new accounts whose newness cannot be proven. An already-established hold is not cleared by later configuration changes. No migration is needed; the optional setting permits the proven-new-account exception.

Reference: [Firestore DocumentSnapshot creation metadata](https://docs.cloud.google.com/nodejs/docs/reference/firestore/latest/firestore/documentsnapshot#createtime).

## Safe validation

- `npm run test:adviser:phase2a`: fixed module manifest, stripped credential environment, SDK/network/process-spawning imports blocked, global network APIs disabled. Pure services and optimistic in-memory transactions only; source assertions read fixed files without evaluating production modules.
- `npm run test:adviser:phase1`: existing isolated product-contract regression suite.
- `npm run test:adviser:phase2a:rules`: real cached Firestore emulator v1.22.0, Java 21, fixed `demo-inventa-adviser-phase2a` project, ephemeral `127.0.0.1` port, explicit local rules file. Dependency-free REST assertions use emulator-only unsigned ID tokens; the emulator's fixture bypass is never used for authorization assertions. No SDK, CLI, dependency install, `.firebaserc`, production credentials, or external service endpoint is used. The process is stopped afterward. This separate harness deliberately allows only its hard-coded loopback REST destination; the unit harness continues to prohibit all network imports.
- `node --check` on changed/new server JavaScript and test harness modules; `git diff --check`.

Coverage includes all management authentication/ownership boundaries, forged user IDs, one-time hash-only issuance, legacy compatibility/no downgrade, inactive/expired credentials, transaction-time revocation, shared usage across formats/keys, key replacement, separate accounts, UTC rollover, malformed data, failed commits, and concurrent last-unit contention. Static assertions cover rules, active route wiring, frontend authentication, and test-runtime isolation.

Final-review local result: Phase 2A **61 passed / 0 failed / 0 skipped**; Phase 1 **22 passed / 0 failed / 0 skipped**; real rules **49 passed / 0 failed / 0 skipped**. All 14 changed/new JavaScript modules passed `node --check`. `git diff --check` passed (only LF/CRLF conversion warnings).

The quota adapter models optimistic conflicts/retries, not production throughput or live SDK integration. Real rules assertions cover customer/stranger/anonymous key field updates, creation/deletion/reads; own/cross-account quota access; retained Admin reads with denied client writes; and account entitlement/deletion protections. Mock-token and REST behavior follow [Firebase emulator token construction](https://github.com/firebase/firebase-js-sdk/blob/master/packages/util/src/emulator.ts) and [Firestore REST authorization](https://firebase.google.com/docs/firestore/use-rest-api).

## Pre-existing pre-deployment blockers

### Pre-existing pre-deployment blocker 1: root runtime/dependency mismatch

`google-auth-library@11` declares Node >=22 while the repository/backend target is Node 20. This dependency mismatch pre-existed Phase 2A; Phase 2A did not introduce or modify that dependency. It must be resolved before production deployment.

Phase 2A code itself was validated successfully under temporary Node 20.20.2: Phase 2A tests passed 61/61, Phase 1 tests passed 22/22, and all 14 JavaScript module syntax checks passed. These isolated checks do not resolve the existing dependency/runtime mismatch.

### Pre-existing pre-deployment blocker 2: dashboard dependency lock mismatch

`dashboard/package-lock.json` is inconsistent with `dashboard/package.json`, so `npm ci` cannot currently reproduce the dashboard dependency graph. This mismatch pre-existed Phase 2A. The repository lockfile was not regenerated or modified during Phase 2A, and the mismatch must be resolved before production deployment.

TypeScript validation (`npx tsc --noEmit`) passed for the Phase 2A frontend in a temporary dashboard copy installed from `dashboard/package.json` using `npm install --package-lock=false`. The temporary validation build reached Google Fonts fetching and was blocked by the offline environment; this was not a Phase 2A source-code failure. The temporary copy was removed after validation.

## Large-deletion review

Tracked deletion totals exclude the extracted, still-untracked services and tests. `routes/apikeys.js` moves management logic into authenticated handlers; `middleware/planGate.js` replaces duplicated non-atomic code with the shared quota service; `routes/daas.js` moves inline authentication and replaces redundant account reads. Catalog formatting, pagination, telemetry, product availability, and sales-feed behavior remain.

The API-key page intentionally loses later secret reveal/copy and secret-filled snippets, while creation-time copy/download/export and revocation remain. Playground loses plaintext autofill but retains manual keys, request execution, examples, and exports. Home replaces direct key-document subscriptions with authenticated 30-second count polling; telemetry/payment behavior is unchanged. Privacy consolidates list/revoke requests and now surfaces revocation failures; deletion-request and logout behavior remain. No unrelated feature removal was found. Admin audit attribution still falls back to the stored verified user ID.

## Deferred Phase 2B work

Payment/checkout ownership; webhook verification/idempotency; subscription expiry; renewal; downgrade; account-deletion entitlement cleanup; UI/backend entitlement consistency.
