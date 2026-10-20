# Signup email verification and Terms acceptance

New Customer accounts are created only after the person proves they control the
email address they register with, by entering a 6-digit code that the backend
emails to that address. Signup also requires explicit acceptance of the
[Terms of Service & Acceptable Use Policy](../dashboard/src/app/terms-of-service/page.tsx)
and the Privacy Policy.

The guarantee is enforced by `firestore.rules`, not only by the signup page:
`users/{uid}` can be created only by an identity whose ID token carries
`email_verified == true`, whose profile `email` is exactly that token's address,
and whose profile records `termsAccepted == true` and `privacyConsent == true`.
Password identities become verified only through this flow. After signup the
owner cannot change `email`, `termsAccepted`, `termsAcceptedAt`, `termsVersion`,
`privacyConsent` or `privacyConsentTimestamp`.

## Flow

1. **Details (step 1 of 2).** The page validates the form and both acceptances,
   normalizes the address (trimmed, lowercase, as Firebase Auth stores it) and calls
   `send`. The backend refuses when registration is disabled in System Settings or
   when the address already belongs to a Firebase Auth identity, then emails a code.
2. **Code (step 2 of 2).** The page shows the address, a numeric one-time-code field,
   a resend countdown and *Edit details*. `verify` exchanges a correct code for a
   single-use verification token. Returning to the details with the same address
   reuses the pending code; a different address gets a new one.
3. **Account creation.** The existing `completeCustomerSignup` creates the Firebase
   Auth identity for the verified address, then `confirmEmail` calls `confirm` with
   the new identity's ID token. The backend sets `emailVerified` with the Admin SDK;
   the browser refreshes its ID token and requires the `email_verified` claim before
   it writes the profile. The profile also records `termsVersion`,
   `termsAcceptedAt` and `privacyConsentTimestamp`. The user is signed out and sent
   to the landing Login, exactly as before.

If confirmation fails, the new identity is deleted (it has no profile) and the page
asks for a new code. A retry after any other later failure reuses the verification
token while it is valid. Requests go to `NEXT_PUBLIC_API_URL` directly, never the
Next.js rewrite, so the backend's per-IP limits see the real client address.

## Endpoints

All responses are `Cache-Control: no-store` JSON: `{ success: true, ... }` or
`{ success: false, code, error[, retryAfterSeconds] }`. `error` is short,
user-facing copy that the page displays. Unexpected failures are `503
VERIFICATION_UNAVAILABLE`.

| Endpoint | Body | Success | Refusals |
|---|---|---|---|
| `POST /api/v1/auth/email-verification/send` | `{ email }` | `expiresInSeconds` (600), `resendAvailableInSeconds` (60) | 400 `INVALID_EMAIL`; 403 `REGISTRATION_CLOSED`; 409 `EMAIL_ALREADY_REGISTERED`; 429 `VERIFICATION_RESEND_COOLDOWN` / `VERIFICATION_SEND_LIMIT` with `Retry-After`; 503 `EMAIL_DELIVERY_FAILED` |
| `POST /api/v1/auth/email-verification/verify` | `{ email, code }` | `verificationToken`, `expiresInSeconds` (1800) | 400 `INVALID_CODE`, `VERIFICATION_CODE_MISSING`, `VERIFICATION_CODE_EXPIRED`, `VERIFICATION_CODE_INCORRECT` (with remaining attempts); 429 `VERIFICATION_ATTEMPTS_EXCEEDED` |
| `POST /api/v1/auth/email-verification/confirm` | `{ verificationToken }` + `Authorization: Bearer <ID token>` | `{ success: true }` | 401 `UNAUTHENTICATED`; 400 `VERIFICATION_TOKEN_INVALID` |

`confirm` looks up the record by the identity's own email, so a token can only
verify the inbox it was issued for. Maintenance mode does not apply to these
routes; the registration switch does.

## Limits and storage

- **Codes:** 6 digits from `crypto.randomInt`, valid for 10 minutes, single-use.
  Five incorrect entries withdraw the code.
- **Sending:** per address, one code per minute and five per rolling hour, stored in
  Firestore and therefore shared by every backend instance. Per IP, 10 sends per 15
  minutes; like the existing 60-requests-per-minute limiter, this bound is
  process-local. A code that could not be delivered is withdrawn and its cooldown
  released; it still counts toward the hourly limit.
- **Tokens:** 32 random bytes, valid for 30 minutes, deleted when redeemed. A newer
  code replaces any earlier code and token for the address.
- **Records:** `email_verifications/{sha256(address)}` holds no plaintext address or
  code: the code is an HMAC-SHA256 under a per-code random salt and the token a
  SHA-256 hash, alongside counters and timestamps. Rules deny every browser
  identity, including Admins. A successful confirmation deletes the record.
  Unfinished records carry `expireAt` (24 hours after their last change) for an
  optional Firestore TTL policy, which this repository does not deploy:
  `gcloud firestore fields ttls update expireAt --collection-group=email_verifications --enable-ttl --project=<project>`.

## Configuration (backend only)

The release validator (`--scope=backend`) requires a complete provider. Never
expose these values to the Customer or Admin builds.

| Variable | Required | Secret | Purpose |
|---|---|---|---|
| `EMAIL_DELIVERY_PROVIDER` | Yes | No | `smtp` or `resend`. Without a provider, sending fails closed and new registration is unavailable. |
| `EMAIL_FROM` | Yes | No | `Name <address>` or an address the provider may send from. |
| `SMTP_HOST`, `SMTP_USER` | With `smtp` | No | Server hostname and mailbox user name. |
| `SMTP_PORT` | No | No | Default `465` (implicit TLS). Any other port must offer STARTTLS, which is required before authentication (for example `587`). |
| `SMTP_PASS` | With `smtp` | Yes | Mailbox password or app password. |
| `RESEND_API_KEY` | With `resend` | Yes | `re_...` key for the sender's verified domain. This is separate from the Functions' Secret Manager binding. |

**Gmail:** turn on 2-Step Verification for the sending Google account, create an
App Password, then set `EMAIL_DELIVERY_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=465`, `SMTP_USER=<the Gmail address>`, `SMTP_PASS=<the 16-character app
password, without spaces>` and `EMAIL_FROM="InventaAPI <the same Gmail address>"`.
Gmail enforces daily sending limits suited to low volume; use Resend or another
transactional provider for higher volume.

**Resend:** verify the sending domain in Resend, then set
`EMAIL_DELIVERY_PROVIDER=resend`, `RESEND_API_KEY` and an `EMAIL_FROM` on that domain.

**Local development:** with `NODE_ENV=development` and no provider (or
`EMAIL_DELIVERY_PROVIDER=console`), codes are printed to the API server log
instead of being emailed. `console` is rejected in every other environment.

## Deployment order

Deploy the backend with its email configuration first, then the Customer
dashboard, then `firestore.rules`. The new page needs the new endpoints, and the
new rule rejects profiles from the previous signup page, which never verifies the
address. The previous rules already accept the profiles the new page writes.

## Existing accounts and limitations

- Existing profiles keep working: only profile creation and changes to the address
  and consent fields are newly restricted, and no client feature changed them.
  Accounts provisioned with the Admin SDK (scripts) bypass rules as before.
- Someone who knows an address can delay its signup, by spending its hourly sends or
  a code's attempts, but can never complete it without access to the inbox.
- As before, an address that already has a Firebase Auth identity, even one without
  a profile, is reported as already registered.

## Terms version

`TERMS_VERSION` in `services/customer-registration.mjs` must equal the version on
the Terms page; `tests/adviser/email-verification/client.test.mjs` checks this.
Change both when the Terms change materially. Each profile keeps the version it
accepted. The Terms text was drafted for this capstone release; review it before
commercial launch.

## Tests

```text
npm run test:adviser:email-verification
npm run test:adviser:email-verification:rules   # cached Firestore emulator
node --test tests/adviser/r9c/routing.test.mjs  # routes, limiter, real server.js
```
