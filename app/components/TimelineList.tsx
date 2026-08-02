'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useCallback, useMemo, useEffect, useRef, useTransition } from 'react'
import { useAdmin, ADMIN_PW_KEY } from './AdminToggle'
import { ArticleActions } from './ArticleActions'
import { isClearlyIndirectTechTitle } from '@/lib/relevance'
import { formatArticleTime, resolveArticleDisplayTime } from '@/lib/article-time'
import { splitSearchMatches } from '@/lib/article-search'

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
  selection_threshold?: number | null
  published_at: string | null
  created_at: string | null
  image_url?: string | null
  is_video?: boolean | null
}

interface TimelineListProps {
  dateGroups: Record<string, Article[]>
  dates: string[]
  currentPage: number
  hasMore: boolean
  category: string
  query: string
  sourceRegions?: Record<string, 'domestic' | 'overseas' | 'japan'>
}

function getSourceRegionLabel(source: string, sourceRegions: TimelineListProps['sourceRegions']): string {
  const region = sourceRegions?.[source.toLocaleLowerCase()]
  if (region === 'domestic' || (!region && /[\u3400-\u9fff]/.test(source))) return '国内资讯'
  return '国外资讯'
}

function HighlightText({ text, query }: { text: string; query: string }) {
  return <>{splitSearchMatches(text, query).map((part, index) => (
    part.highlighted
      ? <mark className="search-highlight" key={index}>{part.text}</mark>
      : <span key={index}>{part.text}</span>
  ))}</>
}

function buildPageHref(category: string, query: string, page: number): string {
  const params = new URLSearchParams()
  if (category && category !== 'all') params.set('category', category)
  if (query) params.set('q', query)
  if (page > 1) params.set('page', String(page))
  const search = params.toString()
  return search ? `/?${search}` : '/'
}

export function TimelineList({
  dateGroups,
  dates,
  currentPage,
  hasMore,
  category,
  query,
  sourceRegions,
}: TimelineListProps) {
  const router = useRouter()
  const { isAdmin, loaded } = useAdmin()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [filterScore, setFilterScore] = useState<number | null>(null)
  const [batchCategory, setBatchCategory] = useState('')
  const [categorizing, setCategorizing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const triggeredPageRef = useRef<number | null>(null)

  const isSelectionMode = loaded && isAdmin && selectedIds.size > 0

  const filterArticles = useCallback((articles: Article[]) => {
    let filtered = isAdmin || category === '版权保护'
      ? articles
      : articles.filter((a) =>
          (a.relevance_score ?? 10) >= (a.selection_threshold ?? 6)
          && a.category !== '待分类'
          && a.category !== '待人工复核'
          && a.commentary
          && !isClearlyIndirectTechTitle(a.title, a.category)
        )
    if (filterScore !== null) {
      filtered = filtered.filter((a) => a.relevance_score === filterScore)
    }
    return filtered
  }, [category, filterScore, isAdmin])

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

  const visibleDates = useMemo(
    () => dates.filter((date) => filterArticles(dateGroups[date]).length > 0),
    [dateGroups, dates, filterArticles]
  )

  const allIds = useMemo(
    () => visibleDates.flatMap((date) => filterArticles(dateGroups[date]).map((a) => a.id)),
    [dateGroups, filterArticles, visibleDates]
  )
  const nextPageHref = useMemo(
    () => buildPageHref(category, query, currentPage + 1),
    [category, query, currentPage]
  )

  useEffect(() => {
    if (!hasMore || isPending) return
    const target = loadMoreRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (triggeredPageRef.current === currentPage) return
        triggeredPageRef.current = currentPage
        startTransition(() => {
          router.push(nextPageHref, { scroll: false })
        })
      },
      { rootMargin: '600px 0px' }
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [currentPage, hasMore, isPending, nextPageHref, router])

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
                  {score}分资讯
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
              {filterArticles(dateGroups[date]).map((article) => {
                const displayTime = resolveArticleDisplayTime(article.published_at, article.created_at)
                return <div
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
                    <span
                      className="timeline-time"
                      title={displayTime.kind === 'published' ? '原文发布时间' : '收录时间'}
                    >
                      {formatArticleTime(displayTime.iso)}
                    </span>
                    <div className="timeline-dot" />
                    <div className="timeline-line" />
                  </div>
                  <div className="timeline-content-col">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`article-card${article.image_url ? ' has-image' : ''}`}
                    >
                      <div className="article-meta">
                        {loaded && isAdmin && typeof article.relevance_score === 'number' && (
                          <span className={`relevance-score ${article.relevance_score <= 3 ? 'score-low' : article.relevance_score >= 7 ? 'score-high' : 'score-mid'}`}>
                            {article.relevance_score}分
                          </span>
                        )}
                        {article.is_video && <span className="article-video-label">视频</span>}
                        {article.category && (isAdmin || article.category !== '待分类') && (
                          <span className="article-meta-tag"># {article.category}</span>
                        )}
                        {article.source && (
                          <span className="article-meta-tag"># {getSourceRegionLabel(article.source, sourceRegions)}</span>
                        )}
                      </div>
                      <div className="article-card-main">
                        <div className="article-card-copy">
                          <h2 className="article-title font-serif">
                            <HighlightText text={article.title_cn ?? article.title} query={query} />
                          </h2>
                          {article.summary_cn && (
                            <p className="article-summary">
                              <HighlightText text={article.summary_cn} query={query} />
                            </p>
                          )}
                          {article.commentary && (
                            <p className="article-commentary">
                              <span className="commentary-label">推荐理由：</span>
                              {article.commentary}
                            </p>
                          )}
                        </div>
                        {article.image_url && (
                          <div className="article-media">
                            {/* eslint-disable-next-line @next/next/no-img-element -- Source domains are dynamic and must not become an open image proxy. */}
                            <img
                              className="article-image"
                              src={article.image_url}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                const media = event.currentTarget.parentElement
                                if (media) media.style.display = 'none'
                              }}
                            />
                            {article.is_video && (
                              <span className="article-play-badge" aria-hidden="true">
                                <span />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
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
              })}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="load-more-wrap" ref={loadMoreRef}>
          <Link
            href={nextPageHref}
            scroll={false}
            className={`load-more-btn${isPending ? ' loading' : ''}`}
            aria-disabled={isPending}
          >
            {isPending ? '正在加载...' : '加载更多资讯'}
          </Link>
        </div>
      )}
    </>
  )
}
