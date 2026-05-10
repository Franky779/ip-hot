export type RssSource = {
  id: string
  name: string
  url: string
  language: 'en' | 'zh' | 'ja'
  priority: 'P0' | 'P1' | 'P2'
}

// MVP 阶段先跑 1 个最稳的 P0 海外源(Day 9-10 再加另外 4 个 P0)。
// 完整信源池见 d:/claudecode/.claude/skills/ip-news/references/info-sources.md
export const RSS_SOURCES: RssSource[] = [
  {
    id: 'ann',
    name: 'Anime News Network',
    url: 'https://www.animenewsnetwork.com/all/rss.xml',
    language: 'en',
    priority: 'P0',
  },
]
