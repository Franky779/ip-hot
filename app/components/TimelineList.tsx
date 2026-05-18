'use client'

import { useState, useCallback } from 'react'
import { useAdmin, ADMIN_PW_KEY } from './AdminToggle'
import { ArticleActions } from './ArticleActions'

interface Article {
  id: string
  source: string
  url: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  category: string | null
  relevance_score: number | null
  published_at: string | null
}

interface TimelineListProps {
  dateGroups: Record<string, Article[]>
  dates: string[]
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

export function TimelineList({ dateGroups, dates }: TimelineListProps) {
  const { isAdmin, loaded } = useAdmin()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const isSelectionMode = loaded && isAdmin && selectedIds.size > 0

  const filterArticles = (articles: Article[]) =>
    isAdmin
      ? articles
      : articles.filter((a) => (a.relevance_score ?? 10) >= 4)

  const allIds = dates.flatMap((date) => filterArticles(dateGroups[date]).map((a) => a.id))

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(allIds))
  }, [allIds])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条资讯？`)) return

    setDeleting(true)
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
    const ids = Array.from(selectedIds)

    const res = await fetch('/api/admin/delete-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ ids }),
    })

    setDeleting(false)

    if (res.ok) {
      ids.forEach((id) => {
        const el = document.getElementById(`article-${id}`)
        if (el) el.style.display = 'none'
      })
      setSelectedIds(new Set())
    } else {
      alert('批量删除失败')
    }
  }

  const isAllSelected = allIds.length > 0 && selectedIds.size === allIds.length

  return (
    <>
      {loaded && isAdmin && allIds.length > 0 && (
        <div className="batch-actions-bar">
          <label className="batch-checkbox-label">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={isAllSelected ? clearSelection : selectAll}
            />
            <span>全选</span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <span className="batch-count">已选 {selectedIds.size} 条</span>
              <button
                className="batch-delete-btn"
                onClick={handleBatchDelete}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '批量删除'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="timeline">
        {dates.map((date) => (
          <div key={date} className="timeline-date-group">
            <div className="timeline-date-header">
              <span className="timeline-date-label">{date}</span>
              <div className="timeline-date-line" />
            </div>
            <div className="timeline-entries">
              {filterArticles(dateGroups[date]).map((article) => (
                <div
                  key={article.id}
                  id={`article-${article.id}`}
                  className={`timeline-entry ${selectedIds.has(article.id) ? 'selected' : ''}`}
                >
                  <div className="timeline-time-col">
                    <span className="timeline-time">{formatTime(article.published_at)}</span>
                    <div className="timeline-dot" />
                    <div className="timeline-line" />
                  </div>
                  <div className="timeline-content-col">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="article-card"
                      onClick={(e) => {
                        if (isSelectionMode) {
                          e.preventDefault()
                          toggleSelect(article.id)
                        }
                      }}
                    >
                      <div className="article-meta">
                        {typeof article.relevance_score === 'number' && (
                          <span className="relevance-score">{article.relevance_score}</span>
                        )}
                        {article.category && <span>{article.category}</span>}
                      </div>
                      <h2 className="article-title font-serif">
                        {article.title_cn ?? article.title}
                      </h2>
                      {article.summary_cn && (
                        <p className="article-summary">{article.summary_cn}</p>
                      )}
                      {article.commentary && (
                        <p className="article-commentary">
                          <span className="commentary-label">推荐理由：</span>
                          {article.commentary}
                        </p>
                      )}
                    </a>
                    <ArticleActions
                      id={article.id}
                      title_cn={article.title_cn}
                      summary_cn={article.summary_cn}
                      commentary={article.commentary}
                      category={article.category}
                      selected={selectedIds.has(article.id)}
                      onToggle={() => toggleSelect(article.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
