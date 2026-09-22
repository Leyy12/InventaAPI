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

Use `--mode=test` with test credentials and HTTP localhost URLs in isolated
validation environments. The validator reads environment variables only. It
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
| `PAYMONGO_SECRET_KEY` | Yes | Yes | `sk_test_...` for test mode; `sk_live_...` for an explicitly authorized production release. Backend only. |
| `PAYMONGO_WEBHOOK_SECRET` | Yes | Yes | Opaque, non-placeholder signing secret for the webhook endpoint in the matching PayMongo mode. No undocumented prefix is assumed. Backend only. |
| `DASHBOARD_URL` | Yes | No | Customer origin for checkout redirects. Canonical non-local HTTPS origin, with no trailing slash, path, query or fragment. |
| `NEXT_PUBLIC_APP_URL` | Yes | No | Same exact value as `DASHBOARD_URL`, used in backend DaaS/product action links. Despite its name, this is a backend input. |
| `TZ` | Yes | No | Explicit `UTC` or supported IANA timezone. Operator must preserve the existing business calendar for +30-day subscription terms; R6B selects no production value. |
| `API_QUOTA_CUTOVER_AT` | No | No | Canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. It is one operator assertion shared identically by all backend instances. Never invent or backdate it. A future coordinated value is accepted with a warning, but the proven-new-account exception remains inactive and fail-closed until that instant. Missing/invalid runtime state also invokes the Phase 2A fail-closed clean-window hold. |
| `VERCEL` | Provider-managed | No | Read by `server.js` to suppress `listen()`. Its presence does not prove Vercel is the production target. Do not set it manually as deployment evidence. |

Correction to R0: root `database/firebase.js` supports the complete environment
credential triple or a local `service-account.json` fallback, not application-default
credentials. The release validator now rejects the unsupported ADC assertion.
The local credential file must never be included in release artifacts. Use the
environment triple from the secret store and run backend preflight before startup.
Firebase Functions independently call `initializeApp()` and use managed identity;
they do not need the root backend's private-key variables. An operator needing
root managed identity must obtain a separate reviewed initializer implementation.

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
