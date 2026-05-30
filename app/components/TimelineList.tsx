'use client'

import { useState, useCallback, useMemo } from 'react'
import { useAdmin, ADMIN_PW_KEY } from './AdminToggle'
import { ArticleActions } from './ArticleActions'

const CATEGORIES = ['创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺', '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化', '政策规则', '版权保护']

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
    // 固定用 UTC 时区，避免服务端/客户端 hydrate mismatch
    return d.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    })
  } catch {
    return ''
  }
}

export function TimelineList({ dateGroups, dates }: TimelineListProps) {
  const { isAdmin, loaded } = useAdmin()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [filterScore, setFilterScore] = useState<number | null>(null)
  const [batchCategory, setBatchCategory] = useState('')
  const [categorizing, setCategorizing] = useState(false)

  const isSelectionMode = loaded && isAdmin && selectedIds.size > 0

  const filterArticles = (articles: Article[]) => {
    let filtered = isAdmin
      ? articles
      : articles.filter((a) => (a.relevance_score ?? 10) >= 4 && a.category !== '待分类' && a.commentary)
    if (filterScore !== null) {
      filtered = filtered.filter((a) => a.relevance_score === filterScore)
    }
    return filtered
  }

  // 当前页面所有出现的 relevance_score 唯一值(管理员模式用于评分筛选)
  const visibleScores = useMemo(() => {
    const scores = new Set<number>()
    dates.forEach((date) => {
      dateGroups[date].forEach((a) => {
        if (typeof a.relevance_score === 'number') {
          scores.add(a.relevance_score)
        }
      })
    })
    return Array.from(scores).sort((a, b) => b - a)
  }, [dates, dateGroups])

  // 每档评分的资讯数量统计
  const scoreCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    dates.forEach((date) => {
      dateGroups[date].forEach((a) => {
        if (typeof a.relevance_score === 'number') {
          counts[a.relevance_score] = (counts[a.relevance_score] || 0) + 1
        }
      })
    })
    return counts
  }, [dates, dateGroups])

  const toggleScoreFilter = useCallback((score: number) => {
    setFilterScore((prev) => (prev === score ? null : score))
  }, [])

  const visibleDates = dates.filter((date) => filterArticles(dateGroups[date]).length > 0)

  const allIds = visibleDates.flatMap((date) => filterArticles(dateGroups[date]).map((a) => a.id))

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

  const handleBatchCategorize = async () => {
    if (selectedIds.size === 0) return
    if (!batchCategory) {
      alert('请先选择分类')
      return
    }
    if (!confirm(`确定将选中的 ${selectedIds.size} 条资讯分类为「${batchCategory}」？`)) return

    setCategorizing(true)
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
    const ids = Array.from(selectedIds)

    const res = await fetch('/api/admin/update-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ ids, category: batchCategory }),
    })

    setCategorizing(false)

    if (res.ok) {
      setSelectedIds(new Set())
      setBatchCategory('')
      window.location.reload()
    } else {
      alert('批量分类失败')
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
          {visibleScores.length > 0 && (
            <div className="score-filter-btns">
              {visibleScores.map((score) => (
                <button
                  key={score}
                  className={`score-filter-btn ${filterScore === score ? 'active' : ''}`}
                  onClick={() => toggleScoreFilter(score)}
                  title={`只显示评分 ${score} 的资讯`}
                >
                  {score}
                  <span className="score-count">{scoreCounts[score] || 0}</span>
                </button>
              ))}
            </div>
          )}
          {selectedIds.size > 0 && (
            <>
              <div className="batch-actions-right">
                <span className="batch-count">已选 {selectedIds.size} 条</span>
                <div className="batch-categorize">
                  <select
                    value={batchCategory}
                    onChange={(e) => setBatchCategory(e.target.value)}
                    disabled={categorizing}
                  >
                    <option value="">选择分类…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <button
                    className="batch-categorize-btn"
                    onClick={handleBatchCategorize}
                    disabled={categorizing || !batchCategory}
                  >
                    {categorizing ? '分类中…' : '确认分类'}
                  </button>
                </div>
                <button
                  className="batch-delete-btn"
                  onClick={handleBatchDelete}
                  disabled={deleting}
                >
                  {deleting ? '删除中...' : '批量删除'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="timeline">
        {visibleDates.map((date) => (
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
                  onClick={(e) => {
                    if (isSelectionMode) {
                      if ((e.target as HTMLElement).closest('.article-actions')) return
                      toggleSelect(article.id)
                    }
                  }}
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
                    >
                      <div className="article-meta">
                        {typeof article.relevance_score === 'number' && (
                          <span className={`relevance-score ${article.relevance_score <= 3 ? 'score-low' : article.relevance_score >= 7 ? 'score-high' : 'score-mid'}`}>
                            {article.relevance_score}
                          </span>
                        )}
                        {article.category && (isAdmin || article.category !== '待分类') && <span>{article.category}</span>}
                        {article.source && <span className="article-source">{article.source}</span>}
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
                      relevance_score={article.relevance_score}
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
