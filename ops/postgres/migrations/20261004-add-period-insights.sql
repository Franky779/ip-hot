-- 20261004-add-period-insights.sql — A4 周报 / 月报
-- 日报表加两列：insights（周期洞察 JSON）与 prompt_version（生成该报告的提示词版本）。
-- 洞察含：Top 热点事件、数据快照、活跃 IP Top N、授权交易线索。纯 SQL 聚合，无模型成本。
-- 执行方式：psql "$DATABASE_URL" -f ops/postgres/migrations/20261004-add-period-insights.sql

-- daily_reports 在旧 schema.sql 里是「日报」语义（date/title/content），
-- 线上真实结构是 period + period_date + summary + highlights + category_counts +
-- article_data + total_count + content_html。这里只做增量，不动已有列。

alter table daily_reports add column if not exists insights jsonb;
alter table daily_reports add column if not exists prompt_version text;

-- 周报/月报列表页按周期 + 时间倒序取
create index if not exists idx_daily_reports_period_date
  on daily_reports (period, period_date desc);

-- ========== 应用账号授权（迁移由 postgres 用户执行时必须显式授权给 ip_hot_app） ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON daily_reports TO ip_hot_app;
