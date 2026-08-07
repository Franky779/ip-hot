'use client'

import { useState, useMemo } from 'react'
import { IndustryPractices } from '@/app/components/IndustryPractices'

interface Article { id: string; title: string; sourceUrl: string; publishedAt: string }
interface KnowledgeTerm { id: string; category: string; term: string; definition: string; example?: string }
interface PodcastItem { title: string; date: string; url: string }
interface CourseItem { title: string; duration: string; videoUrl: string }

const TABS = [
  { key: 'articles', label: '公众号文章' },
  { key: 'knowledge', label: '行业知识' },
  { key: 'practices', label: '行业实操' },
  { key: 'podcast', label: '播客/直播' },
  { key: 'courses', label: '线上课程' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface TalksPageClientProps {
  articles: Article[]
  knowledge: KnowledgeTerm[]
  podcast: PodcastItem[]
  courses: CourseItem[]
}

export function TalksPageClient({ articles, knowledge, podcast, courses }: TalksPageClientProps) {
  const [active, setActive] = useState<TabKey>('articles')

  return (
    <>
      <header className="page-header">
        <div className="talks-header-row">
          <h1 className="page-title font-serif">老贾有话说</h1>
          <p className="page-sub">关于 IP、授权与营销的观察与思考</p>
        </div>
        <nav className="talks-tab-bar" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`talks-tab${active === tab.key ? ' active' : ''}`}
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="article-section">
        {active === 'articles' && (
          <div className="talks-list">
            {articles.length === 0 && <p className="empty-state">暂无文章</p>}
            {[...articles].sort((a, b) => Number(b.id) - Number(a.id)).map((item) => (
              <a className="talk-card talk-card-link" key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer">
                <h2>{item.title}</h2>
              </a>
            ))}
          </div>
        )}

        {active === 'knowledge' && <KnowledgeView terms={knowledge} />}

        {active === 'practices' && <IndustryPractices />}

        {active === 'podcast' && (
          <div className="talks-list">
            {podcast.length === 0 && <p className="empty-state">暂无播客</p>}
            {podcast.map((item) => (
              <article className="talk-card" key={item.title}>
                <h2>{item.title}</h2>
                <time className="talk-card-meta" dateTime={item.date}>{item.date}</time>
              </article>
            ))}
          </div>
        )}

        {active === 'courses' && (
          <div className="talks-list">
            {courses.length === 0 && <p className="empty-state">暂无课程</p>}
            {courses.map((item) => (
              <article className="talk-card" key={item.title}>
                <h2>{item.title}</h2>
                <span className="talk-card-meta">{item.duration}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function KnowledgeView({ terms }: { terms: KnowledgeTerm[] }) {
  const allTerms = terms
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<KnowledgeTerm | null>(null)

  const filtered = useMemo(() => {
    if (!search) return allTerms
    const q = search.toLowerCase()
    return allTerms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    )
  }, [search, allTerms])

  const categories = useMemo(() => {
    const cats = new Map<string, KnowledgeTerm[]>()
    for (const t of filtered) {
      const list = cats.get(t.category) ?? []
      list.push(t)
      cats.set(t.category, list)
    }
    return [...cats.entries()]
  }, [filtered])

  const totalCount = filtered.length

  const relatedTerms = useMemo(() => {
    if (!selected) return []
    return allTerms.filter((t) => t.category === selected.category && t.id !== selected.id).slice(0, 5)
  }, [selected, allTerms])

  if (allTerms.length === 0) return <p className="empty-state">暂无知识词条</p>

  return (
    <div className={`knowledge-view${selected ? ' has-detail' : ''}`}>
      {selected && (
        <>
          <div className="knowledge-detail-overlay" onClick={() => setSelected(null)} />
          <aside className="knowledge-detail-panel">
            <div className="knowledge-detail-accent" />
            <button className="knowledge-detail-back" onClick={() => setSelected(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              返回词条目录
            </button>
            <span className="knowledge-detail-cat">{selected.category}</span>
            <h2 className="knowledge-detail-title">{selected.term}</h2>
            <div className="knowledge-detail-body">
              <div className="knowledge-detail-section">
                <h3 className="knowledge-section-heading">名词解释</h3>
                <p>{selected.definition}</p>
              </div>
              {selected.example && (
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">举例</h3>
                  <p>{selected.example}</p>
                </div>
              )}
            </div>
            {relatedTerms.length > 0 && (
              <div className="knowledge-detail-related">
                <h4 className="knowledge-detail-related-title">同分类其他词条</h4>
                <div className="knowledge-detail-related-pills">
                  {relatedTerms.map((t) => (
                    <button key={t.id} className="knowledge-pill" onClick={() => setSelected(t)}>{t.term}</button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </>
      )}

      <div className="knowledge-main">
        <div className="knowledge-search-wrap">
          <div className="knowledge-search-box">
            <svg className="knowledge-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="knowledge-search-input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
              placeholder="搜索 IP 行业术语…"
            />
          </div>
          <span className="knowledge-search-count">{search ? `${totalCount} 个结果` : `${totalCount} 个词条`}</span>
        </div>
        {categories.length === 0 && <p className="empty-state">未找到匹配词条，试试其他关键词</p>}
        <div className="knowledge-grid">
          {categories.map(([cat, items]) => (
            <div className="knowledge-group-card" key={cat}>
              <h3 className="knowledge-group-name">{cat}<span className="knowledge-group-badge">{items.length}</span></h3>
              <div className="knowledge-pills">
                {items.map((t) => (
                  <button
                    key={t.id}
                    className={`knowledge-pill${selected?.id === t.id ? ' active' : ''}`}
                    onClick={() => setSelected(selected?.id === t.id ? null : t)}
                  >
                    {t.term}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
