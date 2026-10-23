-- Private bucket for product photos (services/supabase-storage.js). Not public: photos
-- are read with the server's secret key and served through the API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', false, 3145728, array['image/webp'])
on conflict (id) do update set public = false;
