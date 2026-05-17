import { getSupabase } from '@/lib/supabase'
import Link from 'next/link'

export const metadata = {
  title: '今日精选 - IP 行业资讯快报',
  description: 'IP、ACG、文创行业高价值精选资讯',
}

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
  relevance_score: number | null
  published_at: string | null
}

async function getFeatured(): Promise<Article[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at')
    .eq('is_selected', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)

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

export default async function FeaturedPage() {
  const articles = await getFeatured()

  return (
    <>
      <header className="page-header">
        <div className="page-toolbar" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
          <Link href="/" className="sidebar-link" style={{ padding: '0.5rem', width: 'auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="page-title font-serif" style={{ margin: 0 }}>今日精选</h1>
        </div>
        <p className="page-sub">
          相关性评分 7 分以上的高价值资讯 · 共 {articles.length} 条
        </p>
      </header>

      <section className="article-section">
        {articles.length === 0 ? (
          <p className="empty-state">
            暂无精选内容。等 LLM 评分后，相关性 ≥ 7 分的文章会自动出现在这里。
          </p>
        ) : (
          <ul className="article-list">
            {articles.map((article) => (
              <li key={article.id}>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="article-card featured-card"
                >
                  <div className="article-meta">
                    <span>{formatDate(article.published_at)}</span>
                    {article.category && (
                      <>
                        <span>·</span>
                        <span className="featured-category">{article.category}</span>
                      </>
                    )}
                    {article.relevance_score !== null && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#e94560', fontWeight: 600 }}>
                          {article.relevance_score} 分
                        </span>
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
                      <span className="commentary-label">老贾点评：</span>
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
