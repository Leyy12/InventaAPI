# Moving fully to Supabase

Everything runs on Supabase: data (Postgres), sign-in (Supabase Auth), product
photos (Supabase Storage, private bucket `product-media`) and the daily jobs (Vercel
Cron calling the API). Firebase is no longer used.

## What changes for people

- **Passwords.** Firebase passwords cannot be moved to Supabase. Every existing
  customer and admin sets a new password once, with **Forgot password** on the
  customer login page (admins too; then they log in to the admin panel as usual).
  Their account, plan, API keys and history stay the same.
- **New signups** work as before: email code, then the account is created.
- **Uploaded product photos** stored in Firebase Storage do not move. Products that
  use a photo link (`image_url`) are not affected.

## Order of steps

The data copy button exists only in the version **before** this change, so copy first.

1. **Copy the data** (still on the current live version): admin panel → **Settings** →
   **Copy to Supabase**. Run it until done and check every count matches.
2. **Add settings on Vercel** (Settings → Environment Variables, Production and Preview):
   - `inventa-api`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
     (Supabase → Project Settings → API keys; the secret key starts with `sb_secret_`),
     `CRON_SECRET` (16+ random characters). Keep `SUPABASE_DB_URL` and
     `FIREBASE_PROJECT_ID` (it is now only the data label: `inventaapi-db` = Production).
     For photo uploads also set `PRODUCT_MEDIA_ENABLED=true` and
     `PRODUCT_MEDIA_PUBLIC_ORIGIN` (the API's own address).
   - `inventa-dashboard` and `inventa-admin`: `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (never the secret key).
3. **Merge** the change. The three projects redeploy.
4. **Turn off Firebase Cloud Functions** (Firebase console → Functions → delete
   `downgradeExpiredSubscriptions` and `monitorFreeTrials`), or they keep running
   against the old Firestore data. The same jobs now run daily from `vercel.json`.
5. **Reset your own password** with Forgot password, log in to both apps and check.

Anything saved in Firebase after step 1 is not in Supabase. Do steps 1–3 at a quiet time.

## Undo

Revert the merge on GitHub and redeploy. Sign-in goes back to Firebase; anything
saved while on Supabase stays only in Supabase.
