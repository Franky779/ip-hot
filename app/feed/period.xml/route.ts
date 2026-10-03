import { createServiceClient } from '@/lib/supabase'
import { buildRssFeed, stripHtml, truncateText, feedResponse, SITE_URL, type FeedEntry } from '@/lib/rss-feed'

export const dynamic = 'force-dynamic'

type ReportRow = {
  id: string
  period_date: string
  summary: string | null
  highlights: string | null
  content_html: string | null
  total_count: number | null
}

const PERIODS = [
  { period: 'weekly', label: '周报', path: '/weekly', limit: 20 },
  { period: 'monthly', label: '月报', path: '/monthly', limit: 12 },
] as const

/**
 * 周报 + 月报 RSS（A4）：把三个周期合成一个 feed，方便订阅者一次订阅长期跟踪。
 * 只出导语式摘要与报告链接，不含全文。
 */
export async function GET() {
  try {
    const entries: FeedEntry[] = []

    for (const { period, label, path, limit } of PERIODS) {
      const { data, error } = await createServiceClient()
        .from('daily_reports')
        .select('id, period_date, summary, highlights, content_html, total_count')
        .eq('period', period)
        .gte('period_date', '2000-01-01') // 排除历史脏数据（如 1969 年）
        .order('period_date', { ascending: false })
        .limit(limit)

      if (error) throw new Error(error.message)

      for (const report of (data ?? []) as ReportRow[]) {
        const summary = stripHtml(report.summary || report.highlights || report.content_html)
        entries.push({
          title: `IP-HOT ${label} · ${report.period_date}${report.total_count ? `（${report.total_count} 条）` : ''}`,
          link: `${SITE_URL}${path}?date=${report.period_date}`,
          description: truncateText(summary, 300),
          pubDate: report.period_date
            ? new Date(`${report.period_date}T10:00:00+08:00`).toUTCString()
            : null,
          guid: `ip-hot-${period}-${report.period_date}`,
        })
      }
    }

    // 周报比月报新，合并后统一按时间倒序
    entries.sort((a, b) => (a.pubDate && b.pubDate ? b.pubDate.localeCompare(a.pubDate) : 0))

    const xml = buildRssFeed(
      {
        title: 'IP-HOT 周报与月报',
        link: `${SITE_URL}/weekly`,
        description: 'IP 行业资讯聚合 · 周度与月度汇总（热点事件、活跃 IP、授权交易）',
      },
      entries,
    )
    return feedResponse(xml)
  } catch (e) {
    return new Response(`RSS 生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 })
  }
}
