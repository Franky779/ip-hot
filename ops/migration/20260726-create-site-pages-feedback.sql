begin;

set local role ip_hot_app;

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

commit;
