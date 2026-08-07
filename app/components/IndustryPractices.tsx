'use client'

import { useState, useMemo } from 'react'
import { getAllPractices, searchPractices, type IndustryPractice } from '@/lib/practices'

export function IndustryPractices() {
  const practices = getAllPractices()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<IndustryPractice | null>(null)

  const filtered = useMemo(() => {
    return search ? searchPractices(search) : practices
  }, [search, practices])

  const categories = useMemo(() => {
    const cats = new Map<string, IndustryPractice[]>()
    for (const p of filtered) {
      const list = cats.get(p.category) ?? []
      list.push(p)
      cats.set(p.category, list)
    }
    return [...cats.entries()]
  }, [filtered])

  const totalCount = filtered.length

  const relatedPractices = useMemo(() => {
    if (!selected) return []
    return practices.filter((p) => p.category === selected.category && p.id !== selected.id).slice(0, 5)
  }, [selected, practices])

  if (practices.length === 0) return <p className="empty-state">暂无行业实操内容，正在从《超级IP孵化原理》逐章提取中…</p>

  return (
    <div className={`knowledge-view${selected ? ' has-detail' : ''}`}>
      {selected && (
        <>
          <div className="knowledge-detail-overlay" onClick={() => setSelected(null)} />
          <aside className="knowledge-detail-panel">
            <div className="knowledge-detail-accent" />
            <button className="knowledge-detail-back" onClick={() => setSelected(null)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              返回实操目录
            </button>
            <span className="knowledge-detail-cat">{selected.category} · {selected.type}</span>
            <h2 className="knowledge-detail-title">{selected.title}</h2>
            <div className="knowledge-detail-body">
              {selected.description && (
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">概述</h3>
                  <p>{selected.description}</p>
                </div>
              )}
              {selected.steps && selected.steps.length > 0 && (
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">操作步骤</h3>
                  <ol className="practice-steps">
                    {selected.steps.map((step, i) => (
                      <li key={i} className="practice-step-item">{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              {selected.keyRules && selected.keyRules.length > 0 && (
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">关键规则</h3>
                  <ul className="practice-rules">
                    {selected.keyRules.map((rule, i) => (
                      <li key={i} className="practice-rule-item">{rule}</li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.sourceChapter && (
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">出处</h3>
                  <p className="practice-source">{selected.sourceChapter}</p>
                </div>
              )}
            </div>
            {relatedPractices.length > 0 && (
              <div className="knowledge-detail-related">
                <h4 className="knowledge-detail-related-title">同分类其他实操</h4>
                <div className="knowledge-detail-related-pills">
                  {relatedPractices.map((p) => (
                    <button key={p.id} className="knowledge-pill" onClick={() => setSelected(p)}>{p.title}</button>
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
              placeholder="搜索行业实操、流程、标准…"
            />
          </div>
          <span className="knowledge-search-count">{search ? `${totalCount} 个结果` : `${totalCount} 条实操`}</span>
        </div>
        {categories.length === 0 && <p className="empty-state">未找到匹配内容，试试其他关键词</p>}
        <div className="knowledge-grid">
          {categories.map(([cat, items]) => (
            <div className="knowledge-group-card" key={cat}>
              <h3 className="knowledge-group-name">{cat}<span className="knowledge-group-badge">{items.length}</span></h3>
              <div className="knowledge-pills">
                {items.map((p) => (
                  <button
                    key={p.id}
                    className={`knowledge-pill${selected?.id === p.id ? ' active' : ''}`}
                    onClick={() => setSelected(selected?.id === p.id ? null : p)}
                  >
                    {p.title}
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
