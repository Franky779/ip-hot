import { NextResponse } from 'next/server'
import { topEvents, isRising, isNew } from '@/lib/events/hot'
import { checkRateLimit } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

/** 公开热点 API：/api/v1/hot?limit=20（限流 60 次/分/IP，与 /api/v1/articles 同规则） */
export async function GET(request: Request) {
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  if (!checkRateLimit(`v1hot:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20') || 20))

  try {
    const events = await topEvents(limit)
    return NextResponse.json({
      ok: true,
      count: events.length,
      events: events.map((ev) => ({
        id: ev.id,
        title: ev.title_cn ?? ev.canonical_title,
        summary: ev.summary_cn,
        category: ev.category,
        source_count: ev.source_count,
        report_count: ev.report_count,
        heat: Number(ev.heat_score),
        rising: isRising(ev),
        fresh: isNew(ev),
        first_seen_at: ev.first_seen_at,
        last_seen_at: ev.last_seen_at,
        detail_url: `/hot/${ev.id}`,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
