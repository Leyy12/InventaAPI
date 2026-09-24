# Release environment contract

The validated development and release toolchain is Node.js 22.x. The root
dependency graph requires Node 22 or later, and Firebase Functions explicitly
select Node 22. Because the Express, Customer, and Admin deployment providers are
not established in Git, those packages do not claim provider compatibility with
an `engines` field. An operator must verify Node 22 support before deployment.
R6B makes Node 22 and the public environment checks mandatory when either Next
application loads its production build/start configuration. Production rewrites
use the same validated `NEXT_PUBLIC_API_URL` as direct browser clients. Only the
Next development-server phase permits local defaults. See the full inventory,
packaging evidence and operator checklist in [R6B](adviser-r6b-release-environment.md).
Keep secrets in the provider's secret store; never commit populated environment
files. The example values in `.env.example` are nonfunctional placeholders.

Run the read-only validator before a release:

```text
node --env-file=<backend-env-file> scripts/validate-release-config.mjs --scope=backend --mode=production
node --env-file=<frontend-env-file> scripts/validate-release-config.mjs --scope=dashboard --mode=production
node --env-file=<frontend-env-file> scripts/validate-release-config.mjs --scope=admin --mode=production
```

Use `--mode=test` for a test application runtime and HTTP localhost URLs in isolated
validation environments. This flag validates the runtime/origins, not payment mode.
The current capstone deployment uses `NODE_ENV=production`, `--mode=production`,
and explicit `PAYMONGO_MODE=test`. The validator reads environment variables only. It
does not initialize Firebase or call PayMongo, and it never prints secret values.

## Backend contract

| Variable | Required | Secret | Purpose and accepted format |
|---|---|---|---|
| `NODE_ENV` | Yes | No | Must equal the validation mode: `production` or `test`. |
| `API_PORT` | No | No | Express listen port for non-serverless hosting; one numeric TCP port. |
| `FIREBASE_AUTH_MODE` | Yes | No | `service_account_env` for the root backend. This is a validator selector, not an initializer switch. `application_default` is rejected: the tracked root initializer does not implement it. |
| `FIREBASE_PROJECT_ID` | Conditional | No | Required with `service_account_env`; valid Firebase project ID. |
| `FIREBASE_CLIENT_EMAIL` | Conditional | No | Required with `service_account_env`; service-account email. |
| `FIREBASE_PRIVATE_KEY` | Conditional | Yes | Required with `service_account_env`; PEM private key, normally injected with escaped newlines. |
| `PAYMONGO_MODE` | Yes | No | Exactly `test` or `live`, independent of `NODE_ENV`. Missing/invalid fails closed. Current capstone: `test`; live deferred until commercial launch. |
| `PAYMONGO_SECRET_KEY` | Yes | Yes | Must match `PAYMONGO_MODE`: `sk_test_...` for `test`, `sk_live_...` for `live`. Backend only; never infer mode from the key or runtime. |
| `PAYMONGO_WEBHOOK_SECRET` | Yes | Yes | Opaque, non-placeholder signing secret for the webhook endpoint in the matching PayMongo mode. No undocumented prefix is assumed. Backend only. |
| `DASHBOARD_URL` | Yes | No | Customer origin for checkout redirects. Canonical non-local HTTPS origin, with no trailing slash, path, query or fragment. |
| `NEXT_PUBLIC_APP_URL` | Yes | No | Same exact value as `DASHBOARD_URL`, used in backend DaaS/product action links. Despite its name, this is a backend input. |
| `API_QUOTA_CUTOVER_AT` | No | No | Canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. It is one operator assertion shared identically by all backend instances. Never invent or backdate it. A future coordinated value is accepted with a warning, but the proven-new-account exception remains inactive and fail-closed until that instant. Missing/invalid runtime state also invokes the Phase 2A fail-closed clean-window hold. |
| `FREE_MONTHLY_QUOTA_CUTOVER_AT` | No* | No* | **Set this for the coordinated production release** to the same canonical UTC instant on every backend instance, after the monthly policy is active everywhere. Only accounts provably created after it (Firestore creation metadata, not profile fields) may open an absent monthly counter immediately. Missing, invalid, future or ambiguous evidence means a next-UTC-month hold. Runtime validation deliberately keeps it optional/fail-closed, but release operations should supply it. Never reuse/backdate the old daily cutover. No production value is selected here. |
| `VERCEL` | Provider-managed | No | Read by `server.js` to suppress `listen()`. Its presence does not prove Vercel is the production target. Do not set it manually as deployment evidence. |

Correction to R0: root `database/firebase.js` supports the complete environment
credential triple or a local `service-account.json` fallback, not application-default
credentials. The release validator now rejects the unsupported ADC assertion.
The local credential file must never be included in release artifacts. Use the
environment triple from the secret store and run backend preflight before startup.
Firebase Functions independently call `initializeApp()` and use managed identity;
they do not need the root backend's private-key variables. An operator needing
root managed identity must obtain a separate reviewed initializer implementation.

## Free Trial warning Function configuration — release gate

The reviewed post-Trial contract pauses protected API access and new key
generation until valid paid Pro entitlement. The scheduled warning uses Resend
for communication only; server entitlement evaluation enforces the boundary
even when the Function does not run. No production values are set here.

The uncommitted Phase 2 `monitorFreeTrials` Function requires
`TRIAL_WARNING_FROM_EMAIL` (a verified sender email, non-secret Firebase
parameter) and `RESEND_API_KEY` (server-only Firebase Secret Manager secret
bound only to that Function). Set/verify both in the intended Firebase project
before any authorized deployment; no value is selected in this repository.
Run `validate-release-config.mjs --scope=functions --mode=production` with an
operator-provided environment for local format preflight, then independently
verify Secret Manager binding and sender-domain ownership. Never copy the
Resend secret to Customer/Admin bundles or Git. Resend delivery itself and
deployed-origin email behavior still require a separately authorized sandbox
test. `FREE_MONTHLY_QUOTA_CUTOVER_AT` remains a distinct mandatory coordinated
release input as described above.

## Current capstone payment contract (R6C)

Use `PAYMONGO_MODE=test` with a PayMongo Test Secret Key and the signing secret
from the matching Test Mode webhook endpoint. Both are required external secrets;
their real values are never stored here. Real money: **NO**. Live mode:
**DEFERRED UNTIL COMMERCIAL LAUNCH**, requiring a separate authorization and review.
`NODE_ENV=production` remains the normal production application runtime.

Test mode requires `sk_test_`, signature `te`, and `livemode=false` throughout the
event/session/payment/intent. Future live mode requires `sk_live_`, `li`, and
`livemode=true`. Mismatches fail closed. The opaque webhook secret has no assumed
mode prefix. The current routes remain Checkout Sessions via
`POST /api/v1/checkout/create-gcash`, status via
`GET /api/v1/checkout/subscription-status`, and
`POST /api/webhooks/paymongo` for `checkout_session.payment.paid` fulfillment.
Price remains 149900 centavos, PHP, Pro, 30 calendar days.

Paid terms are **30 UTC calendar days**, preserving the UTC time of day. The
renewal anchor is the later of a valid prior subscription expiry and the
verified server fulfillment instant; an absent expiry anchors at fulfillment.
Authoritative prior expiries may be a valid JavaScript `Date`, a Firestore
Timestamp-like value whose `toDate()` returns a valid `Date`, or an ISO/RFC3339
date-time string with explicit `Z` or numeric UTC offset. Ambiguous, date-only,
offset-free, and invalid **present** expiries fail closed; they never become a
new term starting now. Ambient runtime timezone is not authoritative. Vercel
reserves `TZ`; it is not required and must not be added as a release setting.
This does not change Free quota's UTC calendar month, API-key generation's UTC
calendar day, or Trial's exact seven elapsed UTC 24-hour periods.

`DASHBOARD_URL` must equal `NEXT_PUBLIC_APP_URL`. Success uses
`/dashboard?payment=success&order=<orderId>`; cancel uses `/?payment=cancelled`.
Both redirects derive from `DASHBOARD_URL`; neither grants entitlement. Production
runtime continues to require secure redirects even with sandbox payments.
See [R6C](adviser-r6c-paymongo-mode.md). Sandbox E2E, actual origins and other release
gates remain open; this configuration change does not authorize deployment.

## Frontend build contract

All `NEXT_PUBLIC_*` values are embedded into browser bundles. They are public
configuration, not secrets. Required settings must be explicit and correct for
each production build; the Storage bucket is optional for this URL-only release.

| Variable | Scope | Required | Purpose and accepted format |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Customer + Admin | Yes | Same actual Express API origin in both builds and their rewrites. Canonical HTTPS origin, no trailing slash/path/query/fragment; no localhost or reserved example/test origins. |
| `NEXT_PUBLIC_ADMIN_APP_ORIGIN` | Customer | Yes | Actual canonical Admin HTTPS origin for the fixed `/login` handoff. No credentials in URL and no cross-origin SSO claim. Missing/invalid production configuration fails the build. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Customer + Admin | Yes | Non-placeholder Firebase Web API key. It is not a service-account secret. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Customer + Admin | Yes | Firebase Auth hostname, without protocol/path. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Customer + Admin | Yes | Firebase project ID used by the browser SDK. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Customer + Admin | No | Optional public SDK bucket hostname. Omitted/empty configuration is accepted and the SDK option is omitted; a supplied value retains hostname-shape validation. R2B is URL-only. Providing a bucket does not authorize or activate uploads; `storage.rules` remains excluded from deployment. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Customer + Admin | Yes | Numeric Firebase sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Customer + Admin | Yes | Firebase web app ID such as `1:<sender>:web:<id>`. |
| `NEXT_PUBLIC_SUPERADMIN_UID` | Neither | No | Obsolete after R5A. No active code reads it; it is no longer a release requirement or role authority. |

## Runtime reads that are not release requirements

- `DB_*` is read only by the legacy PostgreSQL connection module; the reviewed
  Express route path uses Firestore and does not import that module.
- `JWT_SECRET` and `DAAS_API_KEY` are read into unused constants in the imported
  `middleware/auth.js`; active Firebase/API-key verification does not use them.
- `SMTP_*`, `FRONTEND_URL`, `CORS_ORIGIN`, and `RATE_LIMIT_*` in the old example
  were not consumed by the reviewed runtime. Do not assume they configure the
  current server. CORS and the IP limiter are currently code-defined.
- Firebase public defaults remain in frontend source for development compatibility.
  Both Next production configurations now invoke the validator before building or
  starting, preventing a release build from relying on those defaults. Publish
  public values at build time; changing runtime env alone cannot update baked bundles.
- `CUSTOMER_APP_ORIGIN` and `BACKEND_API_ORIGIN` are checklist labels, not new runtime
  variables. Map them to `DASHBOARD_URL`/`NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_API_URL`.
- CORS remains code-defined, with broad legacy patterns. Exact production and
  preview origins require operator decisions and a separately reviewed allowlist
  change if they differ; setting an unused `CORS_ORIGIN` cannot configure the server.

## Deployment inputs not stored in Git

Before a release, an authorized operator must supply and independently verify:

1. Firebase project ID/alias passed explicitly to the CLI;
2. Express backend provider, project/service, region, public URL, and deploy command;
3. Customer dashboard provider/project and production domain;
4. Admin panel provider/project and production domain;
5. secret-store locations and access ownership;
6. immutable artifact/release identifiers used for rollback.

R0 deliberately does not create `.firebaserc`, provider manifests, or project IDs
because the authoritative production targets cannot be established from tracked
repository evidence.
