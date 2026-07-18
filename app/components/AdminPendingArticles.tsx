'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from './AdminToggle'
import { TimelineList } from './TimelineList'

type Article = {
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
  created_at: string | null
}

function getDateLabel(article: Article): string {
  const value = article.published_at || article.created_at
  if (!value) return '日期未知'
  const date = new Date(value)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function AdminPendingArticles({ query }: { query: string }) {
  const { isAdmin, loaded } = useAdmin()
  const [articles, setArticles] = useState<Article[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const loadPage = useCallback(async (nextPage: number) => {
    const password = localStorage.getItem(ADMIN_PW_KEY) || ''
    if (!password) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(nextPage) })
      if (query) params.set('q', query)
      const response = await fetch(`/api/admin/pending-articles?${params}`, {
        cache: 'no-store',
        headers: { 'x-admin-password': password },
      })
      if (!response.ok) return
      const result = await response.json()
      setArticles((previous) => nextPage === 1
        ? result.articles
        : [...previous, ...result.articles.filter((article: Article) =>
            !previous.some((existing) => existing.id === article.id)
          )]
      )
      setPage(nextPage)
      setTotal(result.total ?? 0)
      setHasMore(Boolean(result.hasMore))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    setArticles([])
    setPage(0)
    setTotal(0)
    setHasMore(true)
    if (loaded && isAdmin) loadPage(1)
  }, [isAdmin, loadPage, loaded])

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || loading || page === 0) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadPage(page + 1)
    }, { rootMargin: '500px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, loadPage, loading, page])

  const dateGroups = useMemo(() => {
    const groups: Record<string, Article[]> = {}
    for (const article of articles) {
      const label = getDateLabel(article)
      if (!groups[label]) groups[label] = []
      groups[label].push(article)
    }
    return groups
  }, [articles])
  const dates = Object.keys(dateGroups)

  if (!loaded) return <p className="empty-state">正在确认管理员身份…</p>
  if (!isAdmin) return <p className="empty-state">待分类资讯仅管理员可查看。</p>
  if (page === 0 && loading) return <p className="empty-state">正在加载待分类资讯…</p>
  if (!loading && articles.length === 0) return <p className="empty-state">没有待分类资讯。</p>

  return (
    <>
      <p className="pending-total">待分类共 {total} 条，已加载 {articles.length} 条</p>
      <TimelineList
        dateGroups={dateGroups}
        dates={dates}
        currentPage={1}
        hasMore={false}
        category="待分类"
        query={query}
      />
      <div ref={loadMoreRef} className="pending-load-status">
        {loading ? '正在加载更多…' : hasMore ? '继续向下滚动加载' : '已加载全部待分类资讯'}
      </div>
    </>
  )
}
