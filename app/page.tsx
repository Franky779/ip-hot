import { createServiceClient, getSupabase } from '@/lib/supabase'
import { CategoryTabs } from './components/CategoryTabs'
import { SearchBox } from './components/SearchBox'
import { AdminToggle } from './components/AdminToggle'
import { TimelineList } from './components/TimelineList'
import { isClearlyIndirectTechTitle } from '@/lib/relevance'
import { AdminPendingArticles } from './components/AdminPendingArticles'
import { paginateFilteredResults } from '@/lib/filtered-pagination'

export const revalidate = 300
const ARTICLES_PER_PAGE = 20
const MAX_PAGE = 50
const DATABASE_BATCH_SIZE = 100

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

type SearchParams = { category?: string; q?: string; page?: string }

type ArticleResult = {
  articles: Article[]
  hasMore: boolean
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '1', 10)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(page, MAX_PAGE)
}

async function getArticles(category: string, q: string, page: number): Promise<ArticleResult> {
  const supabase = category === '版权保护' ? createServiceClient() : getSupabase()
  const totalToShow = page * ARTICLES_PER_PAGE
  try {
    const result = await paginateFilteredResults({
      targetCount: totalToShow,
      batchSize: DATABASE_BATCH_SIZE,
      include: (article: Article) =>
        category === '版权保护' || !isClearlyIndirectTechTitle(article.title, article.category),
      fetchRange: async (from, to) => {
        let query = supabase
          .from('articles')
          .select('id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at, created_at')
          .not('category', 'is', null)
          .neq('category', '待分类')

        if (category !== '版权保护') {
          query = query
            .not('title_cn', 'is', null)
            .not('summary_cn', 'is', null)
            .not('commentary', 'is', null)
            .neq('commentary', '')
            .gte('relevance_score', 7)
        }

        query = query
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(from, to)

        if (category && category !== 'all') {
          query = query.eq('category', category)
        }
        if (q) {
          query = query.or(`title.ilike.%${q}%,title_cn.ilike.%${q}%`)
        }

        const { data, error } = await query
        if (error) throw error
        return (data ?? []) as Article[]
      },
    })

    return { articles: result.items, hasMore: result.hasMore }
  } catch (error) {
    console.error('Failed to fetch articles:', error)
    return { articles: [], hasMore: false }
  }
}

function formatDateLabel(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  } catch {
    return ''
  }
}

function getDisplayDate(article: Article): string {
  return formatDateLabel(article.published_at || article.created_at)
}

function groupByDate(articles: Article[]): Record<string, Article[]> {
  const groups: Record<string, Article[]> = {}
  for (const article of articles) {
    const date = getDisplayDate(article)
    if (!date) continue
    if (!groups[date]) groups[date] = []
    groups[date].push(article)
  }
  return groups
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const category = params.category ?? 'all'
  const q = params.q ?? ''
  const page = parsePage(params.page)
  const isPendingCategory = category === '待分类'
  const { articles, hasMore } = isPendingCategory
    ? { articles: [], hasMore: false }
    : await getArticles(category, q, page)
  const dateGroups = groupByDate(articles)
  const dates = Object.keys(dateGroups)

  return (
    <>
      <header className="page-header">
        <div className="home-header-top">
          <div>
            <h1 className="page-title font-serif">实时快讯</h1>
            <p className="page-sub">
              动漫 / IP / 潮玩 / 文创 / 文旅 / 博物馆 / 数字创意产业资讯聚合
            </p>
          </div>
          <div className="home-header-actions">
            <AdminToggle />
            <SearchBox defaultValue={q} activeCategory={category} />
          </div>
        </div>
        <div className="page-toolbar home-category-toolbar">
          <CategoryTabs active={category} query={q} />
        </div>
      </header>

      <section className="article-section timeline-section">
        {isPendingCategory ? (
          <AdminPendingArticles query={q} />
        ) : articles.length === 0 ? (
          <p className="empty-state">
            {q
              ? `未找到匹配 "${q}" 的内容`
              : category !== 'all'
                ? `${category} 分类暂无数据（等 LLM 接入后会自动归类）`
                : '数据库暂无数据。下次 cron 抓取后会出现内容。'}
          </p>
        ) : (
          <TimelineList
            dateGroups={dateGroups}
            dates={dates}
            currentPage={page}
            hasMore={hasMore}
            category={category}
            query={q}
          />
        )}
      </section>
    </>
  )
}
