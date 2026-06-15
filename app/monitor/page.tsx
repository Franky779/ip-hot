'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useAdmin } from '../components/AdminToggle'

type SourceItem = {
  name: string
  url: string
  id: string
  lastActive?: string
  count7d?: number
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
  failedSources: number
  deadSources: number
  activeSources: number
  deadSourceList: SourceItem[]
  failedSourceList: SourceItem[]
  activeSourceList: SourceItem[]
  categoryStats: Array<{ category: string; count: number }>
  recentErrors: Array<{ id: string; startedAt: string; status: string; errorMessage: string | null }>
  sourceQuality?: Array<{ name: string; total: number; low: number; rate: number }>
  reviewQueue?: Array<{
    id: string; titleCn: string; summaryCn: string; commentary: string
    relevanceScore: number; source: string; createdAt: string
  }>
}

function getPw() { if (typeof window === 'undefined') return null; return localStorage.getItem('ip-hot-admin-pw') }
function formatTime(iso: string | null): string {
  if (!iso) return '-'
  try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return iso }
}
function getStatusColor(s: string) { return s === 'success' ? '#2e9d5a' : s === 'running' ? '#3b82f6' : s === 'error' ? '#e94560' : '#888' }
function getStatusLabel(s: string) { return s === 'success' ? '成功' : s === 'running' ? '运行中' : s === 'error' ? '失败' : s }
function getHealthColor(lastActive: string | null): string {
  if (!lastActive) return '#e94560'
  return (Date.now() - new Date(lastActive).getTime()) / 36e5 < 24 ? '#2e9d5a' : (Date.now() - new Date(lastActive).getTime()) / 36e5 < 72 ? '#f59e0b' : '#e94560'
}
function getHealthLabel(lastActive: string | null): string {
  if (!lastActive) return '从未活跃'
  const h = (Date.now() - new Date(lastActive).getTime()) / 36e5
  return h < 24 ? '健康' : h < 72 ? '一般' : '离线'
}
function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSeconds = Math.ceil(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function MonitorPage() {
  const { isAdmin, loaded } = useAdmin()
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [llming, setLlming] = useState(false)
  const [llmProgress, setLlmProgress] = useState<{ processed: number; remaining: number; rounds: number } | null>(null)
  const stopLlmRef = useRef(false)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  // 源网址编辑
  const [editingUrl, setEditingUrl] = useState<{ id: string; name: string } | null>(null)
  const [editUrlVal, setEditUrlVal] = useState('')
  const [sourceUrlUpdates, setSourceUrlUpdates] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState<Record<string, string>>({}) // articleId -> 'delete'|'select'
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set())

  // 自动处理 LLM 配置
  const AUTO_LLM_KEY = 'ip-hot-auto-llm-enabled'
  const AUTO_LLM_NEXT_KEY = 'ip-hot-auto-llm-next-at'
  const AUTO_INTERVAL_MS = 3 * 60 * 60 * 1000 // 3小时
  const [autoLlmEnabled, setAutoLlmEnabled] = useState(false)
  const [autoLlmRemaining, setAutoLlmRemaining] = useState<number | null>(null)

  const fetchData = useCallback(async () => {
    const pw = getPw(); if (!pw) return
    try {
      const res = await fetch('/api/admin/monitor', { headers: { 'x-admin-password': pw } })
      if (res.ok) setData(await res.json())
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (loaded) fetchData()
    const t = setInterval(() => { if (loaded) fetchData() }, 30000)
    return () => clearInterval(t)
  }, [loaded, fetchData])

  // 初始化自动处理状态
  useEffect(() => {
    if (typeof window === 'undefined') return
    const enabled = localStorage.getItem(AUTO_LLM_KEY) === '1'
    setAutoLlmEnabled(enabled)
    const nextAt = parseInt(localStorage.getItem(AUTO_LLM_NEXT_KEY) || '0', 10)
    if (enabled && nextAt > 0) {
      setAutoLlmRemaining(Math.max(0, nextAt - Date.now()))
    }
  }, [])

  // 自动处理倒计时
  useEffect(() => {
    if (!autoLlmEnabled) {
      setAutoLlmRemaining(null)
      return
    }

    const tick = () => {
      const nextAt = parseInt(localStorage.getItem(AUTO_LLM_NEXT_KEY) || '0', 10)
      const remaining = nextAt > 0 ? nextAt - Date.now() : AUTO_INTERVAL_MS
      setAutoLlmRemaining(Math.max(0, remaining))

      if (remaining <= 0 && !llming && data && data.queue > 0) {
        handleTriggerLlm()
      } else if (remaining <= 0) {
        // 队列为空或正在处理，直接安排下一次
        const next = Date.now() + AUTO_INTERVAL_MS
        localStorage.setItem(AUTO_LLM_NEXT_KEY, String(next))
        setAutoLlmRemaining(AUTO_INTERVAL_MS)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [autoLlmEnabled, llming, data?.queue])

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

  const loadLogs = async () => {
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/cron-logs', { headers: { 'x-admin-password': pw } })
      if (res.ok) setLogs((await res.json()).logs ?? [])
    } catch {}
  }

  const toggleLogs = () => { if (!showLogs) loadLogs(); setShowLogs(p => !p) }

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
      if (autoLlmEnabled) {
        const next = Date.now() + AUTO_INTERVAL_MS
        localStorage.setItem(AUTO_LLM_NEXT_KEY, String(next))
        setAutoLlmRemaining(AUTO_INTERVAL_MS)
      }
    }
  }

  const handleStopLlm = () => {
    stopLlmRef.current = true
    setLlming(false)
    setLlmProgress(null)
  }

  const toggleAutoLlm = () => {
    const nextEnabled = !autoLlmEnabled
    setAutoLlmEnabled(nextEnabled)
    if (typeof window === 'undefined') return
    localStorage.setItem(AUTO_LLM_KEY, nextEnabled ? '1' : '0')
    if (nextEnabled) {
      const next = Date.now() + AUTO_INTERVAL_MS
      localStorage.setItem(AUTO_LLM_NEXT_KEY, String(next))
      setAutoLlmRemaining(AUTO_INTERVAL_MS)
    } else {
      localStorage.removeItem(AUTO_LLM_NEXT_KEY)
      setAutoLlmRemaining(null)
    }
  }

  // 待复核：删除
  const handleReviewDelete = async (id: string) => {
    if (!confirm('确定删除这条资讯？')) return
    setReviewing(p => ({ ...p, [id]: 'delete' }))
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id }),
      })
      if (res.ok) fetchData()
      else alert('删除失败')
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
      if (res.ok) fetchData()
      else alert('标记失败')
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

  // 保存网址
  const handleSaveUrl = async (id: string) => {
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id, url: editUrlVal }),
      })
      if (res.ok) {
        setSourceUrlUpdates(p => ({ ...p, [id]: editUrlVal }))
        setEditingUrl(null)
        fetchData()
      } else { alert('保存失败') }
    } catch {}
  }

  // 删除信源
  const handleDeleteSource = async (id: string, name: string) => {
    if (!confirm(`确定删除信源「${name}」？此操作不可撤销。`)) return
    const pw = getPw() || ''
    try {
      const res = await fetch('/api/admin/sources/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        fetchData()
      } else {
        alert('删除失败')
      }
    } catch {}
  }

  const getSourceUrl = (s: SourceItem) => sourceUrlUpdates[s.id] || s.url || ''

  const task = data?.todayTask
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
                      <button
                        className="monitor-action-btn"
                        onClick={toggleAutoLlm}
                        style={{
                          borderColor: autoLlmEnabled ? '#2e9d5a' : 'var(--border)',
                          color: autoLlmEnabled ? '#2e9d5a' : 'var(--text-muted)',
                        }}
                        title="每3小时自动触发一次LLM处理"
                      >
                        {autoLlmEnabled ? '自动处理 ON' : '自动处理 OFF'}
                      </button>
                      {autoLlmEnabled && autoLlmRemaining !== null && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          下次 {formatCountdown(autoLlmRemaining)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="monitor-stat-card">
                <div className="monitor-stat-value" style={{ color: '#2e9d5a' }}>{data.activeSources}</div>
                <div className="monitor-stat-label">活跃信息源</div>
                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
                  <span style={{ color: '#e94560' }}>失效 {data.failedSources}</span>
                  <span style={{ color: '#888' }}>未跑通 {data.deadSources}</span>
                </div>
              </div>
            </div>

            {/* 日志面板 */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="monitor-action-btn" onClick={toggleLogs}>{showLogs ? '隐藏日志' : '查看日志'}</button>
            </div>
            {showLogs && (
              <div className="cron-logs-panel">
                <h4>任务日志（最近20条）</h4>
                {logs.length === 0 ? <p className="cron-logs-empty">暂无日志</p> : (
                  <table className="cron-logs-table"><thead><tr><th>时间</th><th>触发</th><th>抓取</th><th>入库</th><th>LLM处理</th><th>耗时</th><th>状态</th></tr></thead>
                    <tbody>{logs.map((log: any) => (
                      <tr key={log.id}><td>{log.started_at ? new Date(log.started_at).toLocaleString('zh-CN') : '-'}</td><td>{log.trigger_type === 'manual' ? '手动' : log.trigger_type === 'manual_llm' ? '手动LLM' : log.trigger_type === 'source_add' ? '添加信源' : log.trigger_type === 'source_delete' ? '删除信源' : '定时'}</td><td>{log.fetch_total_fetched ?? 0}</td><td>{log.fetch_total_inserted ?? 0}</td><td>{log.trigger_type === 'manual_llm' ? `${log.llm_processed ?? 0} / ${log.details?.batch_total != null ? log.details.batch_total : ((log.llm_processed ?? 0) + (log.llm_failed ?? 0) || '-')}` : `${log.llm_processed ?? 0} / ${log.llm_pending ?? 0}`}</td><td>{log.ended_at && log.started_at ? Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000) + 's' : '-'}</td><td><span className={`cron-log-status ${log.status}`}>{log.status === 'success' ? '✅ 成功' : log.status === 'error' ? '❌ 失败' : '⏳ 运行中'}</span></td></tr>
                    ))}</tbody></table>
                )}
              </div>
            )}

            {/* 分类资讯数量统计 */}
            <div>
              <h2 className="monitor-section-title">分类资讯数量统计</h2>
              {data.categoryStats.length === 0 ? <p className="empty-state">暂无数据</p> : (
                <table className="monitor-table">
                  <thead><tr><th>分类</th><th style={{ textAlign: 'right' }}>数量</th></tr></thead>
                  <tbody>
                    {allCats.map(cat => (
                      <tr key={cat}><td>{cat}</td><td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{catMap.get(cat) || 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* 源健康度 */}
            <div>
              <h2 className="monitor-section-title">源健康度（7天）</h2>

              {/* 3.1 未跑通 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#e94560', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e94560', display: 'inline-block' }} />未跑通 · {data.deadSourceList.length}
                </h3>
                {data.deadSourceList.length === 0 ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>无</p> : (
                  <div className="source-compact-list">
                    {data.deadSourceList.map(s => {
                      const displayUrl = getSourceUrl(s)
                      return (
                        <div key={s.id} className="source-compact-row">
                          <span className="source-compact-name">{s.name}</span>
                          {editingUrl?.id === s.id ? (
                            <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: 1 }}>
                              <input value={editUrlVal} onChange={e => setEditUrlVal(e.target.value)} style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }} />
                              <button className="monitor-action-btn" onClick={() => handleSaveUrl(s.id)}>确认</button>
                              <button className="monitor-action-btn" onClick={() => setEditingUrl(null)}>取消</button>
                            </span>
                          ) : (
                            <span className="source-compact-url" onClick={() => { setEditingUrl({ id: s.id, name: s.name }); setEditUrlVal(displayUrl) }} title="点击编辑">{displayUrl || '(无网址)'}</span>
                          )}
                          <button className="monitor-action-btn" onClick={() => handleDeleteSource(s.id, s.name)} style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }}>
                            删除
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 3.2 失效 */}
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />失效 · {data.failedSourceList.length}
                </h3>
                {data.failedSourceList.length === 0 ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>无</p> : (
                  <div className="source-compact-list">
                    {data.failedSourceList.map(s => {
                      const displayUrl = getSourceUrl(s)
                      return (
                        <div key={s.id} className="source-compact-row">
                          <span className="source-compact-name">{s.name}</span>
                          {editingUrl?.id === s.id ? (
                            <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: 1 }}>
                              <input value={editUrlVal} onChange={e => setEditUrlVal(e.target.value)} style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }} />
                              <button className="monitor-action-btn" onClick={() => handleSaveUrl(s.id)}>确认</button>
                              <button className="monitor-action-btn" onClick={() => setEditingUrl(null)}>取消</button>
                            </span>
                          ) : (
                            <span className="source-compact-url" onClick={() => { setEditingUrl({ id: s.id, name: s.name }); setEditUrlVal(displayUrl) }} title="点击编辑">{displayUrl || '(无网址)'}</span>
                          )}
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{s.count7d || 0}篇/7d</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 3.3 活跃 */}
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#2e9d5a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#2e9d5a', display: 'inline-block' }} />活跃 · {data.activeSourceList.length}
                </h3>
                {data.activeSourceList.length === 0 ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>无</p> : (
                  <div className="source-compact-list">
                    {data.activeSourceList.map(s => {
                      const displayUrl = getSourceUrl(s)
                      return (
                        <div key={s.id} className="source-compact-row">
                          <span className="source-compact-name">{s.name}</span>
                          {editingUrl?.id === s.id ? (
                            <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: 1 }}>
                              <input value={editUrlVal} onChange={e => setEditUrlVal(e.target.value)} style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }} />
                              <button className="monitor-action-btn" onClick={() => handleSaveUrl(s.id)}>确认</button>
                              <button className="monitor-action-btn" onClick={() => setEditingUrl(null)}>取消</button>
                            </span>
                          ) : (
                            <span className="source-compact-url" onClick={() => { setEditingUrl({ id: s.id, name: s.name }); setEditUrlVal(displayUrl) }} title="点击编辑">{displayUrl || '(无网址)'}</span>
                          )}
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{s.count7d || 0}篇/7d</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 信源质量（7天低分率） */}
            {data.sourceQuality && data.sourceQuality.length > 0 && (
              <div>
                <h2 className="monitor-section-title">信源质量（7天低分率）</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.sourceQuality.map(s => (
                    <div key={s.name} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 0.75rem', borderRadius: 6,
                      background: s.rate >= 50 ? 'rgba(233,69,96,0.06)' : 'var(--bg-secondary)',
                      border: s.rate >= 50 ? '1px solid rgba(233,69,96,0.2)' : '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{s.name}</span>
                      <span style={{
                        fontSize: '0.8125rem',
                        color: s.rate >= 50 ? '#e94560' : s.rate >= 30 ? '#f59e0b' : '#2e9d5a',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {s.low}/{s.total} · {s.rate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 待人工复核队列 */}
            {data.reviewQueue && data.reviewQueue.length > 0 && (
              <div>
                <h2 className="monitor-section-title" style={{ color: '#f59e0b' }}>待人工复核 · {data.reviewQueue.length}</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  LLM 拿不准分类但觉得还有点价值（评分4-6），你来决定留不留
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data.reviewQueue.map(r => (
                    <div key={r.id} style={{
                      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '0.75rem 1rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.375rem' }}>
                        <input
                          type="checkbox"
                          checked={selectedReviews.has(r.id)}
                          onChange={(e) => {
                            const next = new Set(selectedReviews)
                            if (e.target.checked) next.add(r.id)
                            else next.delete(r.id)
                            setSelectedReviews(next)
                          }}
                          style={{ marginTop: 2 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4 }}>{r.titleCn}</div>
                            <span style={{
                              fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: 4,
                              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                              fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                            }}>
                              评分 {r.relevanceScore}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.5 }}>{r.summaryCn}</div>
                          {r.commentary && (
                            <div style={{ fontSize: '0.75rem', color: '#c97b3b', marginTop: '0.25rem' }}>
                              推荐理由：{r.commentary}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem', paddingLeft: '1.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.source} · {formatTime(r.createdAt)}</span>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
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

            {/* 最近错误 */}
            {data.recentErrors.length > 0 && (
              <div><h2 className="monitor-section-title" style={{ color: '#e94560' }}>最近错误</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data.recentErrors.map(e => (
                    <div key={e.id} style={{ background: 'rgba(233,69,96,0.06)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 8, padding: '0.75rem 1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{formatTime(e.startedAt)}</div>
                      <div style={{ fontSize: '0.875rem', color: '#e94560' }}>{e.errorMessage || '未知错误'}</div>
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
