-- 20261004-add-event-industry-gate.sql — A8 热点榜行业价值闸门 + 周窗口
--
-- 背景（2026-10-04 线上实测）：热榜首版 15 条里没有一条真正的授权联名，
-- 全是影视票房、体育赛事、明星动态、每周推荐。根因是文章层 relevance_score
-- 回答的问题与热榜要回答的问题不同——「文章合格」≠「对授权从业者有行动价值」。
-- 这道闸门在事件层补上后者的判断。
--
-- 迁移幂等，可重跑。

-- ========== 闸门判定结果 ==========
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS industry_relevant boolean;
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS gate_reason      text;
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS gate_checked_at  timestamptz;

-- ========== 人工隐藏（后台点「不相关」→ 事件退出榜单，数据保留可恢复） ==========
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS hidden           boolean DEFAULT false;
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS hidden_reason    text;
ALTER TABLE ip_events ADD COLUMN IF NOT EXISTS hidden_at        timestamptz;

COMMENT ON COLUMN ip_events.industry_relevant IS '行业价值闸门判定结果；null=未判定（不上榜，等下一轮）';
COMMENT ON COLUMN ip_events.gate_reason      IS '闸门判定理由（30字内，便于人工复核判断依据）';
COMMENT ON COLUMN ip_events.hidden           IS '人工隐藏：true 时无论 industry_relevant 如何都不进榜单，可恢复';

-- 榜单查询走这个索引：先按热度倒序取候选，再过滤 hidden / industry_relevant
CREATE INDEX IF NOT EXISTS idx_events_gate ON ip_events (heat_score DESC, last_seen_at DESC)
  WHERE hidden IS NOT TRUE AND industry_relevant IS TRUE;

-- 闸门轮询用：捞未判定的事件
CREATE INDEX IF NOT EXISTS idx_events_gate_pending ON ip_events (heat_score DESC)
  WHERE industry_relevant IS NULL AND hidden IS NOT TRUE;

-- ========== 闸门调用预算 ==========
-- 闸门每轮最多判 25 个事件，量很小；但它是唯一挡在热榜前的模型调用，
-- 宁可熔断也不能让热榜无内容可上，所以给较宽的窗口。
INSERT INTO llm_budget (purpose, minute_limit, hour_limit, day_limit)
VALUES ('industry_gate', 30, 200, 800)
ON CONFLICT (purpose) DO UPDATE SET
  minute_limit = excluded.minute_limit,
  hour_limit   = excluded.hour_limit,
  day_limit    = excluded.day_limit;

-- ========== 重新初始化存量事件的闸门状态 ==========
-- 已有事件全部置为 null（未判定），由闸门分批重判。
-- 刻意不复用任何历史推断：闸门是新标准，复用旧判定等于「新旧标准混排」。
UPDATE ip_events SET industry_relevant = NULL WHERE industry_relevant IS DISTINCT FROM NULL;

-- ========== 应用账号授权 ==========
-- 迁移由 postgres 用户执行时，应用账号默认无权限，接口会报 permission denied
GRANT SELECT, INSERT, UPDATE, DELETE ON ip_events, ip_event_reports TO ip_hot_app;
