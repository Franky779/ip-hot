import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { RSS_SOURCES } from '@/lib/sources'

export const runtime = 'nodejs'
export const maxDuration = 60

const parser = new Parser({ timeout: 15000 })

type FetchResult = {
  source: string
  ok: boolean
  fetched: number
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
    const result: FetchResult = { source: source.name, ok: false, fetched: 0, inserted: 0 }

    try {
      const feed = await parser.parseURL(source.url)
      const items = feed.items
        .map((item) => ({
          source: source.name,
          url: item.link ?? '',
          title: item.title ?? '',
          published_at: item.isoDate ?? null,
        }))
        .filter((x) => x.url.length > 0 && x.title.length > 0)

      result.fetched = items.length

      if (items.length > 0) {
        const { data, error } = await supabase
          .from('articles')
          .upsert(items, { onConflict: 'source,url', ignoreDuplicates: true })
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
  const totalInserted = results.reduce((s, r) => s + r.inserted, 0)

  return NextResponse.json({
    ok: results.every((r) => r.ok),
    timestamp: new Date().toISOString(),
    totalFetched,
    totalInserted,
    results,
  })
}
