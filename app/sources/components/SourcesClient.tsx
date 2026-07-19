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

function buildChatGptRepairPrompt(source: Source, testResult?: TestResult): string {
  return `请作为信息源抓取调试工程师，专门排查下面这个信息源，持续调试直到给出可执行的修复方案。

项目：Franky779/ip-hot
信息源名称：${source.name}
网址：${source.url}
来源地区：${REGION_LABELS[source.region] || source.region}
行业分类：${source.section_title}
网站定位：${source.type}
抓取类型：${getFetchType(source) === 'rss' ? 'RSS' : '普通网页'}
自动抓取状态：${source.enabled ? '启用' : '停用'}
当前抓取配置：${source.method || '未配置'}
最近测试状态：${source.last_test_status || '未测试'}
最近测试错误：${testResult?.message || source.last_test_message || '暂无'}

请按以下顺序处理：
1. 实际访问并诊断网址、响应状态、重定向、反爬限制，以及RSS/XML或页面结构。
2. 判断正确抓取类型，并给出可直接使用的RSS地址或网页选择器配置。
3. 如果当前配置错误，明确列出需要修改的字段和新值。
4. 给出在ip-hot项目中的最小代码或配置修改方案及验证步骤。
5. 不要泛泛建议；每一步都围绕这个具体信息源，直到能够稳定抓取资讯。

如果你无法直接访问网站，请明确告诉我下一步需要提供哪一段响应、页面源码或错误日志。`
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
  const [repairNoticeId, setRepairNoticeId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<'test' | 'start' | 'stop' | null>(null)
  const [bulkProgress, setBulkProgress] = useState({ completed: 0, total: 0 })
  const [bulkNotice, setBulkNotice] = useState('')
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
    const res = await fetch('/api/sources', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      const updatedSources = data.sources || []
      setSources(updatedSources)
      window.dispatchEvent(new CustomEvent('sources-updated', { detail: updatedSources }))
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
      await handleRefresh()
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

  const handleTest = async (id: string, refresh = true): Promise<TestResult | null> => {
    if (testingIds.has(id)) return null
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
      const testResult: TestResult = {
        status: res.ok && result.ok ? 'success' : 'failed',
        message: result.message || result.error || (res.ok ? '测试完成' : '测试失败'),
      }
      setTestResults((previous) => ({ ...previous, [id]: testResult }))
      if (refresh) await handleRefresh()
      return testResult
    } catch {
      const testResult: TestResult = {
        status: 'failed',
        message: '网络请求失败，请稍后重试。',
      }
      setTestResults((previous) => ({ ...previous, [id]: testResult }))
      return testResult
    } finally {
      setTestingIds((previous) => {
        const next = new Set(previous)
        next.delete(id)
        return next
      })
    }
  }

  const handleTestAll = async () => {
    const targets = [...filteredSources]
    if (bulkAction || testingIds.size > 0 || targets.length === 0) return
    setBulkAction('test')
    setBulkNotice('')
    setBulkProgress({ completed: 0, total: targets.length })

    const queue = [...targets]
    let completed = 0
    let succeeded = 0
    const runWorker = async () => {
      while (queue.length > 0) {
        const source = queue.shift()
        if (!source) return
        const result = await handleTest(source.id, false)
        if (result?.status === 'success') succeeded += 1
        completed += 1
        setBulkProgress({ completed, total: targets.length })
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(5, targets.length) }, () => runWorker())
      )
      await handleRefresh()
      setBulkNotice(`批量测试完成：${succeeded} 条成功，${targets.length - succeeded} 条异常。`)
    } finally {
      setBulkAction(null)
    }
  }

  const handleStartAll = async () => {
    if (bulkAction) return
    const ids = sources
      .filter((source) => !source.enabled && source.last_test_status === 'success')
      .map((source) => source.id)
    if (ids.length === 0) {
      setBulkNotice('没有测试成功且待启动的信息源。')
      return
    }

    setBulkAction('start')
    setBulkNotice('')
    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      const res = await fetch('/api/admin/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ ids, enabled: true }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkNotice(`一键启动失败：${result.error || '未知错误'}`)
        return
      }
      await handleRefresh()
      setBulkNotice(`已启动 ${ids.length} 条测试成功的信息源。`)
    } catch {
      setBulkNotice('一键启动失败：网络请求失败，请稍后重试。')
    } finally {
      setBulkAction(null)
    }
  }

  const handleStopAll = async () => {
    if (bulkAction) return
    const ids = sources.filter((source) => source.enabled).map((source) => source.id)
    if (ids.length === 0) {
      setBulkNotice('当前没有已启用的信息源。')
      return
    }

    setBulkAction('stop')
    setBulkNotice('')
    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      const res = await fetch('/api/admin/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ ids, enabled: false }),
      })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkNotice(`一键停用失败：${result.error || '未知错误'}`)
        return
      }
      await handleRefresh()
      setBulkNotice(`已停用 ${ids.length} 条信息源。`)
    } catch {
      setBulkNotice('一键停用失败：网络请求失败，请稍后重试。')
    } finally {
      setBulkAction(null)
    }
  }

  const handleChatGptRepair = async (source: Source) => {
    const prompt = buildChatGptRepairPrompt(source, testResults[source.id])
    let copied = false
    try {
      await navigator.clipboard.writeText(prompt)
      copied = true
    } catch {}

    const chatUrl = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
    window.open(chatUrl, '_blank', 'noopener,noreferrer')
    setRepairNoticeId(source.id)
    window.setTimeout(() => setRepairNoticeId((current) => current === source.id ? null : current), 5000)

    if (!copied) {
      setTestResults((previous) => ({
        ...previous,
        [source.id]: {
          status: 'failed',
          message: '已打开 ChatGPT，但浏览器未允许复制诊断信息；如果没有自动填入，请重新点击并允许剪贴板权限。',
        },
      }))
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
            <button
              className="search-btn"
              onClick={handleTestAll}
              disabled={bulkAction !== null || testingIds.size > 0}
              style={{ background: '#2563eb' }}
              title="测试当前筛选结果"
            >
              {bulkAction === 'test'
                ? `测试中 ${bulkProgress.completed}/${bulkProgress.total}`
                : '一键测试当前筛选'}
            </button>
            <button
              className="search-btn"
              onClick={handleStartAll}
              disabled={bulkAction !== null}
              style={{ background: '#eab308', color: '#2d2200' }}
              title="启动全部测试成功且尚未启用的信息源"
            >
              {bulkAction === 'start' ? '启动中...' : '一键启动'}
            </button>
            <button
              className="search-btn"
              onClick={handleStopAll}
              disabled={bulkAction !== null}
              style={{ background: '#dc2626' }}
              title="停用全部已启用的信息源"
            >
              {bulkAction === 'stop' ? '停用中...' : '一键停用'}
            </button>
            {bulkNotice && (
              <span className="source-bulk-notice" role="status">{bulkNotice}</span>
            )}
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
                          disabled={testingIds.has(item.id) || bulkAction === 'test'}
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
                          className="article-action-btn source-repair-btn"
                          onClick={() => handleChatGptRepair(item)}
                          title="把该信息源的配置和错误交给 ChatGPT 调试"
                        >
                          ChatGPT 修复
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
                    {repairNoticeId === item.id && (
                      <div className="source-repair-notice">
                        已打开 ChatGPT，并复制了该来源的诊断资料；如未自动填入，请在对话框粘贴。
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
