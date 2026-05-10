-- ============================================================
-- IP行业雷达站数据库初始化/升级脚本
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. 为 articles 表补充 LLM 预留字段
alter table public.articles
  add column if not exists relevance_score smallint,
  add column if not exists is_selected boolean default false;

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

-- 3. 确认 articles 表唯一索引（去重用）
create unique index if not exists articles_source_url_unique
  on public.articles (source, url);
