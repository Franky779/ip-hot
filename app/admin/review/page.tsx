'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAdmin } from '../../components/AdminToggle'

const PAGE_SIZE = 20

const CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺',
  '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化',
  '政策规则', '版权保护', '待分类',
]

type Article = {
  id: string
  source: string | null
  url: string | null
  title: string | null
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  category: string | null
  relevance_score: number | null
  published_at: string | null
  created_at: string | null
}

function getPw() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ip-hot-admin-pw')
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const now = Date.now()
    const diffMs = now - d.getTime()
    const diffH = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffH < 1) return `${Math.floor(diffMs / (1000 * 60))}分钟前`
    if (diffH < 24) return `${diffH}小时前`
    if (diffH < 48) return '昨天'
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `${diffD}天前`
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  } catch {
    return iso
  }
}

function scoreColor(s: number): string {
  if (s >= 7) return '#2e9d5a'
  if (s >= 5) return '#e6a817'
  return '#e94560'
}

export default function ReviewPage() {
  const { isAdmin, loaded } = useAdmin()
  const [articles, setArticles] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionState, setActionState] = useState<Record<string, string>>({})
  const [batchCategory, setBatchCategory] = useState(CATEGORIES[0])
  const [batchBusy, setBatchBusy] = useState(false)
  const [reclassifyOpen, setReclassifyOpen] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reclassifyRef = useRef<HTMLDivElement>(null)

  const fetchArticles = useCallback(async (pageNum: number, q: string) => {
    const pw = getPw()
    if (!pw) { setLoading(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum) })
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/pending-review?${params}`, {
        cache: 'no-store',
        headers: { 'x-admin-password': pw },
      })
      if (res.ok) {
        const json = await res.json()
        setArticles(json.articles ?? [])
        setTotal(json.total ?? 0)
        setHasMore(json.hasMore ?? false)
      }
    } catch { /* silent */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!loaded) return
    void fetchArticles(page, searchText)
  }, [loaded, page, fetchArticles])
  // searchText triggers fetch via handleSearch

  // Close reclassify dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (reclassifyRef.current && !reclassifyRef.current.contains(e.target as Node)) {
        setReclassifyOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSearch = (value: string) => {
    setSearchText(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      setSelectedIds(new Set())
      void fetchArticles(1, value)
    }, 400)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === articles.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(articles.map((a) => a.id)))
    }
  }

  const doAction = async (id: string, action: string, newCategory?: string) => {
    setActionState((prev) => ({ ...prev, [id]: action }))
    const pw = getPw() || ''
    try {
      const body: Record<string, unknown> = { id, action }
      if (newCategory) body.newCategory = newCategory
      const res = await fetch('/api/admin/review-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.id !== id))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        setTotal((prev) => Math.max(0, prev - 1))
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.error || '操作失败')
      }
    } catch {
      alert('请求失败')
    } finally {
      setActionState((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      setReclassifyOpen(null)
    }
  }

  const handleBatchAction = async (action: string) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) { alert('请先勾选文章'); return }
    const labelMap: Record<string, string> = { select: '精选', delete: '删除', reclassify: `改为「${batchCategory}」` }
    const label = labelMap[action] || action
    if (!confirm(`确定批量${label} ${ids.length} 条资讯？`)) return

    setBatchBusy(true)
    const pw = getPw() || ''
    const results = await Promise.all(
      ids.map((id) => {
        const body: Record<string, unknown> = { id, action }
        if (action === 'reclassify') body.newCategory = batchCategory
        return fetch('/api/admin/review-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
          body: JSON.stringify(body),
        }).then((r) => r.ok).catch(() => false)
      })
    )
    const ok = results.filter(Boolean).length
    const fail = results.length - ok
    setSelectedIds(new Set())
    setBatchBusy(false)
    alert(`批量${label}完成：成功 ${ok} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`)
    void fetchArticles(page, searchText)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (!loaded) return <div className="admin-auth-hint">加载中…</div>
  if (!isAdmin) return <div className="admin-auth-hint">🔒 请先输入管理密码</div>

  return (
    <div className="review-page">
      <div className="review-header">
        <div>
          <h1 className="review-page-title">人工复核</h1>
          <p className="review-page-subtitle">
            共 {total.toLocaleString('zh-CN')} 条待审核 · 评分 4-5 的边界资讯
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="review-search-wrap">
        <svg className="review-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="review-search-input"
          type="text"
          placeholder="搜索标题…"
          value={searchText}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Batch toolbar */}
      <div className="review-toolbar">
        <label className="review-checkall">
          <input
            type="checkbox"
            checked={articles.length > 0 && selectedIds.size === articles.length}
            onChange={toggleSelectAll}
          />
          全选
        </label>
        {selectedIds.size > 0 && (
          <>
            <span className="review-selected-count">已选 {selectedIds.size} 条</span>
            <button
              className="review-toolbar-btn review-btn-select"
              onClick={() => handleBatchAction('select')}
              disabled={batchBusy}
            >
              ⭐ 批量精选
            </button>
            <button
              className="review-toolbar-btn review-btn-delete"
              onClick={() => handleBatchAction('delete')}
              disabled={batchBusy}
            >
              🗑️ 批量删除
            </button>
            <div className="review-batch-reclassify">
              <select
                className="review-cat-select"
                value={batchCategory}
                onChange={(e) => setBatchCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                className="review-toolbar-btn review-btn-reclassify"
                onClick={() => handleBatchAction('reclassify')}
                disabled={batchBusy}
              >
                批量改分类
              </button>
            </div>
          </>
        )}
      </div>

      {/* Article list */}
      {loading ? (
        <div className="admin-auth-hint">加载中…</div>
      ) : articles.length === 0 ? (
        <div className="review-empty">
          <p>{searchText ? '没有匹配的文章' : '🎉 没有待复核文章'}</p>
        </div>
      ) : (
        <div className="review-list">
          {articles.map((article) => (
            <div key={article.id} className={`review-card${selectedIds.has(article.id) ? ' selected' : ''}`}>
              <div className="review-card-top">
                <input
                  type="checkbox"
                  className="review-card-check"
                  checked={selectedIds.has(article.id)}
                  onChange={() => toggleSelect(article.id)}
                />
                <div className="review-card-body">
                  <div className="review-card-head">
                    <h3 className="review-card-title">
                      {article.title_cn || article.title || '(无标题)'}
                    </h3>
                    <span
                      className="review-score-badge"
                      style={{ background: scoreColor(article.relevance_score ?? 0) }}
                    >
                      评分 {article.relevance_score ?? '-'}
                    </span>
                  </div>
                  {article.summary_cn && (
                    <p className="review-card-summary">{article.summary_cn}</p>
                  )}
                  {article.commentary && (
                    <div className="review-card-commentary">
                      💬 {article.commentary}
                    </div>
                  )}
                  <div className="review-card-meta">
                    <span>{article.source || '未知来源'}</span>
                    <span>·</span>
                    <span>{formatTime(article.created_at)}</span>
                    {article.url && (
                      <>
                        <span>·</span>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="review-card-link">
                          原文 ↗
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="review-card-actions">
                <button
                  className="review-action-btn select"
                  onClick={() => doAction(article.id, 'select')}
                  disabled={!!actionState[article.id]}
                >
                  {actionState[article.id] === 'select' ? '处理中…' : '⭐ 精选'}
                </button>
                <button
                  className="review-action-btn delete"
                  onClick={() => doAction(article.id, 'delete')}
                  disabled={!!actionState[article.id]}
                >
                  {actionState[article.id] === 'delete' ? '处理中…' : '🗑️ 删除'}
                </button>
                <div className="review-reclassify-wrap" ref={reclassifyOpen === article.id ? reclassifyRef : undefined}>
                  <button
                    className="review-action-btn reclassify"
                    onClick={() => setReclassifyOpen(reclassifyOpen === article.id ? null : article.id)}
                    disabled={!!actionState[article.id]}
                  >
                    {actionState[article.id] === 'reclassify' ? '处理中…' : '📂 改分类'}
                  </button>
                  {reclassifyOpen === article.id && (
                    <div className="review-reclassify-dropdown">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat}
                          className="review-reclassify-option"
                          onClick={() => doAction(article.id, 'reclassify', cat)}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="review-pagination">
          <button
            className="review-page-btn"
            disabled={page <= 1}
            onClick={() => { setPage(page - 1); setSelectedIds(new Set()) }}
          >
            ◀ 上一页
          </button>
          <span className="review-page-info">
            第 {page} / {totalPages} 页
          </span>
          <button
            className="review-page-btn"
            disabled={!hasMore}
            onClick={() => { setPage(page + 1); setSelectedIds(new Set()) }}
          >
            下一页 ▶
          </button>
        </div>
      )}
    </div>
  )
}
