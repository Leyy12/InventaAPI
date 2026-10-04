# Temporary global Live test billing

Only the API checkout environment may opt in with
`PAYMONGO_GLOBAL_TEST_BILLING=true` and
`PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS=500`. This is real Live QR Ph, not
PayMongo Test Mode. No payment is authorized during release validation.
Missing/false activation retains full-price billing. Invalid configuration or
activation in Test Mode fails closed. The override accepts only 500 centavos.
Never expose these settings through `NEXT_PUBLIC_*` or configure the frontends.

Canonical/display prices remain Pro 149900 and Pro Max 499900 centavos.
Their plan IDs, 30 UTC calendar-day terms, Pro 5000/day quota and Pro Max
unlimited account allowance do not change. Browser-supplied billing/discount
fields cannot select the actual charge.

New discounted orders save `billingProfile=global_live_test_v1`, the canonical
`listAmount`, and actual `amount=500` with PHP and Live mode. Provider requests
use that saved amount. Signed settlement validates the exact saved amount,
plan terms, mode, account, session and payment-intent binding. Fulfillment
uses the saved plan, not the amount, to select Pro versus Pro Max. Historical
full-price orders retain their original amount and remain valid evidence.

Pending full-price sessions are incompatible with the new intent even when
their payment method is already QR Ph. The existing unpaid-verification,
provider-expiration, atomic supersession and current-intent fence apply.
Ambiguous/in-flight/paid sessions fail closed for reconciliation. Uncertain
creating/retryable requests cannot be replayed at a different price.

To end temporary billing, set only the API activation flag to false, stage
and validate an API artifact, then promote it without rebuilding. Existing
500-centavo orders retain their saved settlement contract; pending discounted
sessions require the same safe replacement before full-price reuse. Do not
edit historical orders or weaken webhook checks during either transition.
Do not roll back to code predating this saved billing-profile support once a
500-centavo order exists: that older code cannot validate its settlement.
