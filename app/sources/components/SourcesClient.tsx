'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAdmin } from '@/app/components/AdminToggle'
import { SourceModal } from './SourceModal'
import { EXECUTION_MODE_LABELS, getNextScheduledAt, getSourceSchedule, getSourceToggleAction, SCHEDULE_TIER_LABELS } from '@/lib/source-schedule'
import {
  SOURCE_HEALTH_FILTER_OPTIONS,
  SOURCE_HEALTH_OPTIONS,
  type SourceHealthRow,
  type SourceHealthStatus,
} from '@/lib/source-health'
import { resolveHealthFilterValue, summarizeSourceHealth } from '@/lib/source-health-summary'
import { FETCH_TYPE_OPTIONS, REGION_LABELS, REGION_OPTIONS } from '@/lib/source-options'

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

type SourceFetchNotice = {
  status: 'success' | 'failed'
  message: string
}

type CopyNotice = {
  sourceId: string
  status: 'success' | 'failed'
}

const SOURCE_HEALTH_LABELS = Object.fromEntries(
  SOURCE_HEALTH_OPTIONS.map((option) => [option.value, option.label])
) as Record<SourceHealthStatus, string>

function buildSourceRepairDetails(source: Source, testResult?: TestResult): string {
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
    if (sec.region === 'domestic') continue
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
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set())
  const [fetchNotices, setFetchNotices] = useState<Record<string, SourceFetchNotice>>({})
  const [copyNotice, setCopyNotice] = useState<CopyNotice | null>(null)
  const [bulkAction, setBulkAction] = useState<'test' | 'start' | 'stop' | 'fetch' | null>(null)
  const [bulkProgress, setBulkProgress] = useState({ completed: 0, total: 0 })
  const [bulkNotice, setBulkNotice] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [keyword, setKeyword] = useState('')
  const [regionFilter, setRegionFilter] = useState('all')
  const [testStatusFilter, setTestStatusFilter] = useState('all')
  const [fetchTypeFilter, setFetchTypeFilter] = useState('all')
  const [executionModeFilter, setExecutionModeFilter] = useState('all')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [healthRows, setHealthRows] = useState<SourceHealthRow[] | null>(null)

  const refreshHealth = useCallback(async () => {
    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    if (!pw) return
    try {
      const res = await fetch('/api/admin/source-health', {
        cache: 'no-store',
        headers: { 'x-admin-password': pw },
      })
      if (!res.ok) return
      const data = await res.json()
      const rows = (data.health || []) as SourceHealthRow[]
      setHealthRows(rows)
      window.dispatchEvent(new CustomEvent('sources-health-updated', { detail: rows }))
    } catch {}
  }, [])

  const healthBySource = useMemo(
    () => Object.fromEntries((healthRows ?? []).map((row) => [row.sourceId, row])),
    [healthRows]
  )
  const healthSummary = useMemo(
    () => summarizeSourceHealth(sources, healthRows),
    [sources, healthRows]
  )

  useEffect(() => {
    if (!loaded || !isAdmin) return
    void refreshHealth()
    const interval = window.setInterval(refreshHealth, 30_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshHealth()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [isAdmin, loaded, refreshHealth])

  const sectionOptions = Array.from(
    sources.reduce((options, source) => {
      const current = options.get(source.section_id)
      options.set(source.section_id, {
        title: source.section_title,
        count: (current?.count || 0) + 1,
      })
      return options
    }, new Map<string, { title: string; count: number }>()).entries()
  )
  const sectionOptionList = sectionOptions.map(([id, section]) => ({
    id,
    title: section.title,
  }))
  const normalizedKeyword = keyword.trim().toLowerCase()
  const testStatusCounts = {
    success: sources.filter((source) => source.last_test_status === 'success').length,
    failed: sources.filter((source) => source.last_test_status === 'failed').length,
  }
  const untestedCount = sources.length - testStatusCounts.success - testStatusCounts.failed
  const filteredSources = sources.filter((source) => {
    const matchesKeyword = !normalizedKeyword || [
      source.name, source.url, source.type, source.description, source.method,
    ].some((value) => value?.toLowerCase().includes(normalizedKeyword))
    const matchesRegion = regionFilter === 'all' || source.region === regionFilter
    const matchesTestStatus = testStatusFilter === 'all'
      || (testStatusFilter === 'untested'
        ? source.last_test_status !== 'success' && source.last_test_status !== 'failed'
        : source.last_test_status === testStatusFilter)
    const matchesFetchType = fetchTypeFilter === 'all' || getFetchType(source) === fetchTypeFilter
    const matchesExecutionMode = executionModeFilter === 'all'
      || getSourceSchedule(source).executionMode === executionModeFilter
    const matchesSection = sectionFilter === 'all' || source.section_id === sectionFilter
    const matchesStatus = statusFilter === 'all'
      || (healthSummary.available
        && resolveHealthFilterValue(source, healthBySource[source.id]) === statusFilter)
    return matchesKeyword && matchesRegion && matchesTestStatus && matchesFetchType && matchesExecutionMode && matchesSection && matchesStatus
  })
  const hasFilters = keyword !== '' || regionFilter !== 'all' || testStatusFilter !== 'all' || fetchTypeFilter !== 'all'
    || executionModeFilter !== 'all' || sectionFilter !== 'all' || statusFilter !== 'all'
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
    const [res] = await Promise.all([
      fetch('/api/sources', { cache: 'no-store' }),
      refreshHealth(),
    ])
    if (res.ok) {
      const data = await res.json()
      const updatedSources = data.sources || []
      setSources(updatedSources)
      window.dispatchEvent(new CustomEvent('sources-updated', { detail: updatedSources }))
    }
  }, [refreshHealth])

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

  const handleToggleSource = async (source: Source) => {
    const action = getSourceToggleAction(source)
    if (action === 'pause') {
      return updateSource(source.id, { enabled: false })
    }

    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    const response = await fetch('/api/admin/source-quality/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
      body: JSON.stringify({ sourceId: source.id, action: 'resume' }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      alert('恢复自动失败: ' + (result.error || '未知错误'))
      return false
    }
    await handleRefresh()
    return true
  }

  const handleTest = async (id: string, refresh = true, signal?: AbortSignal): Promise<TestResult | null> => {
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
        signal,
      })
      const result = await res.json().catch(() => ({}))
      const testResult: TestResult = {
        status: res.ok && result.ok ? 'success' : 'failed',
        message: result.message || result.error || (res.ok ? '测试完成' : '测试失败'),
      }
      setTestResults((previous) => ({ ...previous, [id]: testResult }))
      if (refresh) await handleRefresh()
      return testResult
    } catch (error: any) {
      if (error?.name === 'AbortError') return null
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

  const handleFetchSource = async (source: Source) => {
    if (fetchingIds.has(source.id)) return
    if (!confirm(`确定只抓取“${source.name}”，并将新资讯加入 LLM 处理队列？`)) return

    setFetchingIds((previous) => new Set(previous).add(source.id))
    setFetchNotices((previous) => {
      const next = { ...previous }
      delete next[source.id]
      return next
    })

    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      const query = new URLSearchParams({ sourceId: source.id, enqueueOnly: '1' })
      const response = await fetch(`/api/cron/fetch-and-process?${query}`, {
        headers: { 'x-admin-password': pw },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '抓取失败')
      }

      const result = payload.fetch?.results?.[0]
      const discovered = result?.discovered ?? 0
      const inserted = result?.inserted ?? 0
      const duplicates = result?.duplicates ?? 0
      const blocked = result?.blocked ?? 0
      const dead = result?.dead ?? 0
      const message = result?.error
        ? `抓取失败：${result.error}`
        : `抓取完成：发现 ${discovered} 条，新增 ${inserted} 条，重复 ${duplicates} 条，过滤 ${blocked + dead} 条；${inserted} 条已加入 LLM 队列。`
      setFetchNotices((previous) => ({
        ...previous,
        [source.id]: { status: result?.error ? 'failed' : 'success', message },
      }))
    } catch (error) {
      setFetchNotices((previous) => ({
        ...previous,
        [source.id]: {
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    } finally {
      await refreshHealth()
      setFetchingIds((previous) => {
        const next = new Set(previous)
        next.delete(source.id)
        return next
      })
    }
  }

  const handleTestAll = async () => {
    // 二次点击 = 取消
    if (bulkAction === 'test') {
      abortRef.current?.abort()
      setBulkNotice('已取消批量测试。')
      setBulkAction(null)
      return
    }
    if (bulkAction || testingIds.size > 0) return

    const targets = [...filteredSources]
    if (targets.length === 0) {
      setBulkNotice('当前筛选结果为空，没有可测试的信息源。')
      return
    }
    if (!confirm(`将对当前筛选的 ${targets.length} 条信息源执行批量测试。确定继续吗？`)) return

    const controller = new AbortController()
    abortRef.current = controller
    setBulkAction('test')
    setBulkNotice('')
    setBulkProgress({ completed: 0, total: targets.length })

    const queue = [...targets]
    let completed = 0
    let succeeded = 0
    const runWorker = async () => {
      while (queue.length > 0) {
        if (controller.signal.aborted) return
        const source = queue.shift()
        if (!source) return
        const result = await handleTest(source.id, false, controller.signal)
        if (controller.signal.aborted) return
        if (result?.status === 'success') succeeded += 1
        completed += 1
        setBulkProgress({ completed, total: targets.length })
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(5, targets.length) }, () => runWorker())
      )
      if (!controller.signal.aborted) {
        await handleRefresh()
        setBulkNotice(`批量测试完成：${succeeded} 条成功，${targets.length - succeeded} 条异常；失败测试会自动停用来源。`)
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBulkAction(null)
    }
  }

  const handleStartAll = async () => {
    if (bulkAction === 'start') {
      abortRef.current?.abort()
      setBulkNotice('已取消一键启动。')
      setBulkAction(null)
      return
    }
    if (bulkAction) return

    const targets = filteredSources.filter((source) => (
      getSourceSchedule(source).executionMode === 'paused' && source.last_test_status === 'success'
    ))
    if (targets.length === 0) {
      setBulkNotice('当前筛选结果中没有测试成功且待启动的信息源。')
      return
    }
    if (!confirm(`将恢复当前筛选结果中 ${targets.length} 条测试成功且暂停的信息源。确定继续吗？`)) return

    const controller = new AbortController()
    abortRef.current = controller
    setBulkAction('start')
    setBulkNotice('')
    setBulkProgress({ completed: 0, total: targets.length })

    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      let completed = 0
      let failed = 0
      const results: Response[] = []
      for (const source of targets) {
        if (controller.signal.aborted) break
        const res = await fetch('/api/admin/source-quality/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
          body: JSON.stringify({ sourceId: source.id, action: 'resume' }),
          signal: controller.signal,
        })
        results.push(res)
        if (!res.ok) failed += 1
        completed += 1
        setBulkProgress({ completed, total: targets.length })
      }
      if (!controller.signal.aborted) {
        await handleRefresh()
        setBulkNotice(failed > 0
          ? `已恢复 ${targets.length - failed} 条，${failed} 条恢复失败。`
          : `已恢复 ${targets.length} 条信息源，并修复其运行方式。`)
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setBulkNotice('一键启动失败：网络请求失败，请稍后重试。')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBulkAction(null)
    }
  }

  const handleStopAll = async () => {
    if (bulkAction === 'stop') {
      abortRef.current?.abort()
      setBulkNotice('已取消一键停用。')
      setBulkAction(null)
      return
    }
    if (bulkAction) return

    const targets = filteredSources
      .filter((source) => ['cloud', 'local'].includes(getSourceSchedule(source).executionMode))
    const ids = targets.map((source) => source.id)
    if (ids.length === 0) {
      setBulkNotice('当前筛选结果中没有云端或本地自动来源。')
      return
    }
    if (!confirm(`将停用当前筛选结果中 ${ids.length} 条云端或本地自动来源；人工来源不会被处理。确定继续吗？`)) return

    const controller = new AbortController()
    abortRef.current = controller
    setBulkAction('stop')
    setBulkNotice('')

    try {
      const pw = localStorage.getItem('ip-hot-admin-pw') || ''
      const res = await fetch('/api/admin/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ ids, enabled: false }),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const result = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkNotice(`一键停用失败：${result.error || '未知错误'}`)
        return
      }
      await handleRefresh()
      setBulkNotice(`已停用 ${ids.length} 条信息源。`)
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setBulkNotice('一键停用失败：网络请求失败，请稍后重试。')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBulkAction(null)
    }
  }

  const handleCopyRepairDetails = async (source: Source) => {
    const details = buildSourceRepairDetails(source, testResults[source.id])
    let status: CopyNotice['status'] = 'success'
    try {
      await navigator.clipboard.writeText(details)
    } catch {
      status = 'failed'
    }

    const notice = { sourceId: source.id, status }
    setCopyNotice(notice)
    window.setTimeout(() => setCopyNotice((current) => current === notice ? null : current), 5000)
  }

  const handleFetchAll = async () => {
    if (bulkAction === 'fetch') {
      abortRef.current?.abort()
      setBulkNotice('已取消一键抓取。')
      setBulkAction(null)
      return
    }
    if (bulkAction) return

    const targets = filteredSources.filter((source) => source.enabled)
    if (targets.length === 0) {
      setBulkNotice('当前筛选结果中没有已启用的信息源。')
      return
    }
    if (!confirm(`将对当前筛选结果中 ${targets.length} 条已启用的信息源执行全面抓取。确定继续吗？`)) return

    const controller = new AbortController()
    abortRef.current = controller
    setBulkAction('fetch')
    setBulkNotice('')
    setBulkProgress({ completed: 0, total: 0 })

    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const pollProgress = async () => {
      if (controller.signal.aborted) return
      try {
        const res = await fetch('/api/admin/cron-logs', {
          headers: { 'x-admin-password': pw },
          signal: controller.signal,
        })
        if (!res.ok) return
        const { logs } = await res.json()
        type FetchStageDetail = { stage?: string; sourcesCompleted?: number; totalSources?: number }
        const run = (logs as Array<{ details?: FetchStageDetail }> | null)?.find(
          (l) => l?.details?.stage === 'fetch'
        )
        if (run?.details) {
          setBulkProgress({
            completed: run.details.sourcesCompleted ?? 0,
            total: run.details.totalSources ?? 0,
          })
        }
      } catch {
        // 轮询失败忽略，抓取结果仍以主请求为准
      }
    }
    pollTimer = setInterval(pollProgress, 2000)

    try {
      const response = await fetch('/api/cron/fetch-and-process', {
        headers: { 'x-admin-password': pw },
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || '抓取失败')
      }
      const total = payload.fetch?.results?.length ?? 0
      const totalInserted = payload.fetch?.results?.reduce(
        (sum: number, r: any) => sum + (r?.inserted ?? 0), 0
      ) ?? 0
      await handleRefresh()
      setBulkNotice(`一键抓取完成：共处理 ${total} 条信息源，新增 ${totalInserted} 条资讯，已加入 LLM 处理队列。`)
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        setBulkNotice(`一键抓取失败：${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (pollTimer) clearInterval(pollTimer)
      if (abortRef.current === controller) abortRef.current = null
      setBulkAction(null)
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
                {REGION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>测试状态</span>
              <select value={testStatusFilter} onChange={(event) => setTestStatusFilter(event.target.value)}>
                <option value="all">{sources.length} 条 · 全部状态</option>
                <option value="success">{testStatusCounts.success} 条 · 成功</option>
                <option value="failed">{testStatusCounts.failed} 条 · 失败</option>
                <option value="untested">{untestedCount} 条 · 未测试</option>
              </select>
            </label>
            <label>
              <span>抓取类型</span>
              <select value={fetchTypeFilter} onChange={(event) => setFetchTypeFilter(event.target.value)}>
                <option value="all">全部类型</option>
                {FETCH_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>运行方式</span>
              <select value={executionModeFilter} onChange={(event) => setExecutionModeFilter(event.target.value)}>
                <option value="all">全部方式</option>
                {(Object.entries(EXECUTION_MODE_LABELS) as Array<[string, string]>).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>行业类型</span>
              <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
                <option value="all">{sources.length} 条 · 全部行业</option>
                {sectionOptions.map(([id, section]) => (
                  <option key={id} value={id}>{section.count} 条 · {section.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>抓取健康</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">{sources.length} 条 · 全部状态</option>
                {SOURCE_HEALTH_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {healthSummary.byOptionValue[option.value]} 条 · {option.label}
                  </option>
                ))}
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
                  setTestStatusFilter('all')
                  setFetchTypeFilter('all')
                  setExecutionModeFilter('all')
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
              disabled={(bulkAction !== null && bulkAction !== 'test') || testingIds.size > 0}
              style={{ background: '#2563eb' }}
              title={bulkAction === 'test' ? '再次点击取消' : '测试失败会自动停用来源；操作当前筛选结果'}
            >
              {bulkAction === 'test'
                ? `测试中 ${bulkProgress.completed}/${bulkProgress.total}`
                : '一键测试当前筛选'}
            </button>
            <button
              className="search-btn"
              onClick={handleStartAll}
              disabled={bulkAction !== null && bulkAction !== 'start'}
              style={{ background: '#eab308', color: '#2d2200' }}
              title={bulkAction === 'start' ? '再次点击取消' : '恢复当前筛选结果中测试成功且暂停的信息源'}
            >
              {bulkAction === 'start'
                ? `启动中 ${bulkProgress.completed}/${bulkProgress.total}`
                : '一键启动'}
            </button>
            <button
              className="search-btn"
              onClick={handleFetchAll}
              disabled={bulkAction !== null && bulkAction !== 'fetch'}
              style={{ background: '#8b5cf6' }}
              title={bulkAction === 'fetch' ? '再次点击取消' : '对当前筛选结果中已启用的信息源执行全面抓取'}
            >
              {bulkAction === 'fetch'
                ? bulkProgress.total > 0
                  ? `抓取中 ${bulkProgress.completed}/${bulkProgress.total}`
                  : '抓取中...'
                : '一键抓取'}
            </button>
            <button
              className="search-btn"
              onClick={handleStopAll}
              disabled={bulkAction !== null && bulkAction !== 'stop'}
              style={{ background: '#dc2626' }}
              title={bulkAction === 'stop' ? '再次点击取消' : '停用当前筛选结果中云端或本地自动来源'}
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
                    {(() => {
                      const schedule = getSourceSchedule(item)
                      const nextRun = getNextScheduledAt(item)
                      return (
                        <div className="source-schedule-grid">
                          <span>运行：{EXECUTION_MODE_LABELS[schedule.executionMode]}</span>
                          <span>频率：{schedule.executionMode === 'paused' ? '不参与自动任务' : schedule.executionMode === 'manual' ? '按需人工处理' : SCHEDULE_TIER_LABELS[schedule.tier]}</span>
                          <span>{nextRun ? `下次：${nextRun.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}` : '下次：—'}</span>
                          <span>测试：{item.last_test_status === 'success' ? '最近测试成功' : item.last_test_status === 'failed' ? '最近测试失败（失败会停用）' : '尚未测试'}</span>
                        </div>
                      )
                    })()}
                    {healthBySource[item.id] && healthBySource[item.id].status !== 'healthy' && (
                      <div className={`source-health-note ${healthBySource[item.id].status}`}>
                        <strong>{SOURCE_HEALTH_LABELS[healthBySource[item.id].status]}</strong>
                        <span>{healthBySource[item.id].reason}</span>
                      </div>
                    )}
                    {item.description && (
                      <p className="source-desc">{item.description}</p>
                    )}
                    {loaded && isAdmin && (
                      <div className="source-actions">
                        <button
                          className="article-action-btn edit"
                          onClick={() => handleToggleSource(item)}
                        >
                          {getSourceToggleAction(item) === 'resume' ? '恢复自动' : '停用自动'}
                        </button>
                        <button
                          className="article-action-btn edit"
                          onClick={() => handleTest(item.id)}
                          disabled={testingIds.has(item.id) || bulkAction === 'test'}
                        >
                          {testingIds.has(item.id) ? '测试中...' : '测试'}
                        </button>
                        <button
                          className="article-action-btn source-repair-btn"
                          onClick={() => handleFetchSource(item)}
                          disabled={fetchingIds.has(item.id)}
                        >
                          {fetchingIds.has(item.id) ? '抓取中...' : '抓取'}
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
                          onClick={() => handleCopyRepairDetails(item)}
                          title="复制该信息源的配置和最近错误"
                        >
                          复制配置和错误
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
                    {fetchNotices[item.id] && (
                      <div className="source-repair-notice" role="status">
                        {fetchNotices[item.id].message}
                      </div>
                    )}
                    {copyNotice?.sourceId === item.id && (
                      <div
                        className={copyNotice.status === 'success' ? 'source-repair-notice' : 'source-test-result failed'}
                        role="status"
                      >
                        {copyNotice.status === 'success'
                          ? '配置和错误信息已复制，可以直接粘贴。'
                          : '复制失败：浏览器未允许访问剪贴板，请允许剪贴板权限后重试。'}
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
          sectionOptions={sectionOptionList}
          onClose={() => setShowModal(false)}
          onSaved={handleRefresh}
        />
      )}
    </>
  )
}
