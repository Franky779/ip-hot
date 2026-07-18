'use client'

import { useState, useCallback } from 'react'
import { useAdmin } from '@/app/components/AdminToggle'
import { SourceModal } from './SourceModal'

interface Source {
  id: string
  section_id: string
  section_title: string
  region: string
  name: string
  url: string
  type: string
  description: string
  method: string
  fetch_type?: 'rss' | 'web'
  enabled?: boolean
  last_test_status?: 'untested' | 'success' | 'failed'
  last_tested_at?: string | null
  last_test_message?: string
  sort_order: number
}

interface SourcesClientProps {
  initialSources: Source[]
}

type TestResult = {
  status: 'success' | 'failed'
  message: string
}

const REGION_LABELS: Record<string, string> = {
  domestic: '国内',
  overseas: '海外',
  japan: '日本',
}

function groupBySection(sources: Source[]) {
  const groups: Record<string, { title: string; region: string; items: Source[] }> = {}
  for (const s of sources) {
    if (!groups[s.section_id]) {
      groups[s.section_id] = { title: s.section_title, region: s.region, items: [] }
    }
    groups[s.section_id].items.push(s)
  }
  return groups
}

function getFetchType(source: Source): 'rss' | 'web' {
  if (source.fetch_type) return source.fetch_type
  if (source.type?.toLowerCase() === 'rss') return 'rss'
  return /(?:feed|rss|atom|\.xml)(?:\/|$|\?)/i.test(source.url) ? 'rss' : 'web'
}

function generateMarkdown(sources: Source[]): string {
  const sections = groupBySection(sources)
  const sectionIds = Object.keys(sections)

  let md = '# IP 行业信息源主库\n\n'
  md += '**用途**: ip-news skill 执行"全行业资讯"模式时的站点清单\\n\n'
  md += '**维护规则**: 新增站点时填写完整字段\\n\n'
  md += '---\n\n'

  // 国内
  md += '## 一、国内站点\n\n'
  for (const sid of sectionIds) {
    const sec = sections[sid]
    if (sec.region !== 'domestic') continue
    md += `### ${sec.title}\n\n`
    md += '| 网站名称 | 网址 | 网站定位 | 值得我收录的原因 | 对应的抓取方式及后备抓取方案 |\n'
    md += '|---------|------|---------|----------------|--------------------------|\n'
    for (const item of sec.items) {
      md += `| ${item.name} | ${item.url} | ${item.type} | ${item.description} | ${item.method} |\n`
    }
    md += '\n'
  }

  // 海外
  md += '## 二、海外站点\n\n'
  for (const sid of sectionIds) {
    const sec = sections[sid]
    if (sec.region !== 'overseas' && sec.region !== 'japan') continue
    md += `### ${sec.title}\n\n`
    md += '| 网站名称 | 网址 | 网站定位 | 值得我收录的原因 | 对应的抓取方式及后备抓取方案 |\n'
    md += '|---------|------|---------|----------------|--------------------------|\n'
    for (const item of sec.items) {
      md += `| ${item.name} | ${item.url} | ${item.type} | ${item.description} | ${item.method} |\n`
    }
    md += '\n'
  }

  md += '---\n\n'
  md += `## 维护记录\n\n`
  md += `- ${new Date().toISOString().slice(0, 10)} 导出\n`

  return md
}

export function SourcesClient({ initialSources }: SourcesClientProps) {
  const { isAdmin, loaded } = useAdmin()
  const [sources, setSources] = useState<Source[]>(initialSources)
  const [showModal, setShowModal] = useState(false)
  const [editingSource, setEditingSource] = useState<Source | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set())
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [keyword, setKeyword] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [fetchTypeFilter, setFetchTypeFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const sectionOptions = Array.from(
    new Map(sources.map((source) => [source.section_id, source.section_title])).entries()
  )
  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredSources = sources.filter((source) => {
    const matchesKeyword = !normalizedKeyword || [
      source.name, source.url, source.type, source.description, source.method,
    ].some((value) => value?.toLowerCase().includes(normalizedKeyword))
    const matchesRegion = regionFilter === 'all' || source.region === regionFilter
    const matchesFetchType = fetchTypeFilter === 'all' || getFetchType(source) === fetchTypeFilter
    const matchesSection = sectionFilter === 'all' || source.section_id === sectionFilter
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'enabled' && source.enabled)
      || (statusFilter === 'disabled' && !source.enabled)
      || (statusFilter === 'success' && source.last_test_status === 'success')
      || (statusFilter === 'failed' && source.last_test_status === 'failed')
      || (statusFilter === 'untested' && (!source.last_test_status || source.last_test_status === 'untested'))
    return matchesKeyword && matchesRegion && matchesFetchType && matchesSection && matchesStatus
  })
  const hasFilters = keyword !== '' || regionFilter !== 'all' || fetchTypeFilter !== 'all'
    || sectionFilter !== 'all' || statusFilter !== 'all'
  const grouped = groupBySection(filteredSources)
  const sectionIds = Object.keys(grouped)

  // 排序：国内在前，海外/日本在后；RSS 和 tools 在最后
  const sortedIds = sectionIds.sort((a, b) => {
    const order = (id: string) => {
      if (id.startsWith('rss-')) return 1000
      if (id === 'tools') return 2000
      return grouped[id].region === 'domestic' ? 0 : 500
    }
    return order(a) - order(b) || grouped[a].items[0]?.sort_order - grouped[b].items[0]?.sort_order
  })

  const handleRefresh = useCallback(async () => {
    const res = await fetch('/api/sources')
    if (res.ok) {
      const data = await res.json()
      setSources(data.sources || [])
    }
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条信息源？')) return
    setDeletingId(id)
    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    const res = await fetch('/api/admin/sources/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ id }),
    })
    setDeletingId(null)
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== id))
    } else {
      alert('删除失败')
    }
  }

  const updateSource = async (id: string, changes: Partial<Source>) => {
    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    const res = await fetch('/api/admin/sources', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
      body: JSON.stringify({ id, ...changes }),
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({}))
      alert('保存失败: ' + (error.error || '未知错误'))
      return false
    }
    await handleRefresh()
    return true
  }

  const handleTest = async (id: string) => {
    if (testingIds.has(id)) return
    setTestingIds((previous) => new Set(previous).add(id))
    setTestResults((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })

    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      const res = await fetch('/api/admin/sources/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id }),
      })
      const result = await res.json().catch(() => ({}))
      setTestResults((previous) => ({
        ...previous,
        [id]: {
          status: res.ok && result.ok ? 'success' : 'failed',
          message: result.message || result.error || (res.ok ? '测试完成' : '测试失败'),
        },
      }))
      await handleRefresh()
    } catch {
      setTestResults((previous) => ({
        ...previous,
        [id]: { status: 'failed', message: '网络请求失败，请稍后重试。' },
      }))
    } finally {
      setTestingIds((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }

  const handleExport = () => {
    const md = generateMarkdown(sources)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `search-scope-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!loaded) return null

  return (
    <>
      <section className="article-section">
        <div className="source-filter-panel">
          <div className="source-filter-grid">
            <label className="source-search-field">
              <span>关键词</span>
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称、网址或简介"
              />
            </label>
            <label>
              <span>来源地区</span>
              <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)}>
                <option value="all">全部地区</option>
                <option value="domestic">国内</option>
                <option value="overseas">海外</option>
                <option value="japan">日本</option>
              </select>
            </label>
            <label>
              <span>抓取类型</span>
              <select value={fetchTypeFilter} onChange={(event) => setFetchTypeFilter(event.target.value)}>
                <option value="all">全部类型</option>
                <option value="rss">RSS</option>
                <option value="web">普通网页</option>
              </select>
            </label>
            <label>
              <span>行业类型</span>
              <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
                <option value="all">全部行业</option>
                {sectionOptions.map(([id, title]) => (
                  <option key={id} value={id}>{title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>运行状态</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">全部状态</option>
                <option value="enabled">自动抓取已启用</option>
                <option value="disabled">自动抓取已停用</option>
                <option value="success">最近测试成功</option>
                <option value="failed">最近测试失败</option>
                <option value="untested">尚未测试</option>
              </select>
            </label>
          </div>
          <div className="source-filter-summary">
            <span>当前显示 <strong>{filteredSources.length}</strong> / {sources.length} 条</span>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setKeyword('')
                  setRegionFilter('all')
                  setFetchTypeFilter('all')
                  setSectionFilter('all')
                  setStatusFilter('all')
                }}
              >
                清除筛选
              </button>
            )}
          </div>
        </div>

        {loaded && isAdmin && (
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <button
              className="search-btn"
              onClick={() => {
                setEditingSource(null)
                setShowModal(true)
              }}
            >
              + 新增信息源
            </button>
            <button
              className="search-btn"
              onClick={handleExport}
              style={{ background: '#2d8a4e' }}
            >
              导出 Markdown
            </button>
          </div>
        )}

        {sortedIds.map((sid) => {
          const sec = grouped[sid]
          return (
            <div key={sid} className="source-section">
              <div className="section-header">
                <h2 className="section-title">{sec.title}</h2>
                <span className="source-region-tag">{REGION_LABELS[sec.region] || sec.region}</span>
              </div>
              <div className="source-list">
                {sec.items.map((item) => (
                  <div key={item.id} className="source-card">
                    <div className="source-header">
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="source-name">
                        {item.name}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <span className="source-tag">{item.type}</span>
                    </div>
                    <p className="source-method source-runtime-status">
                      {item.enabled ? '🟢 自动抓取已启用' : '⚪ 自动抓取已停用'}
                      {' · '}{getFetchType(item) === 'rss' ? 'RSS' : '普通网页'}
                      {item.last_test_status === 'success' && ' · 最近测试成功'}
                      {item.last_test_status === 'failed' && ' · 最近测试失败'}
                    </p>
                    {item.description && (
                      <p className="source-desc">{item.description}</p>
                    )}
                    {item.method && (
                      <p className="source-method source-config">{item.method}</p>
                    )}
                    {loaded && isAdmin && (
                      <div className="source-actions">
                        <button
                          className="article-action-btn edit"
                          onClick={() => updateSource(item.id, { enabled: !item.enabled })}
                        >
                          {item.enabled ? '停用' : '启用'}
                        </button>
                        <button
                          className="article-action-btn edit"
                          onClick={() => handleTest(item.id)}
                          disabled={testingIds.has(item.id)}
                        >
                          {testingIds.has(item.id) ? '测试中...' : '测试'}
                        </button>
                        <button
                          className="article-action-btn edit"
                          onClick={() => {
                            setEditingSource(item)
                            setShowModal(true)
                          }}
                        >
                          编辑
                        </button>
                        <button
                          className="article-action-btn delete"
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? '删除中...' : '删除'}
                        </button>
                      </div>
                    )}
                    {testingIds.has(item.id) && (
                      <div className="source-test-result testing">正在连接并测试该信息源…</div>
                    )}
                    {!testingIds.has(item.id) && testResults[item.id] && (
                      <div className={`source-test-result ${testResults[item.id].status}`}>
                        {testResults[item.id].status === 'success' ? '测试成功：' : '测试失败：'}
                        {testResults[item.id].message}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {filteredSources.length === 0 && (
          <div className="source-empty-state">
            <strong>没有找到符合条件的信息源</strong>
            <span>可以调整筛选条件，或点击“清除筛选”查看全部。</span>
          </div>
        )}
      </section>

      {showModal && (
        <SourceModal
          source={editingSource ? {
            ...editingSource,
            fetch_type: getFetchType(editingSource),
            enabled: editingSource.enabled ?? false,
          } : null}
          onClose={() => setShowModal(false)}
          onSaved={handleRefresh}
        />
      )}
    </>
  )
}
