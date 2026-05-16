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
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)

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

async function getFeatured(): Promise<Article[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, commentary, category, published_at')
    .eq('is_selected', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(5)

  if (error) {
    console.error('Failed to fetch featured:', error)
    return []
  }
  return (data ?? []) as Article[]
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return ''
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const category = params.category ?? 'all'
  const q = params.q ?? ''
  const [articles, featured] = await Promise.all([
    getArticles(category, q),
    getFeatured(),
  ])

  return (
    <>
      <header className="page-header">
        <h1 className="page-title font-serif">IP 行业资讯快报</h1>
        <p className="page-sub">
          动漫 / IP / ACG / 文创行业自动新闻聚合 · 每日北京时间 7:00 抓取 · 当前 {articles.length} 条
        </p>
        <div className="page-toolbar">
          <CategoryTabs active={category} query={q} />
          <SearchBox defaultValue={q} activeCategory={category} />
        </div>
      </header>

      {featured.length > 0 && (
        <section className="article-section featured-section">
          <h2 className="section-title">
            <span className="featured-icon">🔥</span> 今日精选
          </h2>
          <ul className="article-list">
            {featured.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-card featured-card"
                >
                  <div className="article-meta">
                    <span className="article-source">{article.source}</span>
                    <span>·</span>
                    <span>{formatDate(article.published_at)}</span>
                    {article.category && (
                      <>
                        <span>·</span>
                        <span className="featured-category">{article.category}</span>
                      </>
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
                      <span className="commentary-label">贾田点评：</span>
                      {article.commentary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="article-section">
        <h2 className="section-title">
          <span>📰</span> 最新资讯
        </h2>
        {articles.length === 0 ? (
          <p className="empty-state">
            {q
              ? `未找到匹配 "${q}" 的内容`
              : category !== 'all'
                ? `${category} 分类暂无数据（等 LLM 接入后会自动归类）`
                : '数据库暂无数据。下次 cron 抓取后会出现内容。'}
          </p>
        ) : (
          <ul className="article-list">
            {articles.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-card"
                >
                  <div className="article-meta">
                    <span className="article-source">{article.source}</span>
                    <span>·</span>
                    <span>{formatDate(article.published_at)}</span>
                    {article.category && (
                      <>
                        <span>·</span>
                        <span>{article.category}</span>
                      </>
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
                      <span className="commentary-label">贾田点评：</span>
                      {article.commentary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
