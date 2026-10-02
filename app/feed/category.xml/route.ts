import { NextResponse } from 'next/server'
import { buildRssFeed, articleToEntry, fetchFeedArticles, feedResponse, SITE_URL } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

/**
 * 分类 RSS：/feed/category.xml?category=<分类名>
 * （分类名含斜杠如「IP/品牌/授权」，用查询参数传递比路径段更稳）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = (searchParams.get('category') || '').trim()
  if (!category) {
    return NextResponse.json({ error: '缺少 category 参数，如 /feed/category.xml?category=IP/品牌/授权' }, { status: 400 })
  }

  try {
    const articles = await fetchFeedArticles({ limit: 50, category, requireScore: true })
    const xml = buildRssFeed(
      {
        title: `IP-HOT 精选 · ${category}`,
        link: `${SITE_URL}/?category=${encodeURIComponent(category)}`,
        description: `IP 行业资讯聚合 · 分类「${category}」精选（仅摘要与原文链接）`,
      },
      articles.map(articleToEntry),
    )
    return feedResponse(xml)
  } catch (e) {
    return new Response(`RSS 生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
