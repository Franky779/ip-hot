-- 20261004-add-prompt-version.sql — B4 提示词版本化
-- 提示词正文外置到 prompts/*.md，版本 = 文件内容 sha256 前 12 位。
-- 目的：改提示词只影响之后新处理的资料，历史文章不重算，且事后能追溯「这条是哪个版本打的分」。
-- 执行方式：psql "$DATABASE_URL" -f ops/postgres/migrations/20261004-add-prompt-version.sql

-- 回执：记录产出该结果的提示词版本
alter table llm_receipts add column if not exists prompt_version text;

-- 文章：记录这篇文章的评分由哪个提示词版本产出
alter table articles add column if not exists prompt_version text;

create index if not exists idx_articles_prompt_version
  on articles (prompt_version) where prompt_version is not null;

-- 便于按版本核对「换提示词后新旧标准各处理了多少篇」
create index if not exists idx_llm_receipts_prompt_version
  on llm_receipts (prompt_version, created_at desc)
  where prompt_version is not null;

-- ========== 应用账号授权（迁移由 postgres 用户执行时必须显式授权给 ip_hot_app） ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON articles TO ip_hot_app;
