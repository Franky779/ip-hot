import Link from 'next/link'
import type { Metadata } from 'next'
import { topEvents, isRising, isNew, type HotEvent } from '@/lib/events/hot'
import { HotEventActions } from '@/app/components/HotEventActions'

export const revalidate = 120

export const metadata: Metadata = {
  title: '本周热点 | IP-HOT',
  description: 'IP 授权行业本周热点事件榜：只保留对授权从业者有决策价值的事件',
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return '1 小时内'
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export default async function HotPage() {
  let events: HotEvent[] = []
  try {
    events = await topEvents(20)
  } catch (error) {
    console.error('Failed to load hot events:', error)
  }

  return (
    <main className="hot-page">
      <header className="page-header">
        <h1 className="page-title font-serif">本周热点</h1>
        <p className="hot-page-sub">
          只保留对 IP 授权 / 联名 / 版权从业者有决策价值的事 · 同一事件聚合多家报道 · 近 7 天
        </p>
      </header>

      {events.length === 0 ? (
        <section className="article-section">
          <p className="empty-state">
            本周还没有通过行业价值筛选的事件。系统每 15 分钟聚簇并判定一轮，
            出现值得跟的授权 / 联名 / 版权动向时会自动出现在这里。
          </p>
        </section>
      ) : (
        <section className="article-section hot-board">
          <ol className="hot-list">
            {events.map((ev, index) => (
              <li key={ev.id} className="hot-item">
                <span className="hot-rank">{index + 1}</span>
                <div className="hot-item-main">
                  <Link href={`/hot/${ev.id}`} className="hot-item-title font-serif">
                    {ev.title_cn ?? ev.canonical_title}
                  </Link>
                  <div className="hot-item-meta">
                    <span className="hot-sources">{ev.source_count} 家在说</span>
                    {isNew(ev) && <span className="hot-badge hot-badge-new">新</span>}
                    {isRising(ev) && <span className="hot-badge hot-badge-rising">上升</span>}
                    {ev.category && <span className="article-meta-tag"># {ev.category}</span>}
                    <span className="hot-time">{timeAgo(ev.first_seen_at)}</span>
                  </div>
                  {ev.summary_cn && <p className="hot-item-summary">{ev.summary_cn}</p>}
                  <HotEventActions
                    eventId={ev.id}
                    industryRelevant={ev.industry_relevant}
                  />
                </div>
                <span className="hot-heat" title="热度 = 独立信源权重 × 时间衰减">
                  {Number(ev.heat_score).toFixed(1)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  )
}
