# P1 legacy Pro Max renewal remediation

Repository: Leyy12/InventaAPI. Branch: `codex/admin-system-settings-functionalization`.
Original candidate preserved: `07b20ae0d68284c132ca71040212494e997c11e6`.
Accepted remote master remains `e9256a008a5ddb4a16218682927e05090d96a7a8`.

## Root cause and isolated comparison

The original renewal floor depended on the current paid tier when no private promise existed. API-key management, quota admission and the scheduled downgrade could replace an expired Pro Max profile with Free without preserving Unlimited. A status response could advertise Unlimited, then a key-list read would erase the tier and checkout would accept 10/day under the same global policy version.

The new regression loads the exact original API-key, checkout and fulfillment modules from the locked Git commit, with synthetic dependencies. The original code reproduces the Unlimited offer / finite accepted-order mismatch. The same fixture with remediation retains Unlimited before normalization, in the frozen renewal order, and after successful fulfillment. Prices, payment terms, request counters and the paid expiry calculations are compared in the same reproduction.

## Correction

`functions/request-contract-evidence.mjs` resolves trusted request promises inside existing transactions. A still-intact, server-controlled legacy paid entitlement is preserved in `account_request_contracts/{uid}` before its tier is normalized. Verified paid order/receipt snapshots take precedence when a current paid tier has lost a newer finite contract record; Pro Max's storage-level null field is not used to invent Unlimited over a verified finite purchase.

For an account already normalized to Free, retained paid timestamps indicate that prior terms require evidence; they never identify the prior tier or request allowance. Recovery requires an owned processed order and its matching paid transaction receipt, valid settlement/plan/allowance fields, matching account, mode, payment/session references and valid paid period. Pending, unpaid, foreign, review-only, denied or malformed evidence cannot grant or replace a promise. Existing validated backend-only commitments remain authoritative. Recovery never trusts client-provided allowance/history fields.

Preservation is queued after all transaction reads, atomically with normalization or checkout preparation. No profile can be successfully normalized by the corrected paths while losing the relevant promise. Read-only subscription status resolves the same applicable evidence without persisting or consuming usage. Webhook fulfillment uses the frozen verified order and applicable private/history evidence; its existing amount, signature, binding, lock, deletion-race and replay semantics remain intact.

The shared resolver covers API-key management, authoritative quota admission, subscription status, checkout/renewal, payment fulfillment and `normalizeExpiredAccount`, which is called by the existing scheduled downgrade. Repeated normalization is idempotent. A racing renewal wins through the existing transaction conflict/retry mechanism.

Expired paid access stays restricted until successful payment. A normalized account's retained server-owned paid expiry also prevents ordinary session establishment or explicit activation from creating another Trial. Normal new accounts and existing active Trials retain their original duration, capacity and key rules. No new subscription states are introduced.

## Compatibility and safe failure

Active legacy Pro Max remains Unlimited under finite defaults. Applicable legacy renewals retain Unlimited. New, explicitly accepted finite purchase snapshots are enforced and remain protected across expiry/renewal. No automatic conversion of an existing Unlimited promise to a finite agreement is introduced.

Already-normalized paid accounts with neither a valid private paid promise nor trustworthy paid history return a safe 503 before a new finite checkout/provider call. Malformed private records are not overwritten. Recovery is bounded to 100 owned purchase-order records; exceeding that bound also requires authorized reconciliation instead of truncating history and silently reducing terms. These are deliberate compatibility gates. No live account/history audit or reconciliation was performed, so the number of affected live accounts is unknown.

An already-verified incoming Unlimited purchase is itself sufficient evidence of an allowance that cannot reduce unknown prior terms. A finite incoming purchase cannot repair an already-normalized paid account's missing prior evidence. Failed evidence resolution leaves the existing account, order, receipt and counter documents unchanged.

## Local validation

- 28 new targeted remediation tests PASS, including the exact original/fixed reproduction, actual scheduled callback with synthetic SDK dependencies, repeated normalization, renewal race, evidence recovery/failure, bounded history, accepted Live test billing, verified finite terms, webhook replay, paid expiry preservation and actual personalized Billing cards.
- 115 combined focused tests PASS: the 28 new tests, 15 existing plan-policy tests, 66 payment/checkout-lock tests and 6 customer policy/presentation tests.
- 171 isolated Trial/key/quota regressions PASS, using the existing external-I/O-denying runner.
- Functions package build/syntax check PASS; changed backend/test module syntax and diff-check PASS.
- Existing Admin/Customer source, System Settings handlers, mandatory security/IP protection, Firebase rules, prices and payment signature/amount contracts remain unchanged.

The previous generic new-customer payment fixture incorrectly retained future paid subscription timestamps without purchase evidence. It now models a genuinely new account. Future paid-time preservation is explicitly covered by an actual legacy paid renewal fixture; its existing expiry extends from November 1 to December 1, with unchanged usage. No production behavior is relaxed to accommodate a synthetic fixture.

Frontend implementation/builds were already accepted and are untouched by this correction; the actual Billing/policy components are exercised against remediated subscription-status responses. No frontend build or unrelated UI implementation was repeated.

## Release dependency change — no deployment performed

The existing scheduled Firebase Function package now needs this shared lifecycle/evidence correction in a future coordinated release; the original report's statement that no Functions deployment was required is superseded. Review the effective scheduled version and legacy evidence readiness before allowing an old normalizer to erase intact tiers. An API-only rollout must not be claimed to cover the scheduled path. API/Admin/Customer and the previously proposed minimal rules dependencies remain part of the broader System Settings release plan; this remediation changes no Firebase rules.

Do not activate finite legacy-affecting offers until applicable evidence and all normalization paths are protected. Any live audit, reconciliation or scheduler deployment requires a separate authorized release scope. No staging/Production data, accounts, counters, rules or infrastructure were changed. No deployment, Git push, or amendment of the original candidate occurred.

## Changed files

- `functions/request-contract-evidence.mjs`
- `functions/subscription-lifecycle.mjs`
- `services/account-quota.js`
- `services/api-key-management.js`
- `services/free-trial.js`
- `services/payment-checkout.js`
- `services/payment-webhook.js`
- `scripts/adviser-free-trial-loader.mjs`
- `scripts/run-adviser-free-trial-tests.mjs`
- `tests/adviser/legacy-pro-max-renewal.test.mjs`
- `tests/adviser/plan-request-limits.test.mjs`
- `docs/admin-system-settings-legacy-renewal-remediation.md`
- `docs/admin-system-settings-local-validation.md`
