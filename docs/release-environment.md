# Release environment contract

The validated development and release toolchain is Node.js 22.x. The root
dependency graph requires Node 22 or later, and Firebase Functions explicitly
select Node 22. Because the Express, Customer, and Admin deployment providers are
not established in Git, those packages do not claim provider compatibility with
an `engines` field. An operator must verify Node 22 support before deployment.
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
| `FIREBASE_AUTH_MODE` | Yes | No | `service_account_env` or `application_default`. This is a release-validation selector; Firebase Admin already supports both paths. |
| `FIREBASE_PROJECT_ID` | Conditional | No | Required with `service_account_env`; valid Firebase project ID. |
| `FIREBASE_CLIENT_EMAIL` | Conditional | No | Required with `service_account_env`; service-account email. |
| `FIREBASE_PRIVATE_KEY` | Conditional | Yes | Required with `service_account_env`; PEM private key, normally injected with escaped newlines. |
| `PAYMONGO_SECRET_KEY` | Yes | Yes | `sk_test_...` for test mode; `sk_live_...` for an explicitly authorized production release. Backend only. |
| `PAYMONGO_WEBHOOK_SECRET` | Yes | Yes | Opaque, non-placeholder signing secret for the webhook endpoint in the matching PayMongo mode. No undocumented prefix is assumed. Backend only. |
| `DASHBOARD_URL` | Yes | No | Customer dashboard origin used by checkout redirects. Absolute HTTPS, non-local URL in production. |
| `NEXT_PUBLIC_APP_URL` | Yes | No | Public customer-app origin used in DaaS action links. Despite the name, it is read by the backend. Absolute HTTPS, non-local URL in production. |
| `API_QUOTA_CUTOVER_AT` | No | No | Canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. It is one operator assertion shared identically by all backend instances. Never invent or backdate it. A future coordinated value is accepted with a warning, but the proven-new-account exception remains inactive and fail-closed until that instant. Missing/invalid runtime state also invokes the Phase 2A fail-closed clean-window hold. |
| `VERCEL` | Provider-managed | No | Read by `server.js` to suppress `listen()`. Its presence does not prove Vercel is the production target. Do not set it manually as deployment evidence. |

When `FIREBASE_AUTH_MODE=application_default`, the release environment must
provide a verified managed workload identity and must omit the three explicit
service-account variables. Firebase Functions use their deployed managed identity
and do not need the root backend's private-key variables.

## Frontend build contract

All `NEXT_PUBLIC_*` values are embedded into browser bundles. They are public
configuration, not secrets, but must still be explicit and correct for each
production build.

| Variable | Scope | Required | Purpose and accepted format |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Customer + Admin | Yes | Express API origin; absolute HTTPS, non-local URL in production. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Customer + Admin | Yes | Non-placeholder Firebase Web API key. It is not a service-account secret. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Customer + Admin | Yes | Firebase Auth hostname, without protocol/path. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Customer + Admin | Yes | Firebase project ID used by the browser SDK. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Customer + Admin | Yes | Storage bucket hostname. R0 does not enable or deploy the media lifecycle. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Customer + Admin | Yes | Numeric Firebase sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Customer + Admin | Yes | Firebase web app ID such as `1:<sender>:web:<id>`. |
| `NEXT_PUBLIC_SUPERADMIN_UID` | Customer only | Yes | Existing role-logic Firebase Auth UID; maximum 128 characters. Public identifier, not a credential. |

## Runtime reads that are not release requirements

- `DB_*` is read only by the legacy PostgreSQL connection module; the reviewed
  Express route path uses Firestore and does not import that module.
- `JWT_SECRET` and `DAAS_API_KEY` are read by an unreferenced legacy middleware.
- `SMTP_*`, `FRONTEND_URL`, `CORS_ORIGIN`, and `RATE_LIMIT_*` in the old example
  were not consumed by the reviewed runtime. Do not assume they configure the
  current server. CORS and the IP limiter are currently code-defined.
- Firebase public defaults remain in both frontend config modules for local
  compatibility. The validator nevertheless requires explicit release values so
  a production build cannot silently rely on those defaults.

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
