import { getSupabase } from '@/lib/supabase'
import { SourcesClient } from './components/SourcesClient'
import { AdminToggle } from '../components/AdminToggle'

export const metadata = {
  title: '信息源管理 - IP 行业资讯快报',
  description: 'IP行业信息源主库管理',
}

export const revalidate = 300

export default async function SourcesPage() {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('info_sources')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('Failed to fetch sources:', error)
  }

  const sources = data ?? []
  const rssCount = sources.filter((source) =>
    source.fetch_type === 'rss'
    || source.type?.toLowerCase() === 'rss'
    || /(?:feed|rss|atom|\.xml)(?:\/|$|\?)/i.test(source.url)
  ).length

  return (
    <>
      <header className="page-header">
        <div className="sources-page-heading">
          <div>
            <h1 className="page-title font-serif">信息源管理</h1>
            <p className="page-sub">
              IP / ACG / 文创行业信息源主库 · 共 {sources.length} 条
            </p>
          </div>
          <div className="sources-header-stats">
            <div className="source-stat-item">
              <strong>{sources.length}</strong>
              <span>全部来源</span>
            </div>
            <div className="source-stat-item">
              <strong>{rssCount}</strong>
              <span>RSS</span>
            </div>
            <div className="source-stat-item">
              <strong>{sources.length - rssCount}</strong>
              <span>普通网页</span>
            </div>
            <div className="source-stat-item active">
              <strong>{sources.filter((source) => source.enabled).length}</strong>
              <span>自动抓取</span>
            </div>
            <div className="source-stat-item failed">
              <strong>{sources.filter((source) => source.last_test_status === 'failed').length}</strong>
              <span>测试异常</span>
            </div>
          </div>
          <AdminToggle />
        </div>
      </header>
      <SourcesClient initialSources={sources} />
    </>
  )
}
