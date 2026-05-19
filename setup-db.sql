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
