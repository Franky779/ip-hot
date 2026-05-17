import { getSupabase } from '@/lib/supabase'
import { CategoryTabs } from './components/CategoryTabs'
import { SearchBox } from './components/SearchBox'

export const revalidate = 60

type Article = {
  id: string
  source: string
  url: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  category: string | null
  published_at: string | null
}

type SearchParams = { category?: string; q?: string }

async function getArticles(category: string, q: string): Promise<Article[]> {
  const supabase = getSupabase()
  let query = supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, commentary, category, published_at')
    .not('title_cn', 'is', null)
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
        <h1 className="page-title font-serif">实时快讯</h1>
        <p className="page-sub">
          动漫 / IP / ACG / 文创行业自动新闻聚合 · 每日北京时间 7:00 抓取 · 当前 {articles.length} 条
        </p>
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
          <div className="timeline">
            {dates.map((date) => (
              <div key={date} className="timeline-date-group">
                <div className="timeline-date-header">
                  <span className="timeline-date-label">{date}</span>
                  <div className="timeline-date-line" />
                </div>
                <div className="timeline-entries">
                  {dateGroups[date].map((article) => (
                    <div key={article.id} className="timeline-entry">
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
                            {article.category && (
                              <span>{article.category}</span>
                            )}
                          </div>
                          <h2 className="article-title font-serif">
                            {article.title_cn ?? article.title}
                          </h2>
                          {article.summary_cn && (
                            <p className="article-summary">{article.summary_cn}</p>
                          )}
                          {article.commentary && (
                            <p className="article-commentary">
                              <span className="commentary-label">老贾点评：</span>
                              {article.commentary}
                            </p>
                          )}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
