-- Automatic app detection (services/api-consumers.js) and "count each product
-- variant once per app per month" (services/paid-monthly-quota.js).
--   api_key_consumers: one row per detected website (domain) or server (IP range)
--     per API key: first/last seen, request count, blocked flag.
--   account_paid_monthly_delivered: per account, UTC month and app, which product
--     variants that app already received (short hashes), so repeats are not counted.
-- Same shape and rules as the other Inventa tables: stored document id + JSON data,
-- Row Level Security on with no policies (server connection only).
do $$
declare c text;
begin
  foreach c in array array['api_key_consumers', 'account_paid_monthly_delivered'] loop
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

create index if not exists api_key_consumers_user_idx on public.api_key_consumers ((data->>'userId'));
