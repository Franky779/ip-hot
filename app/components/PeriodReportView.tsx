// app/components/PeriodReportView.tsx — 日报 / 周报 / 月报共用视图（A4）
//
// 三个路由（/daily、/weekly、/monthly）都渲染这个组件，只传 period。
// 数据来源与缓存策略完全一致（lib/daily-report.ts），差别只有周期。

import Link from 'next/link'
import {
  getAvailableDates,
  getCachedReportHtml,
  getDailyReport,
  type DailyReport,
  type PeriodDate,
} from '@/lib/daily-report'
import { DEMO, type DemoReport } from '@/lib/demo-period-data'
import type { PeriodInsights } from '@/lib/period-insights'

export type PeriodKind = 'daily' | 'weekly' | 'monthly'

const PERIODS: Array<{ value: PeriodKind; label: string; href: string }> = [
  { value: 'daily', label: '日报', href: '/daily' },
  { value: 'weekly', label: '周报', href: '/weekly' },
  { value: 'monthly', label: '月报', href: '/monthly' },
]

function dateHref(period: PeriodKind, date: string): string {
  const base = PERIODS.find((p) => p.value === period)?.href ?? '/daily'
  return period === 'daily' ? `${base}?date=${date}` : `${base}?date=${date}`
}

type Props = {
  period: PeriodKind
  date?: string
  title: string
}

export default async function PeriodReportView({ period, date, title }: Props) {
  let availableDates: PeriodDate[] = []
  let useDemo = false
  try {
    availableDates = await getAvailableDates(period)
  } catch (e) {
    console.error(`[PeriodReport/${period}] 获取日期列表失败:`, (e as Error).message)
  }
  if (availableDates.length === 0) {
    useDemo = true
    availableDates = DEMO[period].dates
  }

  const selectedDate = date || (availableDates.length > 0 ? availableDates[0].value : '')
  const hasSelection = !!selectedDate

  // 优先读预渲染的静态HTML（秒开路径）
  let cachedHtml: string | null = null
  let report: DailyReport | DemoReport | null = null
  if (hasSelection) {
    if (useDemo) {
      report = DEMO[period].report
    } else {
      try {
        cachedHtml = await getCachedReportHtml(period, selectedDate)
      } catch {
        /* 忽略 */
      }
      if (!cachedHtml) {
        // 缓存未命中：跳过LLM秒返文章列表，后台异步触发摘要生成
        try {
          report = await getDailyReport(period, selectedDate, { skipLLM: true })
        } catch (e) {
          console.error(`[PeriodReport/${period}] 加载报告失败:`, (e as Error).message)
        }
        // 后台触发 backfill 生成 LLM 摘要（不await，fire-and-forget）
        if (report && report.totalCount > 0) {
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
          fetch(`${baseUrl}/api/admin/backfill-daily?period=${period}&date=${selectedDate}`, {
            method: 'POST',
          }).catch(() => {
            /* 后台任务，忽略错误 */
          })
        }
      }
    }
  }

  return (
    <div className="daily-layout">
      {/* ─── 左侧栏：标题 + tab + 时间列表 ─── */}
      <aside className="daily-sidebar">
        <div className="daily-sidebar-top">
          <h1 className="daily-sidebar-title">{title}</h1>
          {useDemo && <span className="daily-demo-badge">演示</span>}
          <div className="daily-tabs" role="tablist" aria-label="报告周期切换">
            {PERIODS.map((p) => (
              <Link
                key={p.value}
                href={p.href}
                className={`daily-tab${period === p.value ? ' active' : ''}`}
                role="tab"
                aria-selected={period === p.value}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="daily-sidebar-divider" />

        <nav className="daily-date-nav">
          {availableDates.map((d) => {
            const isActive = d.value === selectedDate
            return (
              <Link
                key={d.value}
                href={dateHref(period, d.value)}
                className={`daily-date-item${isActive ? ' active' : ''}`}
              >
                <span className="daily-date-label">{d.label}</span>
                {d.sublabel && <span className="daily-date-sub">{d.sublabel}</span>}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* ─── 右侧内容区 ─── */}
      <section className="daily-content">
        {!hasSelection ? (
          <p className="empty-state">请从左侧选择一个日期。</p>
        ) : cachedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: cachedHtml }} />
        ) : report && report.totalCount === 0 ? (
          <p className="empty-state">该周期暂无资讯。</p>
        ) : report ? (
          <ReportBody period={period} report={report} />
        ) : (
          <p className="empty-state">数据加载失败，请稍后重试。</p>
        )}
      </section>
    </div>
  )
}

function ReportBody({ period, report }: { period: PeriodKind; report: DailyReport | DemoReport }) {
  const insights = (report as DailyReport).insights
  return (
    <>
      <SnapshotBar period={period} insights={insights} total={report.totalCount} />

      {report.highlights && (
        <div className="daily-highlights">
          <h3 className="daily-highlights-title">本期看点</h3>
          <ul className="daily-highlights-list">
            {report.highlights
              .split('\n')
              .filter(Boolean)
              .map((h: string, i: number) => (
                <li key={i}>{h.replace(/^[•\-\s]+/, '')}</li>
              ))}
          </ul>
        </div>
      )}

      <div className="daily-stats-bar">
        <span className="daily-stats-total">
          共 <strong>{report.totalCount}</strong> 条
        </span>
        <span className="daily-stats-divider" />
        <span className="daily-stats-tags">
          {report.categoryGroups.map((g) => (
            <span key={g.category} className="daily-stats-tag">
              {g.category} <strong>{g.count}</strong>
            </span>
          ))}
        </span>
      </div>

      <div className="daily-summary">
        <h2 className="daily-summary-title">{report.periodLabel}资讯汇总</h2>
        {report.summary ? (
          <div className="daily-summary-text">
            {report.summary
              .split('\n')
              .filter(Boolean)
              .map((p: string, i: number) => (
                <p key={i}>{p}</p>
              ))}
          </div>
        ) : (
          <p className="daily-summary-text text-muted">
            共收录 {report.totalCount} 条IP行业资讯，覆盖 {report.categoryGroups.length} 个分类领域。
          </p>
        )}
      </div>

      {insights && <InsightsSections period={period} insights={insights} />}

      <div className="daily-category-links">
        {report.categoryGroups.map((g) => (
          <div key={g.category} className="daily-category-block">
            <h3 className="daily-category-name">
              {g.category}
              <span className="daily-category-badge">{g.count}</span>
            </h3>
            <ul className="daily-article-list">
              {g.articles.map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="daily-article-link"
                  >
                    {a.title_cn || '(无标题)'}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  )
}

function SnapshotBar({
  period,
  insights,
  total,
}: {
  period: PeriodKind
  insights?: PeriodInsights
  total: number
}) {
  if (!insights || insights.snapshot.articleCount === 0) return null
  const s = insights.snapshot
  return (
    <div className="daily-snapshot">
      <span className="daily-snapshot-item">
        收录 <strong>{s.articleCount}</strong> 条
      </span>
      <span className="daily-snapshot-item">
        信源 <strong>{s.sourceCount}</strong> 个
      </span>
      {period !== 'daily' && (
        <span className="daily-snapshot-item">
          入选 <strong>{s.selectedCount}</strong> 条
        </span>
      )}
      {period !== 'daily' && s.avgScore != null && (
        <span className="daily-snapshot-item">
          平均分 <strong>{s.avgScore}</strong>
        </span>
      )}
      {s.categoryTop && (
        <span className="daily-snapshot-item">
          最热分类 <strong>{s.categoryTop.category}</strong>（{s.categoryTop.count}）
        </span>
      )}
    </div>
  )
}

function InsightsSections({ period, insights }: { period: PeriodKind; insights: PeriodInsights }) {
  const { hotEvents, activeIps, licensingLeads } = insights
  if (hotEvents.length === 0 && activeIps.length === 0 && licensingLeads.length === 0) return null

  return (
    <>
      {hotEvents.length > 0 && (
        <div className="daily-hot-events">
          <h3 className="daily-section-title">
            {period === 'daily' ? '今日热点事件' : '本期热点事件'}
            <span className="daily-section-badge">{hotEvents.length}</span>
          </h3>
          <ol className="daily-hot-list">
            {hotEvents.map((ev) => (
              <li key={ev.id} className="daily-hot-item">
                <Link href={`/hot/${ev.id}`} className="daily-hot-link">
                  {ev.title}
                </Link>
                <span className="daily-hot-meta">
                  {[
                    `${ev.sourceCount} 家信源`,
                    ev.reportCount > 1 ? `${ev.reportCount} 篇报道` : null,
                    ev.topTier === 'T1' ? '含官方一手' : null,
                    ev.category,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {ev.summary && <p className="daily-hot-summary">{ev.summary}</p>}
              </li>
            ))}
          </ol>
          {hotEvents.length >= 10 && (
            <p className="daily-section-more">
              <Link href="/hot">查看完整热点榜 →</Link>
            </p>
          )}
        </div>
      )}

      {activeIps.length > 0 && (
        <div className="daily-active-ips">
          <h3 className="daily-section-title">
            本期活跃 IP<span className="daily-section-badge">{activeIps.length}</span>
          </h3>
          <div className="daily-ip-grid">
            {activeIps.map((ip) => (
              <Link
                key={ip.name}
                href={`/ipbrand?query=${encodeURIComponent(ip.name)}`}
                className="daily-ip-chip"
              >
                <span className="daily-ip-name">{ip.name}</span>
                <span className="daily-ip-count">{ip.articleCount} 条</span>
                <span className="daily-ip-via">
                  {ip.via === 'ip_library' ? '品牌库命中' : '事件主体'}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {licensingLeads.length > 0 && (
        <div className="daily-licensing-leads">
          <h3 className="daily-section-title">
            本期授权交易与版权动态
            <span className="daily-section-badge">{licensingLeads.length}</span>
          </h3>
          <ul className="daily-lead-list">
            {licensingLeads.map((lead) => (
              <li key={lead.url}>
                <a
                  href={lead.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="daily-lead-link"
                >
                  {lead.title}
                </a>
                <span className="daily-lead-meta">
                  {lead.source}
                  {lead.score != null ? ` · ${lead.score}分` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
