-- ?? 4 ?????????? X?Twitter???
-- ?? RSSHub ??????? RSS ?????
-- ?????????enabled=false??????verification_status='unverified'?
-- ?????????? curl ?? RSSHub ????????
-- ??BonesInc ??????ufotable_koushiki ???????

INSERT INTO info_sources (
  section_id, section_title, region, name, url, type, description,
  method, fetch_type, enabled, sort_order,
  platform, x_handle, x_user_id, x_profile_url, official_evidence_url,
  verification_status, verified_by, verification_notes
)
SELECT * FROM (VALUES
  (
    'overseas-x-official', '???? X?Twitter???', 'overseas',
    '?????? X', 'http://127.0.0.1:1200/twitter/user/ToeiAnimation', 'rss',
    '?????? X?Twitter?????????IP ?????????',
    '{"source_id":"toei-animation-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"ja","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 10,
    'x', 'ToeiAnimation', '', 'https://x.com/ToeiAnimation', 'https://x.com/ToeiAnimation',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-official', '???? X?Twitter???', 'overseas',
    'MAPPA ?? X', 'http://127.0.0.1:1200/twitter/user/MAPPA_Info', 'rss',
    'MAPPA ?? X?Twitter???????????IP ?????',
    '{"source_id":"mappa-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"ja","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 11,
    'x', 'MAPPA_Info', '', 'https://x.com/MAPPA_Info', 'https://x.com/MAPPA_Info',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-official', '???? X?Twitter???', 'overseas',
    'ufotable ?? X', 'http://127.0.0.1:1200/twitter/user/ufotable', 'rss',
    'ufotable ?? X?Twitter?????????????????',
    '{"source_id":"ufotable-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"ja","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 12,
    'x', 'ufotable', '', 'https://x.com/ufotable', 'https://x.com/ufotable',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-official', '???? X?Twitter???', 'overseas',
    '?????? X', 'http://127.0.0.1:1200/twitter/user/KyoAni', 'rss',
    '?????? X?Twitter?????????????????',
    '{"source_id":"kyoani-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"ja","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 13,
    'x', 'KyoAni', '', 'https://x.com/KyoAni', 'https://x.com/KyoAni',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  )
) AS v(
  section_id, section_title, region, name, url, type, description,
  method, fetch_type, enabled, sort_order,
  platform, x_handle, x_user_id, x_profile_url, official_evidence_url,
  verification_status, verified_by, verification_notes
)
WHERE NOT EXISTS (
  SELECT 1 FROM info_sources s WHERE s.name = v.name
);