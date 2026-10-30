-- Rows a customer deleted from their own request history (services/api-history.js):
-- one row per account with the ids of deleted rows and, for "clear all", a time
-- before which every row is hidden. The api_telemetry records themselves are kept
-- for admin traffic statistics. Same shape and rules as the other Inventa tables.
create table if not exists public.api_history_hidden (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.api_history_hidden enable row level security;
create or replace trigger api_history_hidden_touch before update on public.api_history_hidden
  for each row execute function public.touch_updated_at();
