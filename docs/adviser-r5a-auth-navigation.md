# R5A — Landing / Login / Logout / Auth navigation

## Post-release landing/login modal contract

The post-release Customer hotfix supersedes the earlier first-visit routing
description below. An unauthenticated visit to `/` always renders the marketing
Landing page with the Login modal closed, regardless of browser history. The
Landing Login action opens the existing modal in place; it does not navigate to a
dedicated login page. The modal keeps the existing credential validation, forgot
password, segment selection, and account-creation paths, and can be closed back
to Landing (including with Escape). `/login` remains a compatibility entry that
renders Landing with the modal open. A successful Customer logout clears local
auth state only after Firebase sign-out succeeds, then navigates to `/?login=true`
so the modal is initially open. Closing it removes the one-time query intent and
stays on Landing; refreshing `/` after dismissal does not reopen it. Authenticated
Customers still resolve `/` to `/dashboard`, and protected routes remain guarded.
The legacy `inventa.landing-completed.v1` value is no longer read or written by
Customer navigation and has no security or routing authority.

Review base: `581ad97f047ebd9f766306078c079ca9952217ea` (R4).
Branch: `adviser/r5a-auth-navigation`. Production reference at safety gate:
`ac3908401fac5732192ac364600c7f397a3a6af6`.

## Before (verified from active source)

| Transition | Previous behavior |
| --- | --- |
| New or returning visitor `/` | Same marketing Landing; no first-visit persistence |
| Customer Login | Landing modal, not an actual `/login` page |
| Authenticated Customer root | Could remain on Landing; `?view=landing` explicitly bypassed redirects |
| Customer logout | Provider used a hard redirect to `/` on success and error |
| Unauthenticated dashboard / expired session | Auth callback pushed `/`; layout could mount children before verification |
| Role / profile | Customer restored cached identity/profile and could auto-create a missing profile |
| Admin | Separate app, `/login`, role checked from Firestore; logout already used `/login`, but error handling/layout gating were incomplete |

Customer active logout callers are Sidebar and the completed account-deletion action
on Dashboard Privacy. Navbar and Dashboard Settings have **no logout control**.
Signup's intentional post-registration signout is a separate flow. Admin Sidebar
calls its own provider. No middleware or established `next`/`redirect`/`returnUrl`
mechanism was found. Settings' `/?choosePlan=true`, signup registration parameters,
and checkout-cancellation entry are existing plan handoffs, not arbitrary return URLs.

## Implemented route flow (paper flowchart source)

```text
START
  -> Auth initialization (bounded; wait for server profile, not browser cache)
  -> Verification unavailable? -> neutral error + Retry (SDK session preserved)
  -> Authenticated with valid role and non-blocked account?
     YES -> Customer: /dashboard
            Admin: separate Admin application (its protected home is /)
     NO  -> Root visit?
            unauthenticated root -> Landing (modal closed unless explicit intent)
            protected route     -> /login
     logout -> /?login=true (Landing with modal open)
  -> Login / Signup
  -> Login + server-verified account/role
  -> Role-appropriate dashboard

Customer dashboard -> Logout -> SDK success -> Customer /?login=true
Admin dashboard    -> Logout -> SDK success -> Admin /login
Either logout failure -> preserve still-valid verified state + visible Retry logout
Signup             -> create existing profile -> sign out -> /login?registered=true
```

This Markdown is source for a later paper/system flowchart. No physical paper,
PDF, or image artifact was changed.

| Entry | Result after initialization |
| --- | --- |
| Fresh unauthenticated `/` | Landing, modal closed |
| Returning unauthenticated `/` | Landing, modal closed |
| Authenticated Customer `/` or ordinary `/login` | `/dashboard` |
| Unauthenticated protected Customer route (including dashboard descendants) | `/login`; protected children never mount |
| Customer logout | `/` with one-time modal-open intent; close returns to Landing |
| Detected invalid session | Explicit `/login` compatibility entry |
| Admin `/login` with verified Admin session | Admin `/` |
| Non-Admin on Admin protected route | Admin `/login`; no protected children |
| Admin in Customer application | Separate Admin Login; never Customer marketing/dashboard |

Explicit existing plan/registration/cancellation intents are retained on the
non-marketing Login screen. Login's segment-selection and paid-plan handoff finish
before the ordinary authenticated-entry redirect. A restored paid-plan intent
waits for the existing authoritative entitlement verification before choosing its
existing modal. This does not change checkout, payment, renewal, quota, pricing,
or subscription policy. Standalone Login has no dismiss-to-dashboard escape while
segment onboarding is pending. Subscription verification does not determine
ordinary authentication routing, so background polls do not bounce routes.

## Customer Login business-segment gate

The Customer Login modal always renders a required Business Segment select after
Password and before Login. Its options are the canonical Phase 1 product segments
(`Grocery`, `Pharmacy`, and `Hardware`) imported from `services/product-contract.js`;
the selector is UX context, not an authentication or entitlement authority. An empty
selection is rejected before Firebase sign-in. After sign-in, the server-read user
profile and backend effective entitlement remain authoritative: Free/Starter and
Pro Trial accounts must match `users.businessSegment` (not `selectedSegment`),
while paid accounts may choose any canonical
segment and have that active context persisted to `selectedSegment`. Invalid or
missing profile segment data fails closed, signs out the newly authenticated SDK
session, and leaves the user at the Login modal with a generic error. Signup's
existing authoritative profile provisioning and the separate Admin Login flow are
unchanged; no client-selected value grants a plan, role, quota, or product access.

## First-visit state

The former `inventa.landing-completed.v1` localStorage marker is legacy and is
not read or written by the current Customer Landing/login flow. Root routing is
therefore deterministic across fresh browsers, returning browsers, cleared
storage, and new devices: unauthenticated `/` is Landing with the modal closed.
The only modal-open state is an explicit route intent (`/login` or the one-time
post-logout `/?login=true` query), which is removed when the modal is dismissed.
No browser storage value is an authentication, role, entitlement, or product
access authority.

## Security and lifecycle

- Both providers start without a cached identity/profile and read roles with
  `getDocFromServer`. The shared pure decision helper reuses the unchanged Phase 2B2
  `accountBlocked` predicate. No missing-profile auto-heal remains in auth navigation.
- SDK initialization/profile reads have a 10-second fail-closed deadline. Requests
  are generation-checked; logout, account switches, cross-tab null events, timeout,
  and unmount discard late profile results. Timeout closes protected UI but retains
  SDK identity in a retryable unverified state, without signing out.
- Explicit Customer signout clears derived identity and routes to `/?login=true`
  (Landing with modal open) only after SDK success; Admin signout still routes to
  its own `/login`. Failure preserves still-valid verified state and shows
  a generic retryable error. The provider returns `{ ok: false }`, never false success.
- SDK null/token events are observed. Customer's existing single entitlement poller
  invalidates detected 401/403 or invalid Firebase-session errors and routes to Login.
  Profile, subscription-status, and Admin refresh network/timeout/5xx failures instead
  close protected UI and expose manual Retry without destroying Firebase persistence.
  Only HTTP error metadata was added
  to the read helper; successful subscription responses and backend policy are unchanged.
- Admin verifies server profile on token events and rechecks on visibility with
  forced token refresh. These are invalidation detection points, not a promise of
  instantaneous revocation before Firebase/backend reports it. Backend authorization
  and Firestore rules remain authoritative and unchanged.
- Signup retains ownership of its create-profile/signout sequence. Auth navigation
  may deny a not-yet-created profile but does not interrupt signup by signing it out
  early or recreate deleted profiles. Protected pages still fail closed.
- No arbitrary return-to feature was added. Root forwards only recognized existing
  entry flags and plan IDs. External, protocol-relative, encoded, and script URL
  values in `next`, `redirect`, or `returnUrl` do not control navigation.
- Removed the unused Admin token-in-query bridge. Configure the Customer build's
  **`NEXT_PUBLIC_ADMIN_APP_ORIGIN`** to the real separate Admin HTTPS origin (no path,
  credentials, query, or fragment). The local development fallback is
  `http://localhost:3001` only on localhost/127.0.0.1. Missing/invalid/same-origin
  production configuration fails closed with an operator-directed message. No real
  production address was invented. Separate origins retain separate Firebase
  sessions; an Admin may need to sign in in that app. R5A does not implement SSO.

## Redirect audit

Customer logout intentionally returns to the Landing root with a one-time
modal-open query; Sidebar and Privacy still delegate to the provider's explicit
logout action, as does the Admin-handoff fallback's new Sign out button. Signup now targets `/login?registered=true` with
the existing optional plan intent. Admin's remaining `router.push("/")` is its
successful authorized login, not logout. Admin ErrorState's home link is likewise
its own dashboard. Marketing anchor links and existing Settings/checkout root
intent links are not logout and are normalized to the explicit Login entry.

## Validation and limits

`npm run test:adviser:r5a` is isolated through a fixed module allowlist, scrubbed
environment, deterministic storage/timers/profile promises, disabled network APIs,
and wiring assertions. No real Firebase SDK authentication is loaded by the suite.
Tests cover route transitions, initialization, blocked accounts, stale reads,
logout, cross-tab signals, URL rejection, role separation, and retained handoffs.

Initial implementation validation under Node 22.20.0 (superseded by the pre-commit
review below): R5A **103 passed / 0 failed / 0 skipped**. The unchanged
baseline is **1,015 passed / 0 failed / 0 skipped**; combined total **1,118 / 0 / 0**.

| Baseline suite | Passed |
| --- | ---: |
| R4 | 115 |
| R3 + rules | 168 + 32 |
| R2B | 56 |
| R2A + rules | 116 + 95 |
| Phase 2B2 + rules | 98 + 35 |
| Phase 2B1 + rules | 122 + 36 |
| Phase 2A + rules | 62 + 49 |
| Phase 1 | 22 |
| R0 config | 9 |

Customer and Admin TypeScript and production builds pass. Changed-file Customer
lint retains **7 pre-existing errors / 2 warnings**, compared with **7 errors /
6 warnings** in the corresponding reviewed R4 source. Remaining errors are the
existing Signup explicit-any, auth-component synchronous state effects, and
unescaped apostrophes; no broad lint cleanup was performed. Root/Login entry pages,
route guard, rewritten provider, and shared helper have no new lint findings.
Admin touched-file lint passes using the existing temporary native Next flat-config
validation workaround; the repository's pre-existing Admin ESLint configuration
was not changed. Tracked and new-file whitespace checks pass.

Frontend validation
uses temporary copies with existing dependencies, synthetic demo Firebase values,
loopback API configuration, and no real environment files. It is not production
authentication or end-to-end release certification. Existing auth-component lint
findings are compared to the reviewed R4 source, not silently waived or broadly fixed.

Remaining first-list work: API policy/history, final browser E2E/release certification.
R5A originally deferred Free Trial; the separate [integration review](adviser-free-trial-integration.md)
now documents its local implementation. Production provider/Node compatibility, existing lint
debt, secrets/configuration, coordinated quota cutover, and the actual Admin app
origin remain operator/release inputs. No commit, push, merge, deployment, production
Firebase access, live PayMongo call, Storage upload, or API History implementation
is authorized by this phase.

## Historical pre-correction review — HOLD (resolved below)

The happy-path flow above is implemented, but its logout arrows must not be read
as proof that failed SDK signout succeeded. No application correction was made in
this review. Focused callback-level tests execute the actual provider/signup bodies
with injected SDK, state, router, and storage fakes; they do not load live Firebase.

Two local-commit blockers were identified:

1. **Failed logout is presented as completed logout in both apps.** Customer
   `endSession` and Admin `logout` clear local identity before SDK signout, swallow
   rejection into console output, and unconditionally navigate to plain Login.
   The SDK can still retain a valid session. Keep failure visible and recoverable;
   do not present an ordinary logged-out exit until signout succeeds. Retaining a
   protected-UI hold alone does not establish that the Firebase session ended.
2. **Verification uncertainty is treated as confirmed signout.** The shared gate
   funnels SDK initialization timeout, profile timeout, and profile read rejection
   through the same rejection callback as a missing/blocked account. Both providers
   sign out; Admin visibility token refresh also signs out on network failures.
   `blockedUid` prevents same-identity retry until a null auth event. Preserve a
   distinct, fail-closed, recoverable unverified/error state without destroying a
   valid session on transient failures. Confirmed auth/account rejection remains
   separate. Generation checks must remain intact through the correction.

The 11 added behavioral tests reproduce seven failures (two logout failures,
three uncertainty cases, same-identity retry, and Admin refresh network failure).
The other four pass: successful Customer/Admin signout, storage-denied Customer
signout, and the real signup callback's profile-before-subsequent-login sequence.
Pre-correction R5A result: **107 passed / 7 failed / 0 skipped (114 tests)**. The original
103 tests still pass; their static wiring assertions did not catch these defects.
The full requested regression rerun passes **1,015 / 0 / 0**, including all five
localhost-emulator rules suites. Combined review result: **1,122 passed / 7 failed /
0 skipped (1,129 tests)**. Both TypeScript checks and synthetic-config production
builds pass again. Customer changed-file lint remains **7 errors / 2 warnings**
(pre-existing/relocated); Admin equivalent changed-file lint passes. This does not
override either security blocker.

Normal signup explicitly provisions its own Developer/Free profile through the
existing server-enforced Firestore create rules, then signs out and returns to
Login. It does not need missing-profile auto-recreation. (The first-visit write
described in this historical pre-correction note has been removed by the
post-release hotfix.) Selected
plans remain intent only. Missing existing profiles and deletion tombstones are
not recreated. Late profile results are generation-discarded, including after
logout, account switch, timeout, cross-tab null events, and unmount.

All 19 files were semantically reviewed. Significant removals are classified as
LANDING CONTENT RELOCATED (502 of 517 original nonempty Landing lines remain in
AuthEntry), LOGIN ROUTE EXTRACTED, INSECURE ADMIN HANDOFF REMOVED (the old modal
actually constructed `?authToken=`), AUTH CACHE TRUST REMOVED, PROTECTED LAYOUT
HARDENED, DUPLICATE AUTH FLOW REMOVED, and DEAD/UNUSED UI/diagnostics. Missing-profile
auto-recreation, browser-cache role restoration, the old callback-only route/plan
gate and Landing bypass were replaced by server-profile/layout authorization.
The backend subscription policy and single entitlement scheduler remain unchanged.
There are **zero unexplained UNEXPECTED REMOVALS** and no unrelated scope changes.

Production gates remain independent of local-commit review: configured
`NEXT_PUBLIC_ADMIN_APP_ORIGIN` and actual Customer/Admin deployment origins;
verified Node 22 support on actual providers; sibling reporting/shared-source
packaging; existing catalog/report scale limits; PayMongo sandbox validation;
external production config/secrets and coordinated `API_QUOTA_CUTOVER_AT`;
catalog audit/backfill/rollout gates; and real-browser E2E against actual deployed
origins. No production hostname or cross-origin SSO is inferred. The physical
paper/visual flow artifact is **NOT YET UPDATED**. This review does not certify
production auth navigation.

## Two-blocker correction (current implementation)

Only the auth helpers/providers, the two auth layouts, the Privacy caller's
post-confirmation cleanup, and R5A tests/documentation changed in this correction.
No backend, Firestore rules, payment/subscription policy, catalog/import/reporting
logic, dependencies, or lockfiles changed. Full R5A now includes the narrow Privacy
caller adjustment: 11 modified tracked files and 9 new files, 20 total.

### Logout result and failure visibility

- Both providers return a success/failure result and expose logout busy/error state.
  One in-flight action deduplicates repeated clicks. Sidebar callers can continue
  delegating to their provider: their layout shows a visible generic error and Retry
  logout. No raw SDK exception, token, response, or ID is displayed.
- On SDK success: clear derived session state, write the optional Customer Landing
  flag, then route to that application's own Login. Storage denial cannot block this.
- On ordinary SDK rejection: do not clear verified identity, do not navigate, do
  not write the Landing flag, and do not claim success. Preserve still-valid verified
  UI and show that the browser session may still be active; retry remains possible.
  An independent true observer logout or account rejection still closes access.
- A switched identity or unmounted provider cannot be cleared/navigated by an old
  logout completion. Successful logout cancels outstanding verification generations.
- Privacy is different: only after the existing backend reports `deleted: true`,
  it explicitly denies account access and navigates to Login before best-effort local
  signout cleanup. A cleanup failure keeps the authoritative deletion barrier closed,
  shows the recoverable cleanup error, and never restores the deleted profile. A
  successful SDK cleanup alone is not used as proof of backend deletion.

### Verification states and recovery

| State | SDK identity / protected UI / navigation |
| --- | --- |
| initializing | Wait for SDK/profile verification; protected content closed |
| verified | Authoritative role verified; role-appropriate protected UI allowed |
| unauthenticated | SDK observer confirmed null; normal Landing/Login entry decisions |
| invalid | Confirmed 401 or invalid/expired SDK credential; protected UI closed, Login |
| denied | Confirmed missing/non-authorized/deleted/disabled profile or applicable 403; closed, Login/denied copy |
| unverified | Preserve observed SDK identity, remove authorized profile, close protected UI, neutral error + Retry |

Profile/initialization timeouts, network errors, 404, 429, and 5xx are uncertainty,
not proof of revocation. No timeout/network path signs out. Subscription-status
401/403 retain their reviewed endpoint-specific rejection meaning. Retry verifies
both the Customer profile and subscription-status source before authorizing again;
backend entitlement policy and the single entitlement poller remain unchanged.
Polling/manual reads are bounded and a failure stops protected access until retry.

Manual retry can verify the same SDK UID without a null/signout event. Initialization
retry waits for SDK `authStateReady`, rather than guessing from an unsettled null.
Retries deduplicate active attempts, have a 10-second deadline, and do not loop
automatically. Admin visibility/manual retry forces token refresh inside the bounded
attempt; ordinary token observer callbacks do not recursively force another refresh.
Generation checks discard old completions after timeout, retry, account switch,
observer null, successful logout, and unmount. A fresh same-UID Login after confirmed
invalidation must reread authoritative state instead of staying trapped at Login.

Root/Login and both protected layouts intercept uncertainty before mounting route
children: no Landing fallback or protected-content flash. Signup remains responsible
for its existing create-profile/signout sequence; no missing profile is auto-created
by a provider. No token handoff, browser role authority, or return-URL feature returned.

### Corrected validation

The seven original defect tests retain their names and required failure assertions;
none was removed/skipped. Their harness bindings were adapted to the extracted
logout action and bounded Admin reader, with stronger identity/error/retry assertions.
Earlier helper tests that required null SDK identity on timeout were corrected to
require retained identity **and no authorized profile**. They previously encoded
the very conflation this correction removes.

R5A: **150 passed / 0 failed / 0 skipped** under Node 22.20.0. Six supplementary
checks executed the actual compiled Customer/Admin layouts with synthetic hooks:
root, Login, and protected routes render the error/working Retry control without
protected children during uncertainty. These are component checks, not browser E2E.
The full requested regression baseline passes **1,015 / 0 / 0**. Combined suite
result: **1,165 passed / 0 failed / 0 skipped**, excluding the six supplementary
render checks. One concurrent Phase 2B2 rules attempt failed in localhost-emulator
fixture setup with a request timeout; its isolated rerun passed all 35 tests without
changing tests/rules/timeouts. No assertion failure was waived.

Customer and Admin TypeScript and production builds pass with synthetic configuration
in the existing temporary dependency copies. Correction-file Customer/shared-helper
lint is **0 errors / 0 warnings**; full R5A changed-file Customer lint retains the
documented **7 pre-existing/relocated errors / 2 warnings**. Admin equivalent changed-file
lint passes. No lint suppression, dependency installation, or lockfile regeneration
was used for this correction.

Production configuration, packaging, scale, sandbox, audit/rollout, and real-browser
deployed-origin gates listed above remain open. No physical flow artifact was updated.
No commit, staging, push, merge, deployment, production Firebase access, live PayMongo
call, Storage upload, Free Trial, or API History work was performed.
