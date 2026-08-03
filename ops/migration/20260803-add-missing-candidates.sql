-- 2026-08-03 IP NEWS 全量查重后补缺：Polygon、漫客栈、LCEXPO
-- 状态统一：enabled=false + last_test_status='untested' + verification_status='unverified'

INSERT INTO info_sources (
  section_id, section_title, region, name, url, type, description,
  method, fetch_type, enabled, last_test_status, sort_order,
  verification_status, verified_by, verification_notes
)
SELECT * FROM (VALUES
  -- Polygon（海外动漫/ACG RSS）
  (
    'domestic-acg', '动漫 / ACG', 'overseas',
    'Polygon', 'https://www.polygon.com/feed/', 'rss',
    '游戏+动漫综合媒体 RSS',
    '{"source_id":"polygon","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"paused","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 'untested', 274,
    'unverified', '', '2026-08-03 IP NEWS 查重补缺，待验证'
  ),
  -- 漫客栈（国内动漫ACG web）
  (
    'domestic-acg', '动漫 / ACG', 'domestic',
    '漫客栈', 'https://www.mkzhan.com', 'web',
    '国内漫画平台',
    '{"source_id":"mkzhan","is_rss":false,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"zh","priority":"P1","scrape_config":{"itemSelector":".news-list li, article, ul li","titleSelector":"h3 a, h2 a, a","linkSelector":"a","linkPrefix":"https://www.mkzhan.com","maxItems":10},"execution_mode":"paused","schedule_tier":"every_2_days","scheduler_version":1}',
    'web', false, 'untested', 192,
    'unverified', '', '2026-08-03 IP NEWS 查重补缺，待验证'
  ),
  -- LCEXPO上海国际授权展（潮玩/玩具 web）
  (
    'domestic-toy', '潮玩 / 玩具 / 收藏品', 'domestic',
    'LCEXPO上海国际授权展', 'http://www.lcexpo.com.cn', 'web',
    '上海国际授权展官方',
    '{"source_id":"lcexpo","is_rss":false,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"zh","priority":"P1","scrape_config":{"itemSelector":".news-list li, ul li","titleSelector":"h3 a, a","linkSelector":"a","linkPrefix":"http://www.lcexpo.com.cn","maxItems":10},"execution_mode":"paused","schedule_tier":"every_2_days","scheduler_version":1}',
    'web', false, 'untested', 172,
    'unverified', '', '2026-08-03 IP NEWS 查重补缺，待验证'
  )
) AS v(
  section_id, section_title, region, name, url, type, description,
  method, fetch_type, enabled, last_test_status, sort_order,
  verification_status, verified_by, verification_notes
)
WHERE NOT EXISTS (
  SELECT 1 FROM info_sources s WHERE s.url = v.url
);
