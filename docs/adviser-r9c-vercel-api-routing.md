# R9C: native Express routing

The API project uses Vercel's Express framework at the repository root, Node 22,
with `server.js` exporting the application. It already mounts `/api/v1/products`,
`/api/v1/checkout/subscription-status`, `/api/v1/admin/traffic` and
`/daas/v1/health`.

The redundant `api/index.js` also exported that same application as a filesystem
Function. Production evidence on release f8cd92b showed `/api` working and
`/api/index` reaching Express, but unmatched `/api/v1/*` requests receiving
Vercel's `x-vercel-error: NOT_FOUND` instead of reaching the framework fallback.
Meanwhile `/daas/v1/health` succeeded and an unknown non-API path received the
normal Express `Cannot GET` response. This isolates the failure to the competing
filesystem API namespace rather than missing Express mounts.

Remove only that redundant adapter so native Express owns its existing routes.
No URL, authentication, CORS, payment, catalog or local listener behavior changes.
No root `vercel.json` is introduced; the separately rooted Customer and Admin
Next.js projects are unchanged.

Vercel's [Express documentation](https://vercel.com/docs/frameworks/backend/express)
supports a root `server.js` default export with zero configuration. Its
[Node backend guidance](https://github.com/vercel/vercel/blob/main/skills/vercel-cli/references/node-backends.md)
identifies a separate `api/` directory as an anti-pattern for native frameworks.

Local check: `node --test tests/adviser/r9c/routing.test.mjs`. This loads the real
entrypoint, routers and shared modules with synthetic Firebase boundaries and
only loopback HTTP. It proves health/catalog success, protected-route 401s and
unknown-route 404s. The test does not prove Vercel's edge routing; separately
verify the Git-triggered deployment and the production paths before acceptance.
Keep the catalog frozen until the operator's final smoke and explicit approval.
