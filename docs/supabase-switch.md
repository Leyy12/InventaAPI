# Moving app data to Supabase

All app data (products, users, API keys, payments, logs…) can live in Supabase
instead of Firestore. Sign-in (Firebase Auth) and uploaded product photos
(Firebase Storage) stay on Firebase.

The API already has `SUPABASE_DB_URL` set on Vercel (`inventa-api`). The Supabase
tables come from `supabase/migrations/`.

## Steps

1. Deploy the latest code to `inventa-api` and `inventa-admin`.
2. In the admin panel, open **Settings → Copy to Supabase** and run the copy until
   it says it is done. Firebase is only read; running it again refreshes the copy.
3. Check that every collection shows matching Firebase and Supabase counts.
4. On Vercel, project `inventa-api`, add `DATA_BACKEND` = `supabase`
   (Production and Preview), then redeploy.
5. For the scheduled jobs (Cloud Functions), set the `DATA_BACKEND` parameter to
   `supabase` and the `SUPABASE_DB_URL` secret, then redeploy the functions.

Data written to Firebase between step 2 and step 4 is not copied. Run the copy once
more right before step 4, or switch at a quiet time.

## Undo

Remove `DATA_BACKEND` (or set it to `firebase`) and redeploy. Anything written while
on Supabase stays only in Supabase.
