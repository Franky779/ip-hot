import { getSupabase } from '@/lib/supabase'

export const revalidate = 60

type Article = {
  id: string
  source: string
  url: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  category: string | null
  published_at: string | null
}

async function getArticles(): Promise<Article[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('articles')
    .select('id, source, url, title, title_cn, summary_cn, category, published_at')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)

  if (error) {
    console.error('Failed to fetch articles:', error)
    return []
  }
  return (data ?? []) as Article[]
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}

export default async function Home() {
  const articles = await getArticles()

  return (
    <main className="min-h-screen bg-black text-white font-sans">
      <header className="border-b border-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <h1 className="text-2xl font-bold tracking-tight">IP 行业雷达</h1>
          <p className="text-sm text-zinc-500 mt-2">
            动漫 / IP / ACG / 文创行业自动聚合 · 每日北京时间 7:00 抓取
          </p>
          <p className="text-xs text-zinc-600 mt-1">
            当前 {articles.length} 条
          </p>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-8">
        {articles.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            数据库暂无数据。下次 cron 抓取后会出现内容。
          </p>
        ) : (
          <ul className="divide-y divide-zinc-900">
            {articles.map((article) => (
              <li key={article.id} className="py-4">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group hover:bg-zinc-950/40 -mx-3 px-3 py-2 rounded transition"
                >
                  <div className="flex items-baseline gap-3 text-xs text-zinc-500 mb-1">
                    <span className="font-mono">{article.source}</span>
                    <span>{formatDate(article.published_at)}</span>
                    {article.category && (
                      <span className="text-zinc-600">· {article.category}</span>
                    )}
                  </div>
                  <h2 className="text-base font-medium leading-snug text-zinc-100 group-hover:text-white">
                    {article.title_cn ?? article.title}
                  </h2>
                  {article.summary_cn && (
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
                      {article.summary_cn}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-zinc-900 mt-8">
        <div className="max-w-3xl mx-auto px-6 py-6 text-xs text-zinc-600 text-center">
          每天早 7:00 自动抓取 · 数据来自公开 RSS 源 · 仅展示标题与摘要
        </div>
      </footer>
    </main>
  )
}
