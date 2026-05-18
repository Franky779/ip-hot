export type RssSource = {
  id: string
  name: string
  url: string
  language: 'en' | 'zh' | 'ja'
  priority: 'P0' | 'P1' | 'P2'
}

// MVP 阶段:5 个最稳的 P0 海外 RSS。
// W2 完成后(Day 11)考虑加 P1 国内源(36氪/虎嗅/钛媒体)。
// 完整信源池:d:/claudecode/.claude/skills/ip-news/references/info-sources.md
export const RSS_SOURCES: RssSource[] = [
  // 海外 P0
  {
    id: 'ann',
    name: 'Anime News Network',
    url: 'https://www.animenewsnetwork.com/all/rss.xml',
    language: 'en',
    priority: 'P0',
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll News',
    url: 'https://feeds.feedburner.com/crunchyroll/animenews',
    language: 'en',
    priority: 'P0',
  },
  {
    id: 'cartoonbrew',
    name: 'Cartoon Brew',
    url: 'https://www.cartoonbrew.com/feed',
    language: 'en',
    priority: 'P0',
  },
  {
    id: 'awn',
    name: 'Animation World Network',
    url: 'https://www.awn.com/news.xml',
    language: 'en',
    priority: 'P0',
  },
  {
    id: 'variety',
    name: 'Variety',
    url: 'https://variety.com/feed',
    language: 'en',
    priority: 'P0',
  },
  // 国内
  {
    id: '36kr',
    name: '36氪',
    url: 'https://36kr.com/feed',
    language: 'zh',
    priority: 'P1',
  },
  {
    id: 'huxiu',
    name: '虎嗅',
    url: 'https://www.huxiu.com/rss/0.xml',
    language: 'zh',
    priority: 'P1',
  },
  {
    id: 'tmtpost',
    name: '钛媒体',
    url: 'https://www.tmtpost.com/rss.xml',
    language: 'zh',
    priority: 'P1',
  },
  {
    id: 'geekpark',
    name: '极客公园',
    url: 'https://www.geekpark.net/rss',
    language: 'zh',
    priority: 'P1',
  },
  {
    id: 'gcores',
    name: '机核网',
    url: 'https://www.gcores.com/rss',
    language: 'zh',
    priority: 'P1',
  },
]

// 新增信源：初次抓取的文章强制归类为"待分类"，等人工审核确认后再正式展示
export const NEW_SOURCE_IDS = new Set(['geekpark', 'gcores'])
export const NEW_SOURCE_NAMES = new Set(
  RSS_SOURCES.filter((s) => NEW_SOURCE_IDS.has(s.id)).map((s) => s.name)
)
