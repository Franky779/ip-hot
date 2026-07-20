-- ============================================================
-- IP行业雷达站数据库初始化/升级脚本
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. 为 articles 表补充 LLM 预留字段
alter table public.articles
  add column if not exists relevance_score smallint,
  add column if not exists is_selected boolean default false,
  add column if not exists commentary text;

-- 2. 创建 daily_reports 表（日报功能预留）
create table if not exists public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  title text not null,
  content text not null,
  article_count int not null default 0,
  created_at timestamptz default now()
);

-- 启用 RLS
alter table public.daily_reports enable row level security;

-- service_role 全权限
create policy "Service role full access on daily_reports" on public.daily_reports
  for all to service_role using (true) with check (true);

-- anon 只读
create policy "Anon read access on daily_reports" on public.daily_reports
  for select to anon using (true);

-- 3. 为 articles 表添加部分索引（加速已完成 LLM 处理文章的查询）
create index if not exists idx_articles_complete
  on public.articles (published_at desc)
  where title_cn is not null and summary_cn is not null and category is not null and commentary is not null;

-- 4. 确认 articles 表唯一索引（去重用）
create unique index if not exists articles_source_url_unique
  on public.articles (source, url);

-- 4. 创建 info_sources 表（信息源管理）
create table if not exists public.info_sources (
  id uuid primary key default gen_random_uuid(),
  section_id text not null,
  section_title text not null,
  region text not null,
  name text not null,
  url text not null,
  type text not null,
  description text not null default '',
  method text not null default '',
  fetch_type text not null default 'web',
  enabled boolean not null default false,
  last_test_status text not null default 'untested',
  last_tested_at timestamptz,
  last_test_message text not null default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_info_sources_section_id on public.info_sources (section_id);
create index if not exists idx_info_sources_region on public.info_sources (region);
create index if not exists idx_info_sources_sort_order on public.info_sources (sort_order);

-- service_role 全权限
alter table public.info_sources enable row level security;
create policy "Service role full access on info_sources" on public.info_sources
  for all to service_role using (true) with check (true);

-- anon 只读
create policy "Anon read access on info_sources" on public.info_sources
  for select to anon using (true);

-- 5. 创建 changelogs 表（版本迭代日志）
create table if not exists public.changelogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.changelogs enable row level security;
create policy "Service role full access on changelogs" on public.changelogs
  for all to service_role using (true) with check (true);
create policy "Anon read access on changelogs" on public.changelogs
  for select to anon using (true);

-- 6. 创建 cron_logs 表（抓取任务日志）
create table if not exists public.cron_logs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'cron', -- 'cron' | 'manual'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  fetch_total_fetched int default 0,
  fetch_total_inserted int default 0,
  llm_pending int default 0,
  llm_processed int default 0,
  llm_failed int default 0,
  status text not null default 'running', -- 'running' | 'success' | 'error'
  error_message text,
  details jsonb default '{}'
);

-- 索引：按时间倒序查最近日志
create index if not exists idx_cron_logs_started_at on public.cron_logs (started_at desc);

alter table public.cron_logs enable row level security;
create policy "Service role full access on cron_logs" on public.cron_logs
  for all to service_role using (true) with check (true);
create policy "Anon read access on cron_logs" on public.cron_logs
  for select to anon using (true);

-- 7. 信源级抓取运行记录（运营台的今日覆盖与逐来源审计）
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

create index if not exists idx_source_fetch_runs_started_at on public.source_fetch_runs (started_at desc);
create index if not exists idx_source_fetch_runs_source_started on public.source_fetch_runs (source_id, started_at desc);
create index if not exists idx_source_fetch_runs_source_url_started on public.source_fetch_runs (source_url, started_at desc);

alter table public.source_fetch_runs enable row level security;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.source_fetch_runs to service_role;
create policy "Service role full access on source_fetch_runs" on public.source_fetch_runs
  for all to service_role using (true) with check (true);
