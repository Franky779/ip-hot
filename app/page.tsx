import { getSupabase } from '@/lib/supabase'
import { CategoryTabs } from './components/CategoryTabs'
import { SearchBox } from './components/SearchBox'
import { AdminToggle } from './components/AdminToggle'
import { TimelineList } from './components/TimelineList'

export const revalidate = 300

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
}

type SearchParams = { category?: string; q?: string }

async function getArticles(category: string, q: string): Promise<Article[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at')
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .not('category', 'is', null)
    .not('commentary', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(500)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,title_cn.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch articles:', error)
    return []
  }
  return (data ?? []) as Article[]
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

function groupByDate(articles: Article[]): Record<string, Article[]> {
  const groups: Record<string, Article[]> = {}
  for (const article of articles) {
    const date = formatDateLabel(article.published_at)
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
  const articles = await getArticles(category, q)
  const dateGroups = groupByDate(articles)
  const dates = Object.keys(dateGroups)

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title font-serif">实时快讯</h1>
            <p className="page-sub">
              动漫 / IP / 潮玩 / 文创 / 文旅 / 博物馆 / 数字创意产业资讯聚合
            </p>
          </div>
          <AdminToggle />
        </div>
        <div className="page-toolbar">
          <CategoryTabs active={category} query={q} />
          <SearchBox defaultValue={q} activeCategory={category} />
        </div>
      </header>

      <section className="article-section timeline-section">
        {articles.length === 0 ? (
          <p className="empty-state">
            {q
              ? `未找到匹配 "${q}" 的内容`
              : category !== 'all'
                ? `${category} 分类暂无数据（等 LLM 接入后会自动归类）`
                : '数据库暂无数据。下次 cron 抓取后会出现内容。'}
          </p>
        ) : (
          <TimelineList dateGroups={dateGroups} dates={dates} />
        )}
      </section>
    </>
  )
}
