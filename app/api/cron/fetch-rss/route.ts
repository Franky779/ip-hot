import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { RSS_SOURCES } from '@/lib/sources'
import { checkLinks } from '@/lib/link-checker'

export const runtime = 'nodejs'
export const maxDuration = 60

const parser = new Parser({ timeout: 15000 })

// 过滤无 IP 商业角度的英文新闻(选角/评论/回顾)
const BLOCK_PATTERNS: RegExp[] = [
  /\bto star (as|in)\b/i,
  /\bcast as\b/i,
  /\bstars? in\b/i,
  /\bjoins?\s+(the\s+)?(cast|film|movie|series)\b/i,
  /\b(manga|anime|movie|film|book|series) review\b/i,
  /^review[:\s]/i,
  /^retrospective[:\s]/i,
]

function isNoise(title: string): boolean {
  return BLOCK_PATTERNS.some((p) => p.test(title))
}

type FetchResult = {
  source: string
  ok: boolean
  fetched: number
  blocked: number
  dead: number
  inserted: number
  error?: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results: FetchResult[] = []

  for (const source of RSS_SOURCES) {
    const result: FetchResult = { source: source.name, ok: false, fetched: 0, blocked: 0, dead: 0, inserted: 0 }

    try {
      const feed = await parser.parseURL(source.url)
      const rawItems = feed.items
        .map((item) => ({
          source: source.name,
          url: item.link ?? '',
          title: item.title ?? '',
          published_at: item.isoDate ?? null,
        }))
        .filter((x) => x.url.length > 0 && x.title.length > 0)

      const items = rawItems.filter((x) => !isNoise(x.title))
      result.fetched = items.length
      result.blocked = rawItems.length - items.length

      // 链接有效性预检
      let validItems = items
      if (items.length > 0) {
        const linkChecks = await checkLinks(
          items.map((x) => x.url),
          5,
          6000
        )
        const validUrls = new Set(linkChecks.filter((r) => r.ok).map((r) => r.url))
        validItems = items.filter((x) => validUrls.has(x.url))
        result.dead = items.length - validItems.length

        const deadLinks = linkChecks.filter((r) => !r.ok)
        if (deadLinks.length > 0) {
          console.log(`  [链接检查] 过滤 ${deadLinks.length} 条失效链接:`)
          deadLinks.forEach((d) => console.log(`    - ${d.url} (${d.reason})`))
        }
      }

      if (validItems.length > 0) {
        const { data, error } = await supabase
          .from('articles')
          .upsert(validItems, { onConflict: 'source,url', ignoreDuplicates: true })
          .select('id')

        if (error) {
          result.error = `Supabase: ${error.message}`
        } else {
          result.ok = true
          result.inserted = data?.length ?? 0
        }
      } else {
        result.ok = true
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }

    results.push(result)
  }

  const totalFetched = results.reduce((s, r) => s + r.fetched, 0)
  const totalBlocked = results.reduce((s, r) => s + r.blocked, 0)
  const totalDead = results.reduce((s, r) => s + r.dead, 0)
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    timestamp: new Date().toISOString(),
    totalFetched,
    totalBlocked,
    totalDead,
    totalInserted,
    results,
  })
}
