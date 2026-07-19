import { getSupabase } from '@/lib/supabase'
import { SourcesClient } from './components/SourcesClient'
import { SourceStats } from './components/SourceStats'
import { AdminToggle } from '../components/AdminToggle'

export const metadata = {
  title: '信息源管理 - IP 行业资讯快报',
  description: 'IP行业信息源主库管理',
}

export const revalidate = 0

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
          <SourceStats initialSources={sources} />
          <AdminToggle />
        </div>
      </header>
      <SourcesClient initialSources={sources} />
    </>
  )
}
