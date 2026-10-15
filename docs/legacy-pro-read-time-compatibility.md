# Legacy Pro demonstration compatibility

Owner-approved local implementation based on
`225c51cbc1ffc2e0a8f4414ec4e9a091c150b6d6`. No deployment, provider request,
Production inspection/mutation, staging mutation, migration or account repair
was performed in this task. Archived evidence was inspected locally for field
shapes; all executable tests use isolated synthetic identities and records.

## Closed eligibility

The exception requires an existing Developer profile with its own UID, exact
`Pro` label, active subscription status, stored 500 allowance, and an original
30-day period matching its start, last-subscription and expiry timestamps.
There must be no private request-contract document, and a complete bounded
history scan (maximum 100 orders) must contain exactly one processed purchase.
Other pending attempts cannot claim an entitlement or paid period.

The paid order must be the LIVE `global_live_test_v1` Pro demonstration shape:
500 centavos charged, 149900 list centavos, PHP, 30 days and 500 requests/day.
Its exact server-owned checkout body must bind the order reference/metadata and
the original single-item 500/day description. The order, paid receipt, processed
event and session-binding document must all have server creation timestamps
before **2026-10-15T00:00:00.000Z**. Settlement must also precede that fixed
cutoff. This closes eligibility before the newly approved policy; changing a
profile or adding backdated records after release cannot enter the cohort.

Receipt/event/session ownership, order, payment, event and session identifiers
must agree; any recorded payment-intent/reference aliases must agree. All mode
markers must be LIVE and noncontradictory. The receipt must be paid and granted,
with the original exact period; processed timestamps must agree. Missing,
ambiguous, review-required, superseded or contradictory evidence fails closed.
No Customer UID or personal information is hardcoded.

These local server-owned records satisfy the newly authorized grandfathering
policy. They do **not** establish missing external PayMongo corroboration, and
they are never sufficient to settle a new purchase or a pending checkout.

## Read-time behavior and normal operations

An opaque process-local WeakMap context supplies exactly 500/day for the
original recorded period, independently of today's Admin defaults. It contains
no saved Pro plan promise. Resolution returns `changed: false`; no private
contract, completeness marker or profile update is queued. Existing key
credentials and legitimate daily key-generation restrictions are preserved.
Normal requests still consume the authoritative account-shared UTC usage
counter and update key diagnostics; this is not a database freeze.

At expiry, access and new key issuance are restricted without converting the
legacy profile label or creating a historical snapshot. The scheduled
normalizer uses the same shared lifecycle module and makes no migration writes
for these profiles, before or after expiry. Its other existing lifecycle
behavior is preserved, including verified Unlimited commitments and ordinary
expiry handling outside this narrow exception.

A future legitimate accepted purchase captures its new verified terms through
the existing checkout/signature/ownership/idempotent fulfillment path. It does
not persist or inherit the old period's opaque context. When a new trusted
private contract exists, old demonstration evidence is independently validated
but does not manufacture a perpetual historical Pro floor or obstruct a valid
new Pro Max contract. Other historical contracts retain strict recovery and
their existing promise protection.

The seven pending LIVE offers are never changed by compatibility resolution.
Their four 500/day and three 5000/day offers retain the existing signed-event
fulfillment path. No provider outcome is inferred; all seven remain UNKNOWN.

## Validation and preservation

- 222 focused tests passed across legacy compatibility, previous P1 recovery,
  production-transition security, System Settings, plan request limits and
  Customer billing presentation. These include status/key projections for two
  representative demonstrations; exact periods and 500/day despite a 1000/day
  default; zero read-time writes; usage enforcement and legitimate issuance;
  missing/forged/foreign/TEST/contradictory evidence rejection; cutoff and expiry
  boundaries; transaction-race revalidation; signed new Pro/Pro Max purchases
  and idempotence; and the actual scheduled Function callback.
- All 19 synthetic representative profiles remain structurally unchanged:
  ten expired/consumed Trials, six never-started Free accounts, one unsupported
  Expired profile and two active Pro demonstrations. The unsupported label
  remains fail-closed. This is local fixture evidence, not a live-account check.
- 171 isolated Free Trial tests passed: seven days, 50 linked products, one
  active key and no default request quota remain intact. Its two strict test
  manifests include only the new pure dependency; external I/O remains blocked.
- Functions `npm run build`, syntax checks and dependency imports passed. The
  new dependency lives inside the deployable Functions package. API entry-point
  syntax passed. No frontend source changed, so no frontend rebuild was needed.
- No UI, price, request-policy default, webhook signature verification, payment
  record, rule, database, deployment, quota or IAM configuration was changed.

Release remains subject to independent review and acceptance of this new
candidate in staging. Production checkout outcomes and external provider
corroboration remain unresolved; authorized hold/drain and cutover verification
are still separate release gates. The two-account compatibility decision does
not resolve the seven unknown checkouts. Production Maintenance Mode remains
the previously audited OFF decision; this task does not touch that setting.
