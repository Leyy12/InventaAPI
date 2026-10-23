-- The trial-expiry email job (functions/trial-warning.mjs) records each warning here.
-- Same shape and rules as the other Inventa tables: Firestore document id + JSON data,
-- Row Level Security on with no policies (server connection only).
create table if not exists public.trial_warning_deliveries (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.trial_warning_deliveries enable row level security;
create or replace trigger trial_warning_deliveries_touch before update on public.trial_warning_deliveries
  for each row execute function public.touch_updated_at();
