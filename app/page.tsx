import { createServiceClient, getSupabase } from '@/lib/supabase'
import { CategoryTabs } from './components/CategoryTabs'
import { SearchBox } from './components/SearchBox'
import { AdminToggle } from './components/AdminToggle'
import { TimelineList } from './components/TimelineList'
import { isClearlyIndirectTechTitle } from '@/lib/relevance'
import { AdminPendingArticles } from './components/AdminPendingArticles'
import { paginateFilteredResults } from '@/lib/filtered-pagination'
import { formatArticleDate, resolveArticleDisplayTime } from '@/lib/article-time'
import { createArticleSearchPattern } from '@/lib/article-search'
import { DEFAULT_SELECTION_THRESHOLD, getSelectionThreshold } from '@/lib/selection-threshold'

// The public list must observe threshold changes without waiting for ISR expiry.
export const dynamic = 'force-dynamic'
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
  selection_threshold?: number | null
  published_at: string | null
  created_at: string | null
  image_url?: string | null
  is_video?: boolean | null
}

type SearchParams = { category?: string; q?: string; page?: string }

type ArticleResult = {
  articles: Article[]
  hasMore: boolean
}

type SourceRegion = 'domestic' | 'overseas' | 'japan'

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '1', 10)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(page, MAX_PAGE)
}

async function getArticles(category: string, q: string, page: number): Promise<ArticleResult> {
  const supabase = category === '版权保护' ? createServiceClient() : getSupabase()
  let selectionThreshold = DEFAULT_SELECTION_THRESHOLD
  try { selectionThreshold = await getSelectionThreshold(supabase) } catch (error) { console.error('Failed to fetch selection threshold:', error) }
  const totalToShow = page * ARTICLES_PER_PAGE
  const searchPattern = createArticleSearchPattern(q)
  try {
    const result = await paginateFilteredResults({
      targetCount: totalToShow,
      batchSize: DATABASE_BATCH_SIZE,
      include: (article: Article) =>
        (category === '版权保护' || !isClearlyIndirectTechTitle(article.title, article.category))
        && (article.relevance_score ?? -1) >= (article.selection_threshold ?? selectionThreshold),
      fetchRange: async (from, to) => {
        if (category === '版权保护') {
          let copyrightQuery = supabase
            .from('articles')
            .select('id, source, url, image_url, is_video, title, title_cn, summary_cn, commentary, category, relevance_score, selection_threshold, published_at, created_at')
            .eq('category', category)
            .order('published_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: false })
            .range(from, to)

          if (searchPattern) {
            copyrightQuery = copyrightQuery.orIlike(['title', 'title_cn', 'summary_cn'], searchPattern)
          }

          const { data, error } = await copyrightQuery
          if (error) throw error
          return (data ?? []) as Article[]
        }

        let query = supabase
          .from('articles')
          .select('id, source, url, image_url, is_video, title, title_cn, summary_cn, commentary, category, relevance_score, selection_threshold, published_at, created_at')
          .not('title_cn', 'is', null)
          .not('summary_cn', 'is', null)
          .not('category', 'is', null)
          .not('commentary', 'is', null)
          .neq('commentary', '')
          .neq('category', '待分类')
          .neq('category', '待人工复核')
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false })
          .range(from, to)

        if (category && category !== 'all') {
          query = query.eq('category', category)
        }
        if (searchPattern) {
          query = query.orIlike(['title', 'title_cn', 'summary_cn'], searchPattern)
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

function getDisplayDate(article: Article): string {
  const displayTime = resolveArticleDisplayTime(article.published_at, article.created_at)
  return formatArticleDate(displayTime.iso)
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

  if (!process.env.DATABASE_URL) {
    return (
      <>
        <header className="page-header">
          <div className="home-header-top">
            <h1 className="page-title font-serif">实时快讯</h1>
            <div className="home-header-actions">
              <SearchBox key={q} defaultValue={q} activeCategory={category} />
              <AdminToggle />
            </div>
          </div>
          <div className="page-toolbar home-category-toolbar">
            <CategoryTabs active={category} query={q} />
          </div>
        </header>
        <section className="article-section timeline-section">
          <p className="empty-state">
            数据库未连接。请先建立 SSH 隧道：ssh -N -L 5433:127.0.0.1:5432 root@101.32.211.198
          </p>
        </section>
      </>
    )
  }

  const isPendingCategory = category === '待分类'
  const { articles, hasMore } = isPendingCategory
    ? { articles: [], hasMore: false }
    : await getArticles(category, q, page)
  const { data: sources, error: sourcesError } = await getSupabase()
    .from('info_sources')
    .select('name, region')

  if (sourcesError) {
    console.error('Failed to fetch source regions:', sourcesError)
  }

  const sourceRegions = Object.fromEntries(
    (sources ?? []).map(({ name, region }) => [String(name).toLocaleLowerCase(), region as SourceRegion])
  )
  const dateGroups = groupByDate(articles)
  const dates = Object.keys(dateGroups)

  return (
    <>
      <header className="page-header">
        <div className="home-header-top">
          <h1 className="page-title font-serif">实时快讯</h1>
          <div className="home-header-actions">
            <SearchBox key={q} defaultValue={q} activeCategory={category} />
            <AdminToggle />
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
            sourceRegions={sourceRegions}
          />
        )}
      </section>
    </>
  )
}
