# Stale checkout replacement

This change remains on PayMongo v1. New requests use QR Ph; prices, paid terms,
quotas, signatures and Firebase authentication are unchanged.

## Durable replacement

An existing pending order is reusable only for the same account, canonical
purchase, mode, current session binding and payment-method set, with no known
expired/superseded state. Unknown request methods fail closed.

A method-incompatible pending order receives an `expiring` lease and a durable
replacement order ID. The provider boundary retrieves the exact session,
validates mode, identity, terms and unpaid state, expires it through
`POST /v1/checkout_sessions/{id}/expire`, then independently retrieves it again.
Only verified expired/unpaid state permits replacement. Settled, in-flight,
missing or uncertain payment state blocks replacement for reconciliation.

A single Firestore transaction marks the original order and session binding
`superseded`, preserves all original references/request bytes, creates the new
canonical order, and switches the account checkout lock. A separate application
order is necessary to retain the original immutable provider request and
order-derived idempotency key. New-provider recovery reuses only that new durable
request/key. Expiration retries first re-read provider state; lease tokens prevent
late workers from binding competing replacements.

## First-time settlement fence

All existing raw-body signature, mode, amount/currency, payment/intent/session,
ownership and purchase checks still apply. First-time entitlement requires a
pending order, nonsuperseded binding and the account lock pointing to the same
order/current session. Legacy locks containing only `orderId` resolve the session
through the validated order/binding; newly bound locks store session and mode.

A genuine verified settlement on a retiring, superseded, expired or noncurrent
checkout is durably recorded as paid with `entitlementGranted: false` and
`reviewReason: checkout_not_current`. Its event is acknowledged for reconciliation,
not silently discarded or automatically granted. Already processed/reconciled
payment redelivery remains idempotent after the lock advances.

## Release gates

Isolated tests cover expiration failures, uncertain/settled provider state,
replacement concurrency/recovery, settlement races, current-intent fencing and
processed redelivery. Live staged acceptance must additionally prove a fresh v1
QR Ph session, safe reuse, and the old session's provider expiration. No payment,
Production promotion or Git push is part of this validation step.

Provider reference: https://docs.paymongo.com/reference/expire-a-checkout-session
