create extension if not exists pgcrypto;

create table if not exists app_settings (
  key text primary key,
  value integer not null,
  updated_at timestamptz not null default now(),
  constraint app_settings_value_check check (value between 4 and 10)
);

insert into app_settings (key, value)
values ('article_selection_threshold', 6)
on conflict (key) do nothing;

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  url text not null,
  image_url text,
  is_video boolean not null default false,
  title text not null,
  title_cn text,
  summary_cn text,
  category text,
  relevance_score smallint,
  is_selected boolean default false,
  selection_threshold smallint default 6,
  is_manual boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  commentary text
);

alter table articles add column if not exists selection_threshold smallint default 6;
update articles set selection_threshold = 6 where selection_threshold is null;
alter table articles drop constraint if exists articles_selection_threshold_check;
alter table articles add constraint articles_selection_threshold_check check (selection_threshold between 4 and 10);

alter table articles add column if not exists is_manual boolean not null default false;

create unique index if not exists articles_source_url_unique on articles (source, url);
create index if not exists idx_articles_created_at on articles (created_at desc);
create index if not exists idx_articles_published_at on articles (published_at desc);
create index if not exists idx_articles_category on articles (category);
create index if not exists idx_articles_pending_classification on articles (category, created_at)
  where category = '待分类' and title_cn is not null and summary_cn is not null;
create index if not exists idx_articles_complete on articles (published_at desc)
  where title_cn is not null and summary_cn is not null and category is not null and commentary is not null;
create index if not exists idx_articles_is_manual on articles (is_manual) where is_manual;

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
  last_test_message text not null default '',
  platform text not null default '',
  x_handle text not null default '',
  x_user_id text not null default '',
  x_profile_url text not null default '',
  official_evidence_url text not null default '',
  verification_status text not null default 'unverified',
  verified_by text not null default '',
  verified_at timestamptz,
  last_reviewed_at timestamptz,
  verification_notes text not null default '',
  constraint info_sources_verification_status_check check (verification_status in ('unverified', 'verified', 'revoked'))
);

alter table info_sources add column if not exists platform text not null default '';
alter table info_sources add column if not exists x_handle text not null default '';
alter table info_sources add column if not exists x_user_id text not null default '';
alter table info_sources add column if not exists x_profile_url text not null default '';
alter table info_sources add column if not exists official_evidence_url text not null default '';
alter table info_sources add column if not exists verification_status text not null default 'unverified';
alter table info_sources add column if not exists verified_by text not null default '';
alter table info_sources add column if not exists verified_at timestamptz;
alter table info_sources add column if not exists last_reviewed_at timestamptz;
alter table info_sources add column if not exists verification_notes text not null default '';

alter table info_sources add column if not exists is_official boolean not null default false;

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

create table if not exists site_pages (
  id text primary key,
  title text not null,
  blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_created_at on feedback (created_at desc);

create table if not exists research_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null,
  title text not null,
  published_at date not null,
  markdown_content text not null,
  content_format text not null default 'markdown',
  github_backup_status text not null default 'pending',
  github_backup_path text,
  github_backup_error text,
  github_backed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_reports_category_check check (category in ('品类研究', '品牌/IP与授权营销研究')),
  constraint research_reports_backup_status_check check (github_backup_status in ('pending', 'backed_up', 'failed')),
  constraint research_reports_content_format_check check (content_format in ('markdown', 'html'))
);

alter table research_reports add column if not exists content_format text not null default 'markdown';
alter table research_reports drop constraint if exists research_reports_category_check;
update research_reports set category = '品牌/IP与授权营销研究' where category in ('品牌/IP分析', '授权与营销研究');
alter table research_reports add constraint research_reports_category_check check (category in ('品类研究', '品牌/IP与授权营销研究'));
alter table research_reports drop constraint if exists research_reports_content_format_check;
alter table research_reports add constraint research_reports_content_format_check check (content_format in ('markdown', 'html'));

create index if not exists idx_research_reports_category_date on research_reports (category, published_at desc, created_at desc);
