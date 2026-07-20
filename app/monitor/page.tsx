'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAdmin } from '../components/AdminToggle'
import SourceQualityPanel, { type SourceQualityItem } from './SourceQualityPanel'

type SourceCoverageStatus = 'success' | 'empty' | 'failed' | 'running' | 'skipped' | 'pending' | 'overdue' | 'not_due' | 'manual' | 'paused'
type SourceCoverageRow = {
  sourceId: string; sourceName: string; sourceUrl: string
  executionMode: 'cloud' | 'local' | 'manual' | 'paused'
  scheduleTier: 'daily' | 'every_2_days' | 'weekly'
  status: SourceCoverageStatus; scheduledAt: string | null; nextScheduledAt: string | null
  lastRun: {
    status: string; started_at: string; discovered_count: number; fetched_count: number
    duplicate_count: number; inserted_count: number; error_message: string | null
  } | null
}
type SourceCoverage = {
  summary: { planned: number; completed: number; success: number; empty: number; failed: number; running: number; skipped: number; pending: number; overdue: number; notDue: number; excluded: number }
  rows: SourceCoverageRow[]
  nextBatches: Array<{ scheduledAt: string; sources: string[]; total: number }>
}

type MonitorData = {
  todayTask: {
    status: string; triggerType: string; startedAt: string; endedAt: string | null
    fetchTotal: number; inserted: number; llmPending: number; llmProcessed: number
    llmFailed: number; errorMessage: string | null
  } | null
  history: Array<{
    id: string; startedAt: string; triggerType: string; fetchTotal: number
    inserted: number; llmPending: number; llmProcessed: number; llmFailed: number
    status: string; errorMessage: string | null; elapsedSeconds: number | null
    details: { batch_total?: number; [key: string]: any } | null
  }>
  queue: number
  todayInserted: number
  llmWorker: {
    active: boolean; intervalMinutes: number; lastRunAt: string | null; lastStatus: string | null
    processed: number; failed: number; remaining: number; errorMessage: string | null
  }
  categoryStats: Array<{ category: string; count: number }>
  sourceQualityWindowDays?: number
  sourceQuality?: SourceQualityItem[]
  sourceCoverage?: SourceCoverage | null
  sourceCoverageError?: string | null
  reviewQueue?: Array<{
    id: string; titleCn: string; summaryCn: string; commentary: string
    relevanceScore: number; source: string; createdAt: string
  }>
}

type CronLog = {
  id: string
  started_at: string | null
  ended_at: string | null
  trigger_type: string | null
  fetch_total_fetched: number | null
  fetch_total_inserted: number | null
  llm_processed: number | null
  llm_pending: number | null
  llm_failed: number | null
  status: string
  details?: { batch_total?: number } | null
}

function getPw() { if (typeof window === 'undefined') return null; return localStorage.getItem('ip-hot-admin-pw') }
function formatTime(iso: string | null): string {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}
function getStatusColor(s: string) { return s === 'success' ? '#2e9d5a' : s === 'running' ? '#3b82f6' : s === 'error' ? '#e94560' : '#888' }
function getStatusLabel(s: string) { return s === 'success' ? '成功' : s === 'running' ? '运行中' : s === 'error' ? '失败' : s }
function getTriggerLabel(triggerType: string | null) {
  return triggerType === 'manual' ? '手动'
    : triggerType === 'manual_llm' ? '手动LLM'
      : triggerType === 'manual_source' ? '指定信源'
      : triggerType === 'source_add' ? '添加信源'
        : triggerType === 'source_delete' ? '删除信源'
          : '定时'
}
function getCoverageStatusLabel(status: SourceCoverageStatus) {
  return status === 'success' ? '抓取成功'
    : status === 'empty' ? '成功无新增'
      : status === 'failed' ? '抓取失败'
        : status === 'running' ? '抓取中'
          : status === 'skipped' ? '已跳过'
          : status === 'pending' ? '等待计划时间'
            : status === 'overdue' ? '逾期未抓'
              : status === 'not_due' ? '今天不需抓取'
                : status === 'manual' ? '人工处理'
                  : '已停用'
}
function getCoverageStatusColor(status: SourceCoverageStatus) {
  return status === 'success' || status === 'empty' ? '#2e9d5a'
    : status === 'failed' || status === 'overdue' ? '#e94560'
      : status === 'running' ? '#3b82f6'
        : '#888'
}
function getExecutionLabel(mode: SourceCoverageRow['executionMode']) {
  return mode === 'cloud' ? '云端'
    : mode === 'local' ? '本地 CDP'
      : mode === 'manual' ? '人工'
        : '停用'
}
function getTierLabel(tier: SourceCoverageRow['scheduleTier']) {
  return tier === 'daily' ? '每天' : tier === 'every_2_days' ? '每两天' : '每周'
}
function getLogLine(log: CronLog): string {
  const started = log.started_at ? new Date(log.started_at).toLocaleString('zh-CN') : '-'
  const duration = log.ended_at && log.started_at
    ? `${Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`
    : '-'
  const llmTotal = log.trigger_type === 'manual_llm'
    ? log.details?.batch_total ?? ((log.llm_processed ?? 0) + (log.llm_failed ?? 0) || '-')
    : log.llm_pending ?? 0
  return `${started} | ${getTriggerLabel(log.trigger_type)} | 抓取 ${log.fetch_total_fetched ?? 0} | 入库 ${log.fetch_total_inserted ?? 0} | LLM ${log.llm_processed ?? 0}/${llmTotal} | ${duration} | ${log.status}`
}

export default function MonitorPage() {
  const { loaded } = useAdmin()
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [llming, setLlming] = useState(false)
  const [llmProgress, setLlmProgress] = useState<{ processed: number; remaining: number; rounds: number } | null>(null)
  const stopLlmRef = useRef(false)
  const [logs, setLogs] = useState<CronLog[]>([])
  const [reviewing, setReviewing] = useState<Record<string, string>>({}) // articleId -> 'delete'|'select'
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set())
  const [qualityDays, setQualityDays] = useState<7 | 30 | 180 | 365>(7)

  const fetchData = useCallback(async () => {
    const pw = getPw(); if (!pw) return
    try {
      const res = await fetch(`/api/admin/monitor?qualityDays=${qualityDays}`, {
        cache: 'no-store',
        headers: { 'x-admin-password': pw },
      })
      if (res.ok) setData(await res.json())
    } catch {} finally { setLoading(false) }
  }, [qualityDays])

  const loadLogs = useCallback(async () => {
    const pw = getPw() || ''
    if (!pw) return
    try {
      const res = await fetch('/api/admin/cron-logs', { cache: 'no-store', headers: { 'x-admin-password': pw } })
      if (res.ok) setLogs((await res.json()).logs ?? [])
    } catch {}
  }, [])

  useEffect(() => {
    if (loaded) {
      fetchData()
      loadLogs()
    }
    const t = setInterval(() => {
      if (loaded) {
        fetchData()
        loadLogs()
      }
    }, 5000)
    return () => clearInterval(t)
  }, [loaded, fetchData, loadLogs])

  const handleManualFetch = async () => {
    if (!confirm('确定手动触发一次资讯抓取？')) return
    setFetching(true)
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/cron/fetch-and-process', { method: 'GET', headers: { 'x-admin-password': pw } })
      const resp = await res.json()
      alert(res.ok ? `抓取触发成功！` : '抓取失败: ' + (resp.error || '未知错误'))
      fetchData()
    } catch (e) { alert('请求失败: ' + (e instanceof Error ? e.message : String(e))) } finally { setFetching(false) }
  }

  const handleTriggerLlm = async () => {
    if (!data?.queue || data.queue === 0) { alert('暂无待处理文章'); return }
    if (!confirm(`确定运行 LLM 批量处理？当前队列: ${data.queue} 条。将自动循环处理直到清空。`)) return
    setLlming(true)
    stopLlmRef.current = false
    setLlmProgress({ processed: 0, remaining: data.queue, rounds: 0 })
    const pw = getPw() || ''
    let totalProcessed = 0
    let totalFailed = 0
    let totalRounds = 0
    let lastRemaining = data.queue
    let staleCount = 0

    try {
      while (!stopLlmRef.current) {
        const res = await fetch('/api/admin/process-llm', { method: 'POST', headers: { 'x-admin-password': pw } })
        const resp = await res.json()

        if (!resp.ok) {
          alert(`处理失败: ${resp.error || '未知错误'}`)
          break
        }

        totalProcessed += resp.processed ?? 0
        totalFailed += resp.failed ?? 0
        totalRounds++
        const remaining = resp.remaining ?? 0
        setLlmProgress({ processed: totalProcessed, remaining, rounds: totalRounds })

        if (remaining === 0) {
          const msg = totalFailed > 0
            ? `全部完成！共处理 ${totalProcessed} 条，失败 ${totalFailed} 条，${totalRounds} 轮`
            : `全部完成！共处理 ${totalProcessed} 条，${totalRounds} 轮`
          alert(msg)
          break
        }

        // 死循环保护：剩余数量连续 3 轮没有减少，说明删除/更新没生效，立即止损
        if (remaining >= lastRemaining) {
          staleCount++
          if (staleCount >= 3) {
            alert(`连续 ${staleCount} 轮剩余数量没有减少（当前剩余 ${remaining} 条），已自动停止，避免空转。请检查 Supabase 删除权限或联系开发。`)
            break
          }
        } else {
          staleCount = 0
        }
        lastRemaining = remaining

        // 如果本轮处理了0条且剩余>0，说明有问题，停止
        if ((resp.processed ?? 0) === 0 && (resp.failed ?? 0) === 0 && (resp.irrelevantDeleted ?? 0) === 0) {
          alert(`本轮未处理任何文章，剩余 ${remaining} 条。可能LLM配置有问题，请检查日志。`)
          break
        }

        // 如果超时了但还有剩余，继续下一轮
        if (resp.timedOut) {
          // 继续下一轮，API会自动接着处理
          await new Promise(r => setTimeout(r, 500)) // 短暂间隔避免请求过密
          continue
        }

        // 正常情况继续下一轮
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (e) {
      alert('请求失败: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setLlming(false)
      setLlmProgress(null)
      fetchData()
    }
  }

  const handleSelectedSourceFetch = async (sourceIds: string[], actionLabel: string) => {
    if (sourceIds.length === 0) return
    if (sourceIds.length > 24) {
      alert(`一次最多补抓 24 个信源；当前有 ${sourceIds.length} 个，请分批处理。`)
      return
    }
    if (!confirm(`确定${actionLabel} ${sourceIds.length} 个信源？抓取会同步执行，期间请保持本页打开。`)) return
    setFetching(true)
    const pw = getPw() || ''
    try {
      const query = sourceIds.map((id) => `sourceId=${encodeURIComponent(id)}`).join('&')
      const res = await fetch(`/api/cron/fetch-and-process?${query}`, { headers: { 'x-admin-password': pw } })
      const resp = await res.json()
      if (res.ok && resp.ok) {
        alert(`${actionLabel}完成：已处理 ${resp.fetch?.processedSources ?? sourceIds.length} 个信源。`)
      } else {
        alert(`${actionLabel}失败：${resp.error || '未知错误'}`)
      }
      await fetchData()
    } catch (error) {
      alert(`${actionLabel}失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setFetching(false)
    }
  }

  const handleStopLlm = () => {
    stopLlmRef.current = true
    setLlming(false)
    setLlmProgress(null)
  }

  // 待复核：删除
  const handleReviewDelete = async (id: string) => {
    setReviewing(p => ({ ...p, [id]: 'delete' }))
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setData((current) => current
          ? { ...current, reviewQueue: current.reviewQueue?.filter((article) => article.id !== id) }
          : current)
        setSelectedReviews((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        void fetchData()
      } else {
        const result = await res.json().catch(() => null)
        alert(result?.error || '删除失败')
      }
    } catch { alert('请求失败') } finally { setReviewing(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  // 待复核：标记为精选
  const handleReviewSelect = async (id: string) => {
    setReviewing(p => ({ ...p, [id]: 'select' }))
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id, is_selected: true }),
      })
      if (res.ok) {
        setData((current) => current
          ? { ...current, reviewQueue: current.reviewQueue?.filter((article) => article.id !== id) }
          : current)
        setSelectedReviews((current) => {
          const next = new Set(current)
          next.delete(id)
          return next
        })
        void fetchData()
      } else {
        const result = await res.json().catch(() => null)
        alert(result?.error || '标记失败')
      }
    } catch { alert('请求失败') } finally { setReviewing(p => { const n = { ...p }; delete n[id]; return n }) }
  }

  // 批量处理：删除（并行）
  const handleBatchDelete = async () => {
    const ids = Array.from(selectedReviews)
    if (ids.length === 0) { alert('请先勾选文章'); return }
    if (!confirm(`确定批量删除 ${ids.length} 条资讯？`)) return
    const pw = getPw() || ''

    // 整批用 /api/admin/delete-batch 一个请求搞定
    try {
      const res = await fetch('/api/admin/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ ids }),
      })
      const resp = await res.json()
      if (resp.ok) {
        alert(`批量删除完成：${resp.deleted ?? ids.length} 条`)
      } else {
        alert(`批量删除失败：${resp.error || '未知错误'}`)
      }
    } catch { alert('请求失败') }
    setSelectedReviews(new Set())
    fetchData()
  }

  // 批量处理：精选（并行）
  const handleBatchSelect = async () => {
    const ids = Array.from(selectedReviews)
    if (ids.length === 0) { alert('请先勾选文章'); return }
    if (!confirm(`确定批量标记 ${ids.length} 条为精选？`)) return
    const pw = getPw() || ''
    const results = await Promise.all(ids.map((id) =>
      fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id, is_selected: true }),
      }).then((r) => r.ok).catch(() => false)
    ))
    const ok = results.filter(Boolean).length
    const fail = results.length - ok
    setSelectedReviews(new Set())
    alert(`批量精选完成：成功 ${ok} 条，失败 ${fail} 条`)
    fetchData()
  }

  const task = data?.todayTask
  const coverage = data?.sourceCoverage
  const missedCloudSourceIds = coverage?.rows
    .filter((row) => row.executionMode === 'cloud' && (row.status === 'failed' || row.status === 'overdue'))
    .map((row) => row.sourceId) ?? []
  const allCats = ['创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺', '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化', '政策规则', '版权保护', '待分类']
  const catMap = new Map((data?.categoryStats || []).map(c => [c.category, c.count]))

  return (
    <>
      <header className="page-header">
        <div className="page-toolbar" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
          <Link href="/" className="sidebar-link" style={{ padding: '0.5rem', width: 'auto' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </Link>
          <h1 className="page-title font-serif" style={{ margin: 0 }}>运营监控</h1>
        </div>
      </header>

      <section className="article-section">
        {loading ? <p className="empty-state">加载中…</p> : !data ? <p className="empty-state">加载失败，请确认已登录管理员。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* 统计卡片 */}
            <div className="monitor-stats-grid">
              <div className="monitor-stat-card">
                <div className="status-dot" style={{ background: task ? getStatusColor(task.status) : '#888' }} />
                <div className="monitor-stat-value">{task ? getStatusLabel(task.status) : '无记录'}</div>
                <div className="monitor-stat-label">今日任务状态</div>
                {task && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{formatTime(task.startedAt)}{task.triggerType === 'manual' && ' · 手动触发'}</div>}
              </div>
              <div className="monitor-stat-card">
                <div className="monitor-stat-value" style={{ color: 'var(--accent)' }}>{data.todayInserted}</div>
                <div className="monitor-stat-label">今日入库</div>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <button className="monitor-action-btn" onClick={handleManualFetch} disabled={fetching}>{fetching ? '抓取中…' : '手动抓取'}</button>
                </div>
              </div>
              <div className="monitor-stat-card">
                <div className="monitor-stat-value" style={{ color: '#f59e0b' }}>{data.queue}</div>
                <div className="monitor-stat-label">LLM 待处理</div>
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {llming ? (
                    <>
                      <button className="monitor-action-btn" onClick={handleStopLlm} style={{ color: '#e94560', borderColor: '#e94560' }}>停止处理</button>
                      {llmProgress && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          已处理 {llmProgress.processed} 条 · 剩余 {llmProgress.remaining} 条 · 第 {llmProgress.rounds} 轮
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <button className="monitor-action-btn" onClick={handleTriggerLlm}>手动处理LLM</button>
                      <span
                        className="monitor-action-btn"
                        style={{
                          borderColor: data.llmWorker.active ? '#2e9d5a' : '#f59e0b',
                          color: data.llmWorker.active ? '#2e9d5a' : '#f59e0b',
                        }}
                        title="后台守护任务运行，不依赖当前浏览器页面"
                      >
                        {data.llmWorker.active ? '后台自动 ON' : '后台等待心跳'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        每 {data.llmWorker.intervalMinutes} 分钟检查
                        {data.llmWorker.lastRunAt ? ` · 最近 ${formatTime(data.llmWorker.lastRunAt)}` : ' · 尚未运行'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <h2 className="monitor-section-title" style={{ margin: 0 }}>今日信源抓取覆盖</h2>
                {coverage && missedCloudSourceIds.length > 0 && (
                  <button className="monitor-action-btn" onClick={() => handleSelectedSourceFetch(missedCloudSourceIds, '补抓今日遗漏')} disabled={fetching}>
                    补抓今日遗漏（{missedCloudSourceIds.length}）
                  </button>
                )}
              </div>
              {data?.sourceCoverageError ? (
                <p className="empty-state">抓取审计查询失败：{data.sourceCoverageError}</p>
              ) : !coverage ? (
                <p className="empty-state">正在读取信源覆盖情况…</p>
              ) : (
                <>
                  <div className="monitor-category-grid" style={{ marginBottom: '1rem' }}>
                    <div className="monitor-category-card"><span>今日应抓</span><strong>{coverage.summary.planned}</strong></div>
                    <div className="monitor-category-card"><span>已覆盖</span><strong>{coverage.summary.completed}</strong></div>
                    <div className="monitor-category-card"><span>成功无新增</span><strong>{coverage.summary.empty}</strong></div>
                    <div className="monitor-category-card"><span>失败待补</span><strong>{coverage.summary.failed}</strong></div>
                    <div className="monitor-category-card"><span>逾期未抓</span><strong>{coverage.summary.overdue}</strong></div>
                    <div className="monitor-category-card"><span>今日不需/豁免</span><strong>{coverage.summary.excluded}</strong></div>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 className="monitor-section-title" style={{ fontSize: '0.9375rem' }}>下一批计划</h3>
                    {coverage.nextBatches.length === 0 ? <p className="empty-state">没有后续自动批次。</p> : (
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {coverage.nextBatches.map((batch) => (
                          <div key={batch.scheduledAt} className="monitor-category-card" style={{ minWidth: '14rem', textAlign: 'left' }}>
                            <strong style={{ fontSize: '0.875rem' }}>{formatTime(batch.scheduledAt)} · {batch.total} 个来源</strong>
                            <span style={{ display: 'block', marginTop: '0.25rem' }}>{batch.sources.join('、')}{batch.total > batch.sources.length ? '…' : ''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                      <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.5rem' }}>来源</th><th style={{ padding: '0.5rem' }}>方式/频率</th><th style={{ padding: '0.5rem' }}>今天状态</th><th style={{ padding: '0.5rem' }}>计划/下次</th><th style={{ padding: '0.5rem' }}>发现/有效/重复/入库</th><th style={{ padding: '0.5rem' }}>操作</th>
                      </tr></thead>
                      <tbody>{coverage.rows.map((row) => (
                        <tr key={row.sourceId} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.625rem 0.5rem' }}><a href={row.sourceUrl} target="_blank" rel="noreferrer">{row.sourceName}</a>{row.lastRun?.error_message && <div style={{ color: '#e94560', marginTop: '0.25rem' }}>{row.lastRun.error_message}</div>}</td>
                          <td style={{ padding: '0.625rem 0.5rem' }}>{getExecutionLabel(row.executionMode)} · {getTierLabel(row.scheduleTier)}</td>
                          <td style={{ padding: '0.625rem 0.5rem', color: getCoverageStatusColor(row.status) }}>{getCoverageStatusLabel(row.status)}</td>
                          <td style={{ padding: '0.625rem 0.5rem' }}>{row.scheduledAt ? `今日 ${formatTime(row.scheduledAt)}` : '-'}<br /><span style={{ color: 'var(--text-muted)' }}>{row.nextScheduledAt ? `下次 ${formatTime(row.nextScheduledAt)}` : '-'}</span></td>
                          <td style={{ padding: '0.625rem 0.5rem' }}>{row.lastRun ? `${row.lastRun.discovered_count} / ${row.lastRun.fetched_count} / ${row.lastRun.duplicate_count} / ${row.lastRun.inserted_count}` : '-'}</td>
                          <td style={{ padding: '0.625rem 0.5rem' }}>{row.executionMode === 'cloud' && row.status !== 'running' && <button className="monitor-action-btn" onClick={() => handleSelectedSourceFetch([row.sourceId], row.status === 'success' || row.status === 'empty' ? '提前重抓' : '手动补抓')} disabled={fetching}>抓取此来源</button>}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            {/* 分类资讯数量统计 */}
            <div>
              <h2 className="monitor-section-title">分类资讯数量统计</h2>
              {data.categoryStats.length === 0 ? <p className="empty-state">暂无数据</p> : (
                <div className="monitor-category-grid">
                  {allCats.map(cat => (
                    <div key={cat} className="monitor-category-card">
                      <span>{cat}</span>
                      <strong>{catMap.get(cat) || 0}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 实时日志 */}
            <div>
              <h2 className="monitor-section-title">实时任务日志</h2>
              <pre className="cron-logs-code" aria-live="polite">
                {logs.length === 0 ? '暂无日志' : logs.slice(0, 12).map(getLogLine).join('\n')}
              </pre>
            </div>

            <SourceQualityPanel
              items={data.sourceQuality ?? []}
              days={qualityDays}
              onDaysChange={setQualityDays}
              onRefresh={fetchData}
            />

            {/* 待人工复核队列 */}
            {data.reviewQueue && data.reviewQueue.length > 0 && (
              <div>
                <h2 className="monitor-section-title" style={{ color: '#f59e0b' }}>待人工复核 · {data.reviewQueue.length}</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  评分 4-6 且仍为待分类的边界资讯。系统会先按约束条件自动处理；这里只保留少量需要人工裁决的异常项。
                </p>
                {/* 批量操作工具栏 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedReviews.size === (data.reviewQueue?.length ?? 0) && (data.reviewQueue?.length ?? 0) > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedReviews(new Set((data.reviewQueue ?? []).map(r => r.id)))
                        } else {
                          setSelectedReviews(new Set())
                        }
                      }}
                    />
                    全选
                  </label>
                  {selectedReviews.size > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>已选 {selectedReviews.size} 条</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                    <button
                      className="monitor-action-btn"
                      style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }}
                      onClick={handleBatchDelete}
                      disabled={selectedReviews.size === 0}
                    >
                      批量删除
                    </button>
                    <button
                      className="monitor-action-btn"
                      style={{ fontSize: '0.6875rem' }}
                      onClick={handleBatchSelect}
                      disabled={selectedReviews.size === 0}
                    >
                      批量精选
                    </button>
                  </div>
                </div>
                <div className="review-queue-grid">
                  {data.reviewQueue.map(r => (
                    <div key={r.id} className="review-queue-card">
                      <div className="review-queue-main">
                        <input
                          type="checkbox"
                          checked={selectedReviews.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selectedReviews)
                            if (e.target.checked) next.add(r.id)
                            else next.delete(r.id)
                            setSelectedReviews(next)
                          }}
                        />
                        <div className="review-queue-body">
                          <div className="review-queue-head">
                            <div className="review-queue-title">{r.titleCn}</div>
                            <span className="review-score">评分 {r.relevanceScore}</span>
                          </div>
                          <div className="review-queue-summary">{r.summaryCn}</div>
                          {r.commentary && (
                            <div className="review-queue-commentary">
                              推荐理由：{r.commentary}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="review-queue-footer">
                        <span>{r.source} · {formatTime(r.createdAt)}</span>
                        <div className="review-actions">
                          <button
                            className="monitor-action-btn"
                            style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }}
                            onClick={() => handleReviewDelete(r.id)}
                            disabled={reviewing[r.id] === 'delete'}
                          >
                            {reviewing[r.id] === 'delete' ? '删除中…' : '删除'}
                          </button>
                          <button
                            className="monitor-action-btn"
                            style={{ fontSize: '0.6875rem' }}
                            onClick={() => handleReviewSelect(r.id)}
                            disabled={reviewing[r.id] === 'select'}
                          >
                            {reviewing[r.id] === 'select' ? '标记中…' : '精选'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </section>
    </>
  )
}
