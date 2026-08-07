-- ============================================================
-- 2026-08-02 信息源行业分类合并重命名
-- 目标：38 个分组 → 13 个行业分类；地区交给现有地区筛选器
-- 只更新 section_id / section_title；region 原值保留（地区筛选仍可用）
-- 不删除任何行；重复源去重需另行确认后单独执行
-- 执行前请先备份：pg_dump -d ip_hot -t info_sources -Fc -f /srv/backups/postgresql/info_sources_20260802.dump
-- ============================================================

BEGIN;

-- 1) 整组迁移（含保留分组的标题统一）
UPDATE info_sources s
SET section_id = m.new_id, section_title = m.new_title
FROM (VALUES
  ('domestic-acg', 'domestic-acg', '动漫 / ACG'),
  ('overseas-acg', 'domestic-acg', '动漫 / ACG'),
  ('overseas-x-official', 'domestic-acg', '动漫 / ACG'),
  ('overseas-film', 'film-tv', '影视 / 内容改编'),
  ('overseas-x-film', 'film-tv', '影视 / 内容改编'),
  ('rss-import-影视与内容改编', 'film-tv', '影视 / 内容改编'),
  ('overseas-x-game', 'game-interactive', '游戏 / 互动娱乐'),
  ('rss-import-游戏与数字体验', 'game-interactive', '游戏 / 互动娱乐'),
  ('domestic-film-game', 'game-interactive', '游戏 / 互动娱乐'),
  ('runtime-rss', 'game-interactive', '游戏 / 互动娱乐'),
  ('domestic-toy', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('rss-import-玩具潮玩与收藏品', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-x-toy', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('rss-import-ip授权与商品化', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('rss-import-品牌零售与消费', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('rss-import-衍生消费品', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('domestic-cultural', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('overseas-cultural', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('rss-import-博物馆艺术与文创', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('rss-import-补充精选', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('rss-import-文旅与线下体验', 'tourism-experience', '文旅 / 线下体验'),
  ('rss-import-文学出版', 'publishing', '文学 / 出版'),
  ('domestic-central-media', 'general-media', '综合资讯 / 媒体'),
  ('domestic-local-media', 'general-media', '综合资讯 / 媒体'),
  ('gov', 'domestic-policy', '政府政策 / 产业规划 / 官方平台')
) AS m(old_id, new_id, new_title)
WHERE s.section_id = m.old_id;

-- 2) 跨组/组内例外，按 (旧 section_id, 名称) 精确迁移
UPDATE info_sources s
SET section_id = m.new_id, section_title = m.new_title
FROM (VALUES
  -- domestic-acg 内例外：Pixar 属影视
  ('domestic-acg', '推特-皮克斯Pixar 官方', 'film-tv', '影视 / 内容改编'),
  -- domestic-toy 内例外：CLE 授权展属品牌授权
  ('domestic-toy', 'CLE中国授权展官网', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  -- domestic-culture：中国旅游报属文旅
  ('domestic-culture', '中国旅游报', 'tourism-experience', '文旅 / 线下体验'),
  -- web 按源拆分
  ('web', '游民星空动漫', 'domestic-acg', '动漫 / ACG'),
  ('web', '知乎雷报', 'domestic-acg', '动漫 / ACG'),
  ('web', '中外玩具网-产业', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('web', '中外玩具网-公司', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('web', '中外玩具网-渠道', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('web', '中外玩具网-潮玩', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('web', '中外玩具网-授权', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('web', '中外玩具网-消费', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('web', 'CLE中国授权展', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('web', '国家文物局', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('web', '新京报', 'general-media', '综合资讯 / 媒体'),
  ('web', '千龙网', 'general-media', '综合资讯 / 媒体'),
  ('web', '上观新闻', 'general-media', '综合资讯 / 媒体'),
  ('web', '新闻晨报', 'general-media', '综合资讯 / 媒体'),
  ('web', '大众日报', 'general-media', '综合资讯 / 媒体'),
  ('web', '极目新闻', 'general-media', '综合资讯 / 媒体'),
  ('web', '金羊网', 'general-media', '综合资讯 / 媒体'),
  ('web', '西安网', 'general-media', '综合资讯 / 媒体'),
  -- overseas-jp 按源拆分
  ('overseas-jp', 'ファミ通 (Famitsu)', 'game-interactive', '游戏 / 互动娱乐'),
  ('overseas-jp', 'アニメイトタイムズ', 'domestic-acg', '动漫 / ACG'),
  ('overseas-jp', 'AnimeJapan 官方', 'domestic-acg', '动漫 / ACG'),
  -- overseas-licensing 按源拆分
  ('overseas-licensing', '推特-迪士尼Disney 官方', 'film-tv', '影视 / 内容改编'),
  ('overseas-licensing', 'KidScreen', 'film-tv', '影视 / 内容改编'),
  ('overseas-licensing', 'Licensing International', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('overseas-licensing', 'License Global', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('overseas-licensing', 'World IP Review (WIPR)', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('overseas-licensing', 'Total Licensing', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('overseas-licensing', 'The Toy Book', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-licensing', 'Toy World Magazine', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-licensing', 'Spanky Stokes', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-licensing', 'Vinyl Pulse', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-licensing', 'Clutter Magazine', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  -- overseas-rss 按源拆分
  ('overseas-rss', 'Vinyl Pulse', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('overseas-rss', 'Total Licensing', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  -- rss-domestic 按源拆分
  ('rss-domestic', '优扬传媒', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('rss-domestic', '钛媒体', 'domestic-finance', '财经 / 商业 / 综合'),
  ('rss-domestic', 'B站国创动态', 'domestic-acg', '动漫 / ACG'),
  ('rss-domestic', '游研社', 'game-interactive', '游戏 / 互动娱乐'),
  -- rss-japan 按源拆分
  ('rss-japan', 'Anime Anime', 'domestic-acg', '动漫 / ACG'),
  ('rss-japan', 'Comic Natalie', 'domestic-acg', '动漫 / ACG'),
  ('rss-japan', 'Famitsu', 'game-interactive', '游戏 / 互动娱乐'),
  -- rss-import-动漫acg与角色 内例外：机核属游戏
  ('rss-import-动漫acg与角色', '机核 GCORES', 'game-interactive', '游戏 / 互动娱乐'),
  ('rss-import-动漫acg与角色', 'ICv2', 'domestic-acg', '动漫 / ACG'),
  -- rss-import-数码运动与体育ip：Verge/Engadget 挪至综合资讯
  ('rss-import-数码运动与体育ip', 'The Verge', 'general-media', '综合资讯 / 媒体'),
  ('rss-import-数码运动与体育ip', 'Engadget', 'general-media', '综合资讯 / 媒体'),
  ('rss-import-数码运动与体育ip', 'Outdoor Retailer', 'sports-ip', '运动 / 体育IP'),
  ('rss-import-数码运动与体育ip', 'SportsPro', 'sports-ip', '运动 / 体育IP'),
  ('rss-import-数码运动与体育ip', 'SportBusiness', 'sports-ip', '运动 / 体育IP')
) AS m(old_id, old_name, new_id, new_title)
WHERE s.section_id = m.old_id AND s.name = m.old_name;

-- 3) rss-overseas（27 条）按源拆分
UPDATE info_sources s
SET section_id = m.new_id, section_title = m.new_title
FROM (VALUES
  ('Animation World Network', 'domestic-acg', '动漫 / ACG'),
  ('Crunchyroll News', 'domestic-acg', '动漫 / ACG'),
  ('Cartoon Brew', 'domestic-acg', '动漫 / ACG'),
  ('Animation Magazine', 'domestic-acg', '动漫 / ACG'),
  ('AnimeClick', 'domestic-acg', '动漫 / ACG'),
  ('Variety', 'film-tv', '影视 / 内容改编'),
  ('The Hollywood Reporter', 'film-tv', '影视 / 内容改编'),
  ('Deadline', 'film-tv', '影视 / 内容改编'),
  ('KidScreen', 'film-tv', '影视 / 内容改编'),
  ('License Global', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('Copyright Alliance', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('The IPKat', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('WIPO News', 'licensing-merch', '品牌授权 / 商品化 / 零售消费'),
  ('The Toy Book', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('Spanky Stokes', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('ToyNews', 'domestic-toy', '潮玩 / 玩具 / 收藏品'),
  ('American Alliance of Museums', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('Creative Commons Blog', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('Creative Boom', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('Colossal', 'culture-heritage-art', '文创 / 文博 / 非遗 / 艺术'),
  ('Attractions Magazine', 'tourism-experience', '文旅 / 线下体验'),
  ('PocketGamer.biz', 'game-interactive', '游戏 / 互动娱乐'),
  ('Game World Observer', 'game-interactive', '游戏 / 互动娱乐'),
  ('Gematsu', 'game-interactive', '游戏 / 互动娱乐'),
  ('Eurogamer', 'game-interactive', '游戏 / 互动娱乐'),
  ('Nintendo Life', 'game-interactive', '游戏 / 互动娱乐'),
  ('Rock Paper Shotgun', 'game-interactive', '游戏 / 互动娱乐')
) AS m(name, new_id, new_title)
WHERE s.section_id = 'rss-overseas' AND s.name = m.name;

-- 4) 校验：执行后应只剩余 13 个分类；任何旧 section_id 残留即为遗漏
-- SELECT section_id, section_title, count(*) FROM info_sources GROUP BY section_id, section_title ORDER BY count(*) DESC;
-- SELECT section_id FROM info_sources WHERE section_id IN
--   ('rss-overseas','rss-domestic','rss-japan','overseas-licensing','overseas-rss','overseas-jp','web','gov','runtime-rss',
--    'domestic-culture','domestic-cultural','domestic-film-game','overseas-acg','overseas-cultural','overseas-film',
--    'rss-import-动漫acg与角色','rss-import-玩具潮玩与收藏品','rss-import-影视与内容改编','rss-import-游戏与数字体验',
--    'rss-import-文学出版','rss-import-博物馆艺术与文创','rss-import-文旅与线下体验','rss-import-品牌零售与消费',
--    'rss-import-衍生消费品','rss-import-数码运动与体育ip','rss-import-补充精选','rss-import-ip授权与商品化')
-- GROUP BY section_id;

COMMIT;
