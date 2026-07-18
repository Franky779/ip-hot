-- 在 Supabase SQL Editor 中执行一次，让信息源管理页真正控制自动抓取。
alter table public.info_sources
  add column if not exists fetch_type text not null default 'web',
  add column if not exists enabled boolean not null default false,
  add column if not exists last_test_status text not null default 'untested',
  add column if not exists last_tested_at timestamptz,
  add column if not exists last_test_message text not null default '';

-- 根据网址初步识别 RSS；普通网页仍保留为 web，不会被 RSS 定时任务误抓。
update public.info_sources
set fetch_type = case
  when lower(url) ~ '(feed|rss|atom|xml)' then 'rss'
  else 'web'
end;

-- 确保当前稳定 RSS 都在库中；已有相同 RSS 地址时不会重复新增。
with stable_rss(name, url, region, sort_order) as (
  values
    ('Cartoon Brew', 'https://www.cartoonbrew.com/feed', 'overseas', 10),
    ('Animation Magazine', 'https://www.animationmagazine.net/feed', 'overseas', 20),
    ('Otaku USA Magazine', 'https://otakuusamagazine.com/feed', 'overseas', 30),
    ('Variety', 'https://variety.com/feed', 'overseas', 40),
    ('The Hollywood Reporter', 'https://www.hollywoodreporter.com/feed', 'overseas', 50),
    ('Hyperallergic', 'https://hyperallergic.com/feed', 'overseas', 60),
    ('The Toy Book', 'https://toybook.com/feed', 'overseas', 70),
    ('Spanky Stokes', 'https://www.spankystokes.com/feeds/posts/default', 'overseas', 80),
    ('Comic Natalie', 'https://natalie.mu/comic/feed/news', 'japan', 90),
    ('4Gamer', 'https://www.4gamer.net/rss/index.xml', 'japan', 100),
    ('钛媒体', 'https://www.tmtpost.com/rss.xml', 'domestic', 110)
)
insert into public.info_sources (
  section_id, section_title, region, name, url, type, description, method,
  fetch_type, enabled, sort_order
)
select
  'runtime-rss', '自动抓取 RSS', region, name, url, 'RSS订阅',
  '已验证可用于自动抓取', 'rss-parser', 'rss', true, sort_order
from stable_rss s
where not exists (
  select 1 from public.info_sources existing where existing.url = s.url
);

-- 首次只启用历史测试稳定的 11 个 RSS。
update public.info_sources set enabled = false;
update public.info_sources
set enabled = true, fetch_type = 'rss'
where url in (
  'https://www.cartoonbrew.com/feed',
  'https://www.animationmagazine.net/feed',
  'https://otakuusamagazine.com/feed',
  'https://variety.com/feed',
  'https://www.hollywoodreporter.com/feed',
  'https://hyperallergic.com/feed',
  'https://toybook.com/feed',
  'https://www.spankystokes.com/feeds/posts/default',
  'https://natalie.mu/comic/feed/news',
  'https://www.4gamer.net/rss/index.xml',
  'https://www.tmtpost.com/rss.xml'
);

create index if not exists idx_info_sources_enabled_fetch_type
  on public.info_sources (enabled, fetch_type);
