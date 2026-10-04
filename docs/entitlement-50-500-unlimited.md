# Current candidate entitlement: 50 / 500 / unlimited

Local candidate only; not authorization to deploy or mutate Production.

The pure `functions/entitlement-limits.mjs` module defines Trial minimum 0,
Trial maximum 50 and Pro daily quota 500. Backend effective entitlement,
purchase catalog and Customer plan configuration share these constants.
Pro Max remains `null` (unlimited account request quota); authentication,
IP rate limiting and all independent security checks still apply.

## Trial catalog

The existing server model counts the union of unique product IDs in active
API-key scopes, including partial variant selections and legacy IDs. It is
not a count of public catalog records or variant rows. Submission/Admin
publication/import create catalog records, not API-key links. All link writes
use authenticated key create/products/replace handlers; Firestore Rules still
deny direct Customer key writes. There is no browser/offline bypass.

Creation allows 0–50 products. Empty keys authorize no product data. One active
Trial key remains enforced transactionally using the existing account lock.
At 50, additions resulting in 51 are denied. Removals down to zero are allowed.
Existing over-cap catalogs are not deleted/truncated: reads, key history and
one-for-one atomic replacement retain their scope. Over-cap edits may retain
or remove existing IDs only, including reductions still above 50; no new ID is
allowed even if the resulting total would be below 50. Once saved at <=50,
normal additions within 50 resume. Scope-version checks prevent stale concurrent
edits from losing another request's selection. No automatic destructive repair.

The automatic one-time 7-day Trial, dates, paid precedence, consumed legacy
Trial evidence and expiry-to-UPGRADE_REQUIRED behavior are unchanged. API calls
neither consume products nor restart/extend Trial. Legacy multiple-active-key
Trials still fail closed until extra keys are revoked.

## Paid and existing snapshots

Valid Pro uses 500 from shared configuration, never a stored 5000 account/key
snapshot. Existing `account_api_usage/{uid}` counters are not reset: 499->500
succeeds, the next request gets the existing 429 response, and midnight UTC
opens the next calendar-day window. Existing clean-window holds and atomic
cross-key increments remain intact. Usage already above 500 stays denied until
the normal reset, preserving history. Pro Max remains unlimited.

New Pro orders store 500. Exact historical server-saved Pro purchase terms with
5000 remain acceptable evidence (also legacy orders without planId), while
fulfillment writes today's 500 entitlement and preserves the order snapshot.
Amount/currency/UID/mode/session/payment binding, signed webhook verification,
idempotency, renewal arithmetic and current-intent fencing remain unchanged.
No client quota override is accepted. Pro/Pro Max display prices are still
PHP1499/PHP4999; the temporary Live charge is still exactly 500 centavos with
QR Ph. No provider call or payment is part of local validation.

## Search classification and release impact

- Active logic, marketing/login/docs/privacy, Overview, Products, API Keys and
  Plan & Billing use up-to-50/no-minimum Trial and Pro500/day.
- Old phased adviser documents are historical review evidence, not current
  policy: free-trial quota, Phase2B1/2B2, R4/R5B/R5C notes retain their recorded
  5000/day or previous request-Trial figures. Use this document for current limits.
  Legacy dashboard *SPECS/*SUMMARY documents and unused SQL schema/demo seeds
  are likewise historical examples, not active Firestore entitlement authority.
- Old stored account/order fixtures deliberately keep 5000 to prove effective
  normalization and history preservation. Legacy consumed Trial counter500
  remains evidence and cannot reopen a Trial.
- Unrelated 5000 values remain: catalog/export scan bounds, sales-event scan
  bound, contact-message length limit, retry/poll/UX timeouts and default API port. Generic paid key scope
  safety cap500 is not the Trial allowance; only proven legacy Trial reductions
  may exceed it. Canonical prices and 500-centavo billing are unrelated.
- Isolated test allowlists now include the new pure module; SDK/network access
  remains blocked, with no widened external-I/O permissions.

No schema, Rules or index change or data migration is required. Shared
subscription-lifecycle Functions source now imports the limits module, so any
future reviewed Functions packaging must include it; no Function deployment
occurs here. A coordinated API/Customer release and authenticated visual review
remain separate gates. No Production counters, dates, customer records, secrets
or deployment environment have been touched.
