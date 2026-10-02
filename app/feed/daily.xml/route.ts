import { createServiceClient } from '@/lib/supabase'
import { buildRssFeed, stripHtml, truncateText, feedResponse, SITE_URL, type FeedEntry } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

type DailyReportRow = {
  id: string
  period: string
  period_date: string
  summary: string | null
  highlights: string | null
  content_html: string | null
  total_count: number | null
}

/** 日报 RSS：最近 30 期日报（只出导语式摘要与日报链接）。 */
export async function GET() {
  try {
    // 线上真实表结构：period('daily'|'weekly'|'monthly') + period_date（schema.sql 里的旧结构已过时）
    const { data, error } = await createServiceClient()
      .from('daily_reports')
      .select('id, period, period_date, summary, highlights, content_html, total_count')
      .eq('period', 'daily')
      .gte('period_date', '2000-01-01') // 排除历史脏数据（如 1969 年）
      .order('period_date', { ascending: false })
      .limit(30)

    if (error) throw new Error(error.message)

    const entries: FeedEntry[] = ((data ?? []) as DailyReportRow[]).map((report) => {
      const summary = stripHtml(report.summary || report.highlights || report.content_html)
      return {
        title: `IP-HOT 日报 · ${report.period_date}${report.total_count ? `（${report.total_count} 条）` : ''}`,
        link: `${SITE_URL}/daily?period=daily&date=${report.period_date}`,
        description: truncateText(summary, 300),
        pubDate: report.period_date ? new Date(`${report.period_date}T10:00:00+08:00`).toUTCString() : null,
        guid: `ip-hot-daily-${report.period_date}`,
      }
    })

    const xml = buildRssFeed(
      {
        title: 'IP-HOT 日报',
        link: `${SITE_URL}/daily`,
        description: 'IP 行业资讯聚合 · 每日汇总',
      },
      entries,
    )
    return feedResponse(xml)
  } catch (e) {
    return new Response(`RSS 生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
