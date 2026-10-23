# Setup guide: deploy, move data to Supabase, import products

Do the parts in order. Each step says where to click and what you should see.

## Part 1: Put the new version live

1. Open GitHub → repository **Leyy12/InventaAPI** → **Pull requests** → **New pull request**.
2. Base: `master`. Compare: `claude/friendly-edison-01plpl`. Click **Create pull request**, then **Merge**.
3. Open Vercel. The three projects **inventa-api**, **inventa-admin** and **inventa-dashboard**
   redeploy by themselves after the merge. Wait until each shows **Ready**.
   If one does not start: open it → **Deployments** → newest → **⋯** → **Redeploy**.
4. Check: open the admin panel → **Products**. The **Bulk Images** button is gone and
   **Import CSV** opens the new window.

## Part 2: Move all data to Supabase

Sign-in and uploaded photo files stay on Firebase. Everything else moves.

1. Admin panel → **Settings** → **Copy to Supabase** → start the copy.
   Keep the page open until it says it is done. It only reads Firebase; nothing is deleted.
2. On the same card, check the counts. Every collection must show the same number for
   Firebase and Supabase. If not, run the copy again (it is safe to repeat).
3. Vercel → **inventa-api** → **Settings** → **Environment Variables** → **Add**:
   - Key: `DATA_BACKEND`
   - Value: `supabase`
   - Environments: **Production** and **Preview**
4. **Deployments** → newest → **⋯** → **Redeploy**. Wait for **Ready**.
5. Check: log in to the dashboard and the admin panel. Products, API keys and users
   should all still be there.
6. Scheduled jobs (subscription expiry and trial-warning emails) run as Firebase Cloud
   Functions. Point them at Supabase too, from the project folder on your computer:
   ```
   cd functions
   echo "DATA_BACKEND=supabase" >> .env
   firebase functions:secrets:set SUPABASE_DB_URL      # paste the same value as on Vercel
   firebase deploy --only functions
   ```

Anything saved in Firebase between step 1 and step 4 is not copied. Do this at a quiet
time, or run the copy once more just before step 3.

Products have no price. The copy leaves behind any prices old products still hold
in Firebase, so Supabase starts without them.

**To undo:** delete `DATA_BACKEND` on Vercel (or set it to `firebase`) and redeploy.
Data saved while on Supabase stays only in Supabase.

## Part 3: Import products and photos with a CSV

1. Admin panel → **Products** → **Import CSV**.
2. Leave **Skip rows without an image** ticked if you only want rows that have a photo link.
3. Drop the CSV on the window (any size, any column order). Your catalog export format
   (Name, Brand, Segment, Category, Flavors, Specs, image_url) works as is.
4. Read the four tabs. Nothing is saved yet.
   - **New**: products that will be created. Products have no price; a price column is dropped.
   - **Appended**: a new size of a product that already exists; added to that product.
   - **Updates**: existing products that get something new, usually a missing photo.
     Existing photos are never replaced.
   - **Skipped**: already in the catalog, no image, repeated
     rows, or rows that cannot be matched safely. The reason is under each name.
5. Click **Confirm Import**. Rows are saved in batches of 100 with a progress bar. Keep the
   window open. **Stop** pauses after the current batch; **Continue Import** carries on.
   Rows already saved are never saved twice.
6. When it finishes, click **Download skipped rows** for a list of everything not imported
   and why. Fix those rows in the file and import it again; finished rows are skipped.

## Removing old prices that are still stored

Products have no price, and none is ever shown, sent or saved again. Products created
before this change may still hold one in the database. Moving to Supabase (Part 2)
leaves them behind. To delete them where the data is now, from the project folder:

```
node scripts/backup-products.mjs              # optional: save a copy first
node scripts/remove-product-prices.mjs        # shows how many products have a price
node scripts/remove-product-prices.mjs --apply
```
