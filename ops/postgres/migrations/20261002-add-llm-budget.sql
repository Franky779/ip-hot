-- 20261002: LLM 调用回执与预算熔断
-- 向后兼容增量：只新增两张表，不修改任何现有表。
-- 执行方式：psql "$DATABASE_URL" -f ops/postgres/migrations/20261002-add-llm-budget.sql

-- 付费回执：每次模型调用先记账再调用，结果复用，避免重复花钱。
create table if not exists llm_receipts (
  id                uuid primary key default gen_random_uuid(),
  purpose           text not null,
  model             text not null,
  input_hash        text not null,
  request_chars     integer not null default 0,
  response_json     text,
  prompt_tokens     integer,
  completion_tokens integer,
  status            text not null default 'pending',
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 相同 purpose + model + 输入只保留一条记录，用于结果复用。
create unique index if not exists idx_llm_receipts_hash
  on llm_receipts (purpose, model, input_hash);

create index if not exists idx_llm_receipts_created
  on llm_receipts (purpose, created_at desc);

create index if not exists idx_llm_receipts_pending
  on llm_receipts (status) where status = 'pending';

-- 预算上限：按调用用途分别设限。超限后该类调用暂停，等待窗口滑过。
create table if not exists llm_budget (
  purpose      text primary key,
  minute_limit integer not null default 120,
  hour_limit   integer not null default 3000,
  day_limit    integer not null default 30000,
  enabled      boolean not null default true,
  updated_at   timestamptz not null default now()
);

insert into llm_budget (purpose) values ('summarize') on conflict (purpose) do nothing;
