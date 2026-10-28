-- Monthly API request counters for active Pro and Pro Max subscriptions
-- (services/paid-monthly-quota.js). One row per account, UTC month and bucket:
-- Pro uses the bucket "account"; Pro Max uses one bucket per Business Segment.
-- Same shape and rules as the other Inventa tables: stored document id + JSON data,
-- Row Level Security on with no policies (server connection only).
create table if not exists public.account_paid_monthly_usage (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.account_paid_monthly_usage enable row level security;
create or replace trigger account_paid_monthly_usage_touch before update on public.account_paid_monthly_usage
  for each row execute function public.touch_updated_at();
