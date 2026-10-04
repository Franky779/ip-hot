-- 20261005-b2-prescreen.sql — B2 预筛前置
-- 预筛是完整打分前的超短提示词粗判（成本约 1/10），purpose=prefilter 独立记账。
-- 预筛调用失败时 fail-open 放行进入完整打分；整体停用改服务端环境变量 LLM_PRESCREEN=off。
-- 幂等：可重复执行。迁移由 postgres 用户执行，应用账号默认无权限，末尾必须 GRANT。

-- 1) prefilter 预算初值（分钟≤小时≤天，天 ≥ 小时×8；与 20261002-add-llm-budget.sql 各用途口径一致）
insert into llm_budget (purpose, minute_limit, hour_limit, day_limit)
values ('prefilter', 60, 1200, 12000)
on conflict (purpose) do nothing;

-- 2) 铁律：应用账号补授权（llm_budget 表级授权，幂等）
GRANT SELECT, UPDATE ON llm_budget TO ip_hot_app;
