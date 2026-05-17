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
  sort_order: number
}

interface SourcesClientProps {
  initialSources: Source[]
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

  const grouped = groupBySection(sources)
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
                    {item.description && (
                      <p className="source-desc">{item.description}</p>
                    )}
                    {item.method && (
                      <p className="source-method">{item.method}</p>
                    )}
                    {loaded && isAdmin && (
                      <div className="source-actions">
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
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      {showModal && (
        <SourceModal
          source={editingSource}
          onClose={() => setShowModal(false)}
          onSaved={handleRefresh}
        />
      )}
    </>
  )
}
