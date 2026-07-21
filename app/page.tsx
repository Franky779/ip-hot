import { getSupabase } from '@/lib/supabase'
import { CategoryTabs } from './components/CategoryTabs'
import { SearchBox } from './components/SearchBox'
import { ArticlePageHeader } from './components/ArticlePageHeader'
import { TimelineSection } from './components/TimelineSection'
import { AutoLoadMore } from './components/AutoLoadMore'
import { groupArticlesByDate, type TimelineArticleRow } from '@/lib/article-timeline'

export const revalidate = 300

const ARTICLES_PER_PAGE = 30
const MAX_PAGE = 20
const SEARCH_LIMIT = 80

type SearchParams = {
  category?: string
  q?: string
  page?: string
}

function normalizePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '1', 10)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(page, MAX_PAGE)
}

function normalizeSearchParams(params: SearchParams) {
  return {
    category: (params.category ?? 'all').trim() || 'all',
    q: (params.q ?? '').trim().slice(0, SEARCH_LIMIT),
    page: normalizePage(params.page),
  }
}

function buildSearchPattern(q: string): string {
  // Supabase `or()` uses comma-separated filters, so strip commas from user input.
  return q.replace(/,/g, ' ').trim()
}

async function getArticles(category: string, q: string, page: number): Promise<TimelineArticleRow[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at, created_at')
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .not('category', 'is', null)
    .gte('relevance_score', 5)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(page * ARTICLES_PER_PAGE + 1)

  if (category !== 'all') {
    query = query.eq('category', category)
  }

  const searchPattern = buildSearchPattern(q)
  if (searchPattern) {
    query = query.or(`title.ilike.%${searchPattern}%,title_cn.ilike.%${searchPattern}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch articles:', error)
    return []
  }

  return (data ?? []) as TimelineArticleRow[]
}

function buildLoadMoreHref(category: string, q: string, nextPage: number): string {
  const params = new URLSearchParams()

  if (category !== 'all') params.set('category', category)
  if (q) params.set('q', q)
  params.set('page', String(nextPage))

  return `/?${params.toString()}`
}

function getEmptyMessage(q: string, category: string): string {
  if (q) return `未找到匹配「${q}」的内容`
  if (category !== 'all') return `${category} 分类暂无数据，LLM 处理后会自动归类`
  return '数据库暂无数据。下次 cron 抓取后会出现内容。'
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = normalizeSearchParams(await searchParams)
  const articleLimit = params.page * ARTICLES_PER_PAGE
  const fetchedArticles = await getArticles(params.category, params.q, params.page)
  const hasMore = fetchedArticles.length > articleLimit
  const articles = hasMore ? fetchedArticles.slice(0, articleLimit) : fetchedArticles
  const timelineGroups = groupArticlesByDate(articles)

  return (
    <>
      <ArticlePageHeader
        title="实时快讯"
        subtitle="动漫 / IP / 潮玩 / 文创 / 文旅 / 博物馆 / 数字创意产业资讯聚合"
        toolbar={
          <>
            <CategoryTabs active={params.category} query={params.q} />
            <SearchBox defaultValue={params.q} activeCategory={params.category} />
          </>
        }
      />

      <TimelineSection
        groups={timelineGroups}
        emptyMessage={getEmptyMessage(params.q, params.category)}
        className="timeline-section"
      >
        {hasMore && (
          <AutoLoadMore href={buildLoadMoreHref(params.category, params.q, params.page + 1)} />
        )}
      </TimelineSection>
    </>
  )
}
