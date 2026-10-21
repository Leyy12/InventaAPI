-- Inventa data tables, one per former Firestore collection.
-- Each row keeps the Firestore document id and its fields as JSON, so the API's
-- data layer (database/postgres-firestore.js) reads and writes them the same way.
-- Row Level Security is on with no policies: only the server's direct Postgres
-- connection can reach these tables; the public anon key cannot.

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare c text;
begin
  foreach c in array array[
    'users', 'products', 'api_keys', 'system', 'audit_logs', 'api_telemetry', 'account_trial_usage',
    'account_api_usage', 'notifications', 'account_request_contracts', 'product_submission_identity',
    'product_requests', 'customer_sales', 'product_submission_operations', 'product_media',
    'catalog_import_previews', 'catalog_control', 'contact_inquiries', 'catalog_import_results',
    'catalog_create_operations', 'api_key_generation_days', 'account_free_monthly_usage',
    'email_verifications', 'password_resets', 'payment_orders', 'payment_checkout_locks',
    'payment_sessions', 'payment_events', 'transactions', 'enterprise_inquiries', 'categories'
  ] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null default ''{}''::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now())', c);
    execute format('alter table public.%I enable row level security', c);
    execute format('create or replace trigger %I before update on public.%I
      for each row execute function public.touch_updated_at()', c || '_touch', c);
  end loop;
end $$;

-- Lookups the app filters on.
do $$
declare pair text[];
begin
  foreach pair slice 1 in array array[
    ['users','username'], ['users','email'], ['users','uid'], ['users','plan'], ['users','trialExpiresAt'],
    ['products','businessType'], ['products','barcode'], ['products','nameLower'], ['products','segment'],
    ['products','status'], ['api_keys','userId'], ['api_keys','key'], ['api_keys','user_email'],
    ['notifications','userId'], ['audit_logs','timestamp'], ['api_telemetry','userId'],
    ['api_telemetry','occurredAt'], ['customer_sales','userId'], ['product_requests','userId'],
    ['product_requests','status'], ['transactions','userId']
  ] loop
    execute format('create index if not exists %I on public.%I ((data #> %L::text[]))',
      pair[1] || '_' || pair[2] || '_idx', pair[1], '{' || pair[2] || '}');
  end loop;
end $$;
