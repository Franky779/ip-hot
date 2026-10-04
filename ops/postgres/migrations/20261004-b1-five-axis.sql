-- 20261004-b1-five-axis.sql — B1 五轴评分改造
-- 1) articles.relevance_score smallint → numeric(4,1)：两次独立打分均值是 0.5 步长
-- 2) 新列 score_axes / score_runs / content_type
-- 3) app_settings 三级信源分级门槛（方案文档 B1 的 55/62/72 按 0-10 量纲校准折算，
--    后续可用 scripts/eval-selection.mjs 校准后直接 update，改库即生效）
-- 4) summarize 预算翻倍（两次独立打分 = 调用量×2）
-- 幂等：可重复执行。迁移由 postgres 用户执行，应用账号默认无权限，末尾必须 GRANT。

-- 0) app_settings.value integer → numeric：分级门槛允许 0.5 步长，整型会把 5.5 四舍五入成 6
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_settings' AND column_name = 'value' AND data_type IN ('integer', 'smallint')
  ) THEN
    ALTER TABLE app_settings ALTER COLUMN value TYPE numeric(6,2);
  END IF;
END $$;
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_value_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_value_check CHECK (value BETWEEN 4 AND 10);

-- 1) 列类型：仅当还是 smallint 时才改（重复执行不重写表）
--    relevance_score 存两次打分均值；selection_threshold 存该文实际应用的分级门槛（可为 0.5 步长）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'relevance_score' AND data_type = 'smallint'
  ) THEN
    ALTER TABLE articles ALTER COLUMN relevance_score TYPE numeric(4,1);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'articles' AND column_name = 'selection_threshold' AND data_type = 'smallint'
  ) THEN
    ALTER TABLE articles ALTER COLUMN selection_threshold TYPE numeric(4,1);
  END IF;
END $$;

-- 2) 五轴新列
ALTER TABLE articles ADD COLUMN IF NOT EXISTS score_axes jsonb;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS score_runs jsonb;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_type text;

-- 3) 分级门槛初始值（T1 官方一手放宽、T2 二手报道收紧；均允许 0.5 步长）
insert into app_settings (key, value) values
  ('article_selection_threshold_t1', 5.5),
  ('article_selection_threshold_t1_5', 6.5),
  ('article_selection_threshold_t2', 7)
on conflict (key) do nothing;
-- 幂等拉正：历史整型期间可能被四舍五入过，重复执行恢复精确值
update app_settings set value = 5.5 where key = 'article_selection_threshold_t1' and value <> 5.5;
update app_settings set value = 6.5 where key = 'article_selection_threshold_t1_5' and value <> 6.5;
update app_settings set value = 7 where key = 'article_selection_threshold_t2' and value <> 7;

-- 4) summarize 调用量×2，天上限 3000 → 6000（幂等：只升不降）
update llm_budget set day_limit = 6000
where purpose = 'summarize' and day_limit < 6000;

-- 铁律：迁移由 postgres 执行，应用账号默认无新列/新键权限
GRANT SELECT, UPDATE ON articles TO ip_hot_app;
GRANT SELECT, UPDATE ON app_settings TO ip_hot_app;
GRANT SELECT, UPDATE ON llm_budget TO ip_hot_app;
