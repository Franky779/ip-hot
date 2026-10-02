import { buildRssFeed, articleToEntry, fetchFeedArticles, feedResponse, SITE_URL } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

/** 全部 RSS：最近 100 条已处理内容（含未入选，均带中文摘要）。 */
export async function GET() {
  try {
    const articles = await fetchFeedArticles({ limit: 100, requireScore: false })
    const xml = buildRssFeed(
      {
        title: 'IP-HOT 全部资讯',
        link: SITE_URL,
        description: 'IP 行业资讯聚合 · 全部已处理内容（仅摘要与原文链接）',
      },
      articles.map(articleToEntry),
    )
    return feedResponse(xml)
  } catch (e) {
    return new Response(`RSS 生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
