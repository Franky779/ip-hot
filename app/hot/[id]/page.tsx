import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eventWithReports } from '@/lib/events/hot'

export const revalidate = 120

function formatTime(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidPattern.test(id)) notFound()

  let data: Awaited<ReturnType<typeof eventWithReports>> = null
  try {
    data = await eventWithReports(id)
  } catch (error) {
    console.error('Failed to load event:', error)
  }
  if (!data) notFound()

  const { event, reports } = data

  return (
    <main className="hot-page">
      <header className="page-header">
        <p className="hot-breadcrumb">
          <Link href="/hot">← 热点榜</Link>
        </p>
        <h1 className="page-title font-serif">{event.title_cn ?? event.canonical_title}</h1>
        <div className="hot-item-meta">
          <span className="hot-sources">{event.source_count} 家在说</span>
          <span className="article-meta-tag">{event.report_count} 条报道</span>
          {event.category && <span className="article-meta-tag"># {event.category}</span>}
        </div>
        {event.summary_cn && <p className="hot-event-summary">{event.summary_cn}</p>}
      </header>

      <section className="article-section">
        <div className="timeline-entries">
          {reports.map((r) => (
            <div key={r.article_id} className="timeline-entry">
              <div className="timeline-content-col">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-card"
                >
                  <div className="article-meta">
                    {r.is_first_party && <span className="hot-badge hot-badge-first">一手</span>}
                    {r.tier === 'T1' && <span className="hot-badge hot-badge-tier">官方</span>}
                    <span className="article-meta-tag"># {r.source}</span>
                    <span className="hot-time">{formatTime(r.published_at)}</span>
                  </div>
                  <div className="article-card-main">
                    <div className="article-card-copy">
                      <h2 className="article-title font-serif">{r.title_cn ?? r.title}</h2>
                      {r.summary_cn && <p className="article-summary">{r.summary_cn}</p>}
                    </div>
                  </div>
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
