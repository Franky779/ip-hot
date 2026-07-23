create extension if not exists pgcrypto;

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null,
  title text not null,
  title_cn text,
  summary_cn text,
  category text,
  relevance_score smallint,
  is_selected boolean default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  commentary text
);

create unique index if not exists articles_source_url_unique on articles (source, url);
create index if not exists idx_articles_created_at on articles (created_at desc);
create index if not exists idx_articles_published_at on articles (published_at desc);
create index if not exists idx_articles_category on articles (category);
create index if not exists idx_articles_complete on articles (published_at desc)
  where title_cn is not null and summary_cn is not null and category is not null and commentary is not null;

create table if not exists info_sources (
  id uuid primary key default gen_random_uuid(),
  section_id text not null,
  section_title text not null,
  region text not null,
  name text not null,
  url text not null,
  type text not null,
  description text not null default '',
  method text not null default '',
  sort_order integer default 0,
  created_at timestamptz default now(),
  fetch_type text not null default 'web',
  enabled boolean not null default false,
  last_test_status text not null default 'untested',
  last_tested_at timestamptz,
  last_test_message text not null default ''
);

create index if not exists idx_info_sources_section_id on info_sources (section_id);
create index if not exists idx_info_sources_region on info_sources (region);
create index if not exists idx_info_sources_sort_order on info_sources (sort_order);
create index if not exists idx_info_sources_enabled_fetch_type on info_sources (enabled, fetch_type);

create table if not exists cron_logs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null default 'cron',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  fetch_total_fetched integer default 0,
  fetch_total_inserted integer default 0,
  llm_pending integer default 0,
  llm_processed integer default 0,
  llm_failed integer default 0,
  status text not null default 'running',
  error_message text,
  details jsonb default '{}'::jsonb
);

create index if not exists idx_cron_logs_started_at on cron_logs (started_at desc);

create table if not exists source_fetch_runs (
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

create index if not exists idx_source_fetch_runs_started_at on source_fetch_runs (started_at desc);
create index if not exists idx_source_fetch_runs_source_started on source_fetch_runs (source_id, started_at desc);
create index if not exists idx_source_fetch_runs_source_url_started on source_fetch_runs (source_url, started_at desc);

create table if not exists classification_learnings (
  id uuid primary key default gen_random_uuid(),
  article_id uuid,
  original_title text not null,
  original_category text,
  corrected_category text not null,
  title_keywords text[],
  match_count integer default 1,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_classification_learnings_active on classification_learnings (is_active);
create index if not exists idx_classification_learnings_keywords on classification_learnings using gin (title_keywords);

create table if not exists pipeline_state (
  id integer primary key default 1,
  status text not null default 'idle',
  stage text,
  current_group integer default 0,
  total_groups integer default 0,
  current_source text,
  total_fetched integer default 0,
  total_inserted integer default 0,
  total_llm_processed integer default 0,
  total_llm_selected integer default 0,
  total_llm_failed integer default 0,
  total_low_score_deleted integer default 0,
  rounds integer default 0,
  started_at timestamptz,
  last_update timestamptz default now(),
  error_message text
);

insert into pipeline_state (id, status) values (1, 'idle') on conflict (id) do nothing;

create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  title text not null,
  content text not null,
  article_count integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists changelogs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  created_at timestamptz default now(),
  version text
);

