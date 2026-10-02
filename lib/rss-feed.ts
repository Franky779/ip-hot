/**
 * A5 RSS / 公开 API 出口的共享工具。
 * 红线：只输出摘要 + 原文链接，绝不输出全文（IP 行业版权敏感）。
 */

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.laojia-ip.com'

const FEED_CACHE_HEADER = 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function stripHtml(value: string | null): string {
  if (!value) return ''
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const num = Number(code)
      return Number.isFinite(num) && num > 0 && num < 0x10ffff ? String.fromCodePoint(num) : ''
    })
    .replace(/\s+/g, ' ')
    .trim()
}

export function truncateText(value: string, max = 300): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

export function toRfc822(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

export type FeedEntry = {
  title: string
  link: string
  description: string
  pubDate: string | null
  guid: string
}

export function buildRssFeed(
  channel: { title: string; link: string; description: string },
  entries: FeedEntry[],
): string {
  const items = entries
    .map((entry) => {
      const pubDate = entry.pubDate ? `<pubDate>${escapeXml(entry.pubDate)}</pubDate>` : ''
      return [
        '    <item>',
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${escapeXml(entry.link)}</link>`,
        `      <description>${escapeXml(entry.description)}</description>`,
        `      <guid isPermaLink="false">${escapeXml(entry.guid)}</guid>`,
        pubDate,
        '    </item>',
      ].filter(Boolean).join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <generator>IP-HOT</generator>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].filter((line) => line !== undefined).join('\n')
}

export function feedResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': FEED_CACHE_HEADER,
    },
  })
}

/** /api/v1/* 的简单内存限流：单实例部署够用（ip-hot.service 只跑一个进程）。 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
    if (rateBuckets.size > 10_000) {
      for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k)
    }
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

// ===== 文章查询（与首页"精选"判定保持同一套条件） =====

import { createServiceClient } from './supabase'
import { getSelectionThreshold } from './selection-threshold'

export type FeedArticle = {
  id: string
  title: string | null
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  url: string | null
  source: string | null
  category: string | null
  relevance_score: number | null
  selection_threshold: number | null
  published_at: string | null
  created_at: string | null
}

export async function fetchFeedArticles(opts: {
  limit: number
  category?: string
  requireScore?: boolean
}): Promise<FeedArticle[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from('articles')
    .select('id, title, title_cn, summary_cn, commentary, url, source, category, relevance_score, selection_threshold, published_at, created_at')
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .not('category', 'is', null)
    .not('commentary', 'is', null)
    .neq('commentary', '')
    .neq('category', '待分类')
    .neq('category', '待人工复核')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(opts.limit)

  if (opts.category) {
    query = query.eq('category', opts.category)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  let articles = (data ?? []) as FeedArticle[]

  if (opts.requireScore) {
    const globalThreshold = await getSelectionThreshold(supabase)
    articles = articles.filter(
      (article) =>
        (article.relevance_score ?? -1) >= (article.selection_threshold ?? globalThreshold),
    )
  }
  return articles
}

export function articleToEntry(article: FeedArticle): FeedEntry {
  const summary = truncateText(stripHtml(article.summary_cn), 300)
  return {
    title: article.title_cn || article.title || '（无标题）',
    link: article.url || SITE_URL,
    description: summary,
    pubDate: toRfc822(article.published_at ?? article.created_at),
    guid: `ip-hot-article-${article.id}`,
  }
}
