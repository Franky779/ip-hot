-- ?? 13 ?????/??/???? X?Twitter???
-- ?? RSSHub ????????? HTTP 200
-- ?????????enabled=false??????verification_status='unverified'?
-- ??OriginalFunko/Hot_Toys/tokidokibrand ???? 503????

INSERT INTO info_sources (
  section_id, section_title, region, name, url, type, description,
  method, fetch_type, enabled, sort_order,
  platform, x_handle, x_user_id, x_profile_url, official_evidence_url,
  verification_status, verified_by, verification_notes
)
SELECT * FROM (VALUES
  -- ???? IP ?? X
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Pixar ?? X', 'http://127.0.0.1:1200/twitter/user/Pixar', 'rss',
    'Pixar ?? X?Twitter???????????IP ????????',
    '{"source_id":"pixar-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 20,
    'x', 'Pixar', '', 'https://x.com/Pixar', 'https://x.com/Pixar',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Marvel ?? X', 'http://127.0.0.1:1200/twitter/user/Marvel', 'rss',
    'Marvel ?? X?Twitter???????? IP?????????',
    '{"source_id":"marvel-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 21,
    'x', 'Marvel', '', 'https://x.com/Marvel', 'https://x.com/Marvel',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Star Wars ?? X', 'http://127.0.0.1:1200/twitter/user/StarWars', 'rss',
    'Star Wars ?? X?Twitter?????????? IP?????????',
    '{"source_id":"starwars-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 22,
    'x', 'StarWars', '', 'https://x.com/StarWars', 'https://x.com/StarWars',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Universal Pictures ?? X', 'http://127.0.0.1:1200/twitter/user/UniversalPics', 'rss',
    '?????? X?Twitter?????????IP ?????',
    '{"source_id":"universal-pics-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 23,
    'x', 'UniversalPics', '', 'https://x.com/UniversalPics', 'https://x.com/UniversalPics',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Warner Bros. ?? X', 'http://127.0.0.1:1200/twitter/user/warnerbros', 'rss',
    '?????? X?Twitter?????????IP??????',
    '{"source_id":"warner-bros-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 24,
    'x', 'warnerbros', '', 'https://x.com/warnerbros', 'https://x.com/warnerbros',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-film', '???? IP ?? X?Twitter???', 'overseas',
    'Sony Pictures ?? X', 'http://127.0.0.1:1200/twitter/user/SonyPictures', 'rss',
    '?????? X?Twitter?????????IP ?????',
    '{"source_id":"sony-pictures-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 25,
    'x', 'SonyPictures', '', 'https://x.com/SonyPictures', 'https://x.com/SonyPictures',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  -- ???? IP ?? X
  (
    'overseas-x-game', '???? IP ?? X?Twitter???', 'overseas',
    'Nintendo of America ?? X', 'http://127.0.0.1:1200/twitter/user/NintendoAmerica', 'rss',
    '??????? X?Twitter?????????IP??????',
    '{"source_id":"nintendo-america-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 30,
    'x', 'NintendoAmerica', '', 'https://x.com/NintendoAmerica', 'https://x.com/NintendoAmerica',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-game', '???? IP ?? X?Twitter???', 'overseas',
    'SEGA ?? X', 'http://127.0.0.1:1200/twitter/user/SEGA', 'rss',
    'SEGA ?? X?Twitter?????????IP ?????',
    '{"source_id":"sega-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 31,
    'x', 'SEGA', '', 'https://x.com/SEGA', 'https://x.com/SEGA',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-game', '???? IP ?? X?Twitter???', 'overseas',
    'Bandai Namco US ?? X', 'http://127.0.0.1:1200/twitter/user/BandaiNamcoUS', 'rss',
    '????????? X?Twitter?????????IP??????',
    '{"source_id":"bandai-namco-us-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 32,
    'x', 'BandaiNamcoUS', '', 'https://x.com/BandaiNamcoUS', 'https://x.com/BandaiNamcoUS',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  -- ????/??/?? ?? X
  (
    'overseas-x-toy', '????/??/?? ?? X?Twitter???', 'overseas',
    'Funko ?? X', 'http://127.0.0.1:1200/twitter/user/Funko', 'rss',
    'Funko ?? X?Twitter?????????IP ????????',
    '{"source_id":"funko-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 40,
    'x', 'Funko', '', 'https://x.com/Funko', 'https://x.com/Funko',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-toy', '????/??/?? ?? X?Twitter???', 'overseas',
    'LEGO ?? X', 'http://127.0.0.1:1200/twitter/user/LEGO_Group', 'rss',
    'LEGO ?? X?Twitter?????????IP ????????',
    '{"source_id":"lego-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"en","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 41,
    'x', 'LEGO_Group', '', 'https://x.com/LEGO_Group', 'https://x.com/LEGO_Group',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-toy', '????/??/?? ?? X?Twitter???', 'overseas',
    '???????? X', 'http://127.0.0.1:1200/twitter/user/PopMartGlobal', 'rss',
    '???????? X?Twitter?????????IP ????????',
    '{"source_id":"popmart-global-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"zh","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 42,
    'x', 'PopMartGlobal', '', 'https://x.com/PopMartGlobal', 'https://x.com/PopMartGlobal',
    'unverified', '', '?????? RSSHub ????? x_user_id'
  ),
  (
    'overseas-x-toy', '????/??/?? ?? X?Twitter???', 'overseas',
    '52TOYS ?? X', 'http://127.0.0.1:1200/twitter/user/52TOYS', 'rss',
    '52TOYS ?? X?Twitter?????????IP ????????',
    '{"source_id":"52toys-x","is_rss":true,"needs_local_cdp":false,"needs_scrapling":false,"login_required":false,"language":"zh","priority":"P0","execution_mode":"cloud","schedule_tier":"daily","scheduler_version":1}',
    'rss', false, 43,
    'x', '52TOYS', '', 'https://x.com/52TOYS', 'https://x.com/52TOYS',
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