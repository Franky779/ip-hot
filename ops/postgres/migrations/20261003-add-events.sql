-- 20261003-add-events.sql — A1 事件聚簇 + A2 热度（纯新增，不动现有表）
-- 事件层：同一件事的 N 篇报道聚成一个事件；热度按独立信源数 × 信源分级权重 × 24h 半衰。

-- ========== 事件表 ==========
CREATE TABLE IF NOT EXISTS ip_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_title        text NOT NULL,
  title_cn               text,
  summary_cn             text,              -- 事件综述（模型生成，来源数>=2 时刷新）
  category               text,
  primary_entity         text,              -- 主体 IP / 品牌 / 公司（best-effort）
  first_party_article_id uuid,              -- 一手报道优先展示
  source_count           int DEFAULT 0,     -- 独立信源数
  report_count           int DEFAULT 0,     -- 报道条数
  heat_score             numeric DEFAULT 0,
  heat_prev              numeric DEFAULT 0, -- 6 小时前的热度快照，算「上升」
  heat_prev_at           timestamptz,
  first_seen_at          timestamptz,
  last_seen_at           timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_heat   ON ip_events (heat_score DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_entity ON ip_events (primary_entity, last_seen_at DESC);

-- ========== 事件-报道关联表 ==========
CREATE TABLE IF NOT EXISTS ip_event_reports (
  event_id       uuid REFERENCES ip_events(id) ON DELETE CASCADE,
  article_id     uuid NOT NULL,
  source_name    text,
  is_first_party boolean DEFAULT false,
  relation       text,                    -- SEED / SAME_OCCURRENCE / SAME_STORY
  confidence     numeric,
  manual         boolean DEFAULT false,   -- 人工改过 → 自动聚簇永不覆盖
  created_at     timestamptz DEFAULT now(),
  PRIMARY KEY (event_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_event_reports_article ON ip_event_reports (article_id);

-- ========== relate 用途的预算初始值（pairwise 判断） ==========
-- 天上限必须 >= 小时上限，否则小时窗口永远先撞满、天窗口形同虚设。
-- 2026-10-04 修正：原值 60/600/400 天比小时还小，导致事件聚簇跑到第 400 次
-- 就被「天窗口熔断」掐停，而真实用量只有上线当晚两小时的 400 次。
INSERT INTO llm_budget (purpose, minute_limit, hour_limit, day_limit)
VALUES ('relate', 60, 600, 8000)
ON CONFLICT (purpose) DO NOTHING;

-- 幂等修正已存在的库（天上限 < 小时上限的都会被拉正）
UPDATE llm_budget
   SET day_limit = GREATEST(day_limit, hour_limit * 8)
 WHERE day_limit < hour_limit;

-- ========== 应用账号授权（迁移由 postgres 用户执行时必须显式授权给 ip_hot_app） ==========
GRANT SELECT, INSERT, UPDATE, DELETE ON ip_events, ip_event_reports TO ip_hot_app;
