import { NextResponse } from 'next/server'
import { checkRateLimit, fetchFeedArticles, type FeedArticle } from '@/lib/rss-feed'
import { isAdminAuthenticated } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * 公开只读 API：/api/v1/articles?category=&limit=
 * 限流 40 次/分钟/IP；携带管理员密码（x-admin-password）的请求不限流。
 * 只输出元数据与摘要，不带全文。
 */
export async function GET(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  if (!isAdminAuthenticated(request) && !checkRateLimit(`v1-articles:${ip}`, 40)) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试（限流 40 次/分钟）' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const { searchParams } = new URL(request.url)
  const category = (searchParams.get('category') || '').trim() || undefined
  const limitRaw = Number(searchParams.get('limit') || 20)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20

  try {
    const articles = await fetchFeedArticles({ limit, category, requireScore: true })
    return NextResponse.json(
      {
        ok: true,
        count: articles.length,
        note: '仅摘要与原文链接，全文请访问原文；限流 40 次/分钟。',
        articles: articles.map((article: FeedArticle) => ({
          id: article.id,
          title: article.title_cn || article.title,
          summary: article.summary_cn,
          url: article.url,
          source: article.source,
          category: article.category,
          published_at: article.published_at,
        })),
      },
      { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' } },
    )
  } catch (e) {
    return NextResponse.json(
      { error: `查询失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }
}
