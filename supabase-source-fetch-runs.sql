-- 信源级抓取运行记录：用于“今日是否覆盖”和逐来源审计。
-- 可在 Supabase Dashboard -> SQL Editor 中重复执行。
create table if not exists public.source_fetch_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid,
  source_name text not null,
  source_url text not null default '',
  cron_log_id uuid,
  trigger_type text not null default 'cron',
  execution_mode text not null default 'cloud',
  scheduled_for timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'running',
  discovered_count integer not null default 0,
  fetched_count integer not null default 0,
  blocked_count integer not null default 0,
  dead_count integer not null default 0,
  duplicate_count integer not null default 0,
  inserted_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  constraint source_fetch_runs_status_check check (status in ('running', 'success', 'empty', 'failed', 'skipped')),
  constraint source_fetch_runs_execution_mode_check check (execution_mode in ('cloud', 'local', 'manual'))
);

create index if not exists idx_source_fetch_runs_started_at
  on public.source_fetch_runs (started_at desc);
create index if not exists idx_source_fetch_runs_source_started
  on public.source_fetch_runs (source_id, started_at desc);
create index if not exists idx_source_fetch_runs_source_url_started
  on public.source_fetch_runs (source_url, started_at desc);

alter table public.source_fetch_runs enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.source_fetch_runs to service_role;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'source_fetch_runs'
      and policyname = 'Service role full access on source_fetch_runs'
  ) then
    create policy "Service role full access on source_fetch_runs" on public.source_fetch_runs
      for all to service_role using (true) with check (true);
  end if;
end $$;
