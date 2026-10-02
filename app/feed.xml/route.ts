import { buildRssFeed, articleToEntry, fetchFeedArticles, feedResponse, SITE_URL } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

/** 精选 RSS：最近 50 条入选内容（与首页同一套精选判定）。 */
export async function GET() {
  try {
    const articles = await fetchFeedArticles({ limit: 50, requireScore: true })
    const xml = buildRssFeed(
      {
        title: 'IP-HOT 精选资讯',
        link: SITE_URL,
        description: 'IP 行业资讯聚合 · 精选内容（仅摘要与原文链接）',
      },
      articles.map(articleToEntry),
    )
    return feedResponse(xml)
  } catch (e) {
    return new Response(`RSS 生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
