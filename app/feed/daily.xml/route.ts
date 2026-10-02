import { createServiceClient } from '@/lib/supabase'
import { buildRssFeed, stripHtml, truncateText, feedResponse, SITE_URL, type FeedEntry } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

type DailyReportRow = {
  id: string
  date: string
  title: string
  content: string
  article_count: number | null
}

/** 日报 RSS：最近 30 期日报（只出导语式摘要与日报链接）。 */
export async function GET() {
  try {
    const { data, error } = await createServiceClient()
      .from('daily_reports')
      .select('id, date, title, content, article_count')
      .order('date', { ascending: false })
      .limit(30)

    if (error) throw new Error(error.message)

    const entries: FeedEntry[] = (data ?? [] as DailyReportRow[]).map((report) => ({
      title: report.title,
      link: `${SITE_URL}/daily?date=${report.date}`,
      description: truncateText(stripHtml(report.content), 300),
      pubDate: report.date ? new Date(`${report.date}T10:00:00+08:00`).toUTCString() : null,
      guid: `ip-hot-daily-${report.date}`,
    }))

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
