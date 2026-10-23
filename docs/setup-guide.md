# Setup guide: deploy, move to Supabase, import products

Do the parts in order. Each step says where to click and what you should see.

## Part 1: Put the new version live

1. Open GitHub → repository **Leyy12/InventaAPI** → **Pull requests** → **New pull request**.
2. Base: `master`. Compare: `claude/friendly-edison-01plpl`. Click **Create pull request**, then **Merge**.
3. Open Vercel. The three projects **inventa-api**, **inventa-admin** and **inventa-dashboard**
   redeploy by themselves after the merge. Wait until each shows **Ready**.
   If one does not start: open it → **Deployments** → newest → **⋯** → **Redeploy**.
4. Check: open the admin panel → **Products**. The **Bulk Images** button is gone and
   **Import CSV** opens the new window.

## Part 2: Move everything to Supabase

Data, sign-in, photos and the daily jobs all move to Supabase. Follow
[supabase-switch.md](supabase-switch.md) step by step. In short:

1. On the **current** live admin panel: **Settings** → **Copy to Supabase**, run it until
   done, and check every count matches. (This button goes away with the switch.)
2. Add the Supabase settings on Vercel (listed in supabase-switch.md).
3. Merge the switch. Wait until the three Vercel projects show **Ready**.
4. Delete the old Firebase Cloud Functions in the Firebase console.
5. Everyone, admins included, sets a new password once with **Forgot password** on the
   customer login page. Accounts, plans and API keys stay the same.

Products have no price. The copy leaves behind any prices old products still hold
in Firebase, so Supabase starts without them.

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
leaves them behind. To delete any left in Supabase, from the project folder
(with `SUPABASE_DB_URL` set):

```
node scripts/backup-products.mjs              # optional: save a copy first
node scripts/remove-product-prices.mjs        # shows how many products have a price
node scripts/remove-product-prices.mjs --apply
```
