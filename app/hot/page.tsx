import Link from 'next/link'
import type { Metadata } from 'next'
import { topEvents, isRising, isNew, type HotEvent } from '@/lib/events/hot'

export const revalidate = 120

export const metadata: Metadata = {
  title: '热点榜 | IP-HOT',
  description: 'IP 行业热点事件榜：按独立信源数与信源权重实时排序',
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
        <h1 className="page-title font-serif">热点榜</h1>
        <p className="hot-page-sub">
          同一件事的多家报道聚成一个事件 · 按独立信源数与信源权重排序 · 48 小时窗口
        </p>
      </header>

      {events.length === 0 ? (
        <section className="article-section">
          <p className="empty-state">
            热点榜还在攒数据——事件聚簇每 15 分钟跑一轮，热门事件出现后会出现在这里。
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
