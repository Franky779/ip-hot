-- IP日报缓存表
-- 运行方式: psql $DATABASE_URL -f ops/migration/daily_reports.sql

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  period_date DATE NOT NULL,
  summary TEXT,
  highlights TEXT,
  category_counts JSONB DEFAULT '{}',
  article_data TEXT DEFAULT '[]',
  total_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(period, period_date)
);

COMMENT ON TABLE daily_reports IS 'IP日报LLM摘要缓存表';
COMMENT ON COLUMN daily_reports.period IS '日报周期: daily / weekly / monthly';
COMMENT ON COLUMN daily_reports.period_date IS '周期起始日期: 日报=当天, 周报=周一, 月报=1日';
COMMENT ON COLUMN daily_reports.article_data IS 'JSON数组, 包含本期文章 {id, title_cn, url, category}';
