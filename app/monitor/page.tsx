'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAdminState, useAdmin } from '../components/AdminToggle'
import {
  CategoryStats,
  LogsPanel,
  PageHeader,
  RecentErrors,
  ReviewQueue,
  SourceHealthPanel,
  SourceQuality,
  StatsCards,
  type SourceEditorProps,
} from './_components/MonitorSections'
import type { CronLog, LlmProgress, MonitorData, ReviewItem, SourceItem } from './_components/types'
import { useAutoProcessor, useLatestValueRef } from './_components/useAutoProcessor'
import { getErrorMessage, removeReviews, sleep } from './_components/utils'

type ReclassifyResult = {
  id: string
  title: string
  oldCategory: string | null
  oldScore: number | null
  newCategory: string
  newScore: number
  newSelected: boolean
  commentary: string
}

export default function MonitorPage() {
  const { isAdmin, loaded, refresh } = useAdmin()
  const [data, setData] = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [llming, setLlming] = useState(false)
  const [llmProgress, setLlmProgress] = useState<LlmProgress | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<CronLog[]>([])
  const [editingSource, setEditingSource] = useState<{ id: string; name: string } | null>(null)
  const [editUrlValue, setEditUrlValue] = useState('')
  const [sourceUrlUpdates, setSourceUrlUpdates] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState<Record<string, string>>({})
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set())
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyResults, setReclassifyResults] = useState<ReclassifyResult[] | null>(null)
  const stopLlmRef = useRef(false)
  const dataRef = useLatestValueRef(data)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/monitor', { credentials: 'same-origin' })
      if (res.ok) setData(await res.json())
    } catch {
      // Polling dashboard: keep the last good snapshot on transient network failures.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (!isAdmin) return

    const initialTimer = window.setTimeout(() => {
      void fetchData()
    }, 0)
    const pollTimer = window.setInterval(() => {
      void fetchData()
    }, 30000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(pollTimer)
    }
  }, [loaded, isAdmin, fetchData])

  const runLlmProcessor = useCallback(async ({ confirmBeforeRun }: { confirmBeforeRun: boolean }) => {
    const currentQueue = dataRef.current?.queue ?? 0
    if (currentQueue <= 0) {
      if (confirmBeforeRun) alert('暂无待处理文章')
      return
    }

    const authenticated = await fetchAdminState()
    if (!authenticated) {
      await refresh()
      alert('管理员登录已过期，请重新登录后再处理 LLM。')
      return
    }

    if (confirmBeforeRun && !confirm(`确定运行 LLM 批量处理？当前队列: ${currentQueue} 条。将自动循环处理直到清空。`)) return

    setLlming(true)
    stopLlmRef.current = false
    setLlmProgress({ processed: 0, remaining: currentQueue, rounds: 0 })

    let totalProcessed = 0
    let totalFailed = 0
    let totalRounds = 0
    let lastRemaining = currentQueue
    let staleCount = 0

    try {
      while (!stopLlmRef.current) {
        const res = await fetch('/api/admin/process-llm', { method: 'POST', credentials: 'same-origin' })
        const response = await res.json()

        if (res.status === 401) {
          await refresh()
          alert('管理员登录已过期，请重新登录后再处理 LLM。')
          break
        }

        if (!res.ok || !response.ok) {
          alert(`处理失败: ${response.error || `HTTP ${res.status}`}`)
          break
        }

        const reportedCompleted = response.completed ?? (
          (response.processed ?? 0) +
          (response.irrelevantDeleted ?? 0) +
          (response.skipped ?? 0) +
          (response.llmFailureMarked ?? 0)
        )
        totalFailed += response.failed ?? 0
        totalRounds += 1
        const remaining = response.remaining ?? 0
        const inferredCompleted = remaining < lastRemaining ? lastRemaining - remaining : 0
        const completedThisRound = Math.max(reportedCompleted, inferredCompleted)
        totalProcessed += completedThisRound
        setLlmProgress({ processed: totalProcessed, remaining, rounds: totalRounds })

        if (remaining === 0) {
          if (confirmBeforeRun) {
            const msg = totalFailed > 0
              ? `全部完成！共处理 ${totalProcessed} 条，失败 ${totalFailed} 条，${totalRounds} 轮`
              : `全部完成！共处理 ${totalProcessed} 条，${totalRounds} 轮`
            alert(msg)
          }
          break
        }

        if (remaining >= lastRemaining) {
          staleCount += 1
          if (staleCount >= 3) {
            alert(`连续 ${staleCount} 轮剩余数量没有减少（当前剩余 ${remaining} 条），已自动停止，避免空转。请检查 Supabase 删除权限或联系开发。`)
            break
          }
        } else {
          staleCount = 0
        }
        lastRemaining = remaining
        await sleep(500)
      }
    } catch (error) {
      alert(`请求失败: ${getErrorMessage(error)}`)
    } finally {
      setLlming(false)
      setLlmProgress(null)
      await fetchData()
    }
  }, [dataRef, fetchData, refresh])

  const autoProcessor = useAutoProcessor({
    queue: data?.queue ?? 0,
    llming,
    onTrigger: () => runLlmProcessor({ confirmBeforeRun: false }),
  })

  const handleManualReclassify = useCallback(async () => {
    if (!confirm('确定手动分类一次待分类资讯？每次最多处理 20 条。')) return
    setReclassifying(true)
    setReclassifyResults(null)
    try {
      const res = await fetch('/api/admin/reclassify-review', { method: 'POST', credentials: 'same-origin' })
      const response = await res.json()
      if (res.ok && response.ok) {
        setReclassifyResults(response.results ?? [])
        await fetchData()
      } else {
        alert(`分类失败: ${response.error || '未知错误'}`)
      }
    } catch (error) {
      alert(`请求失败: ${getErrorMessage(error)}`)
    } finally {
      setReclassifying(false)
    }
  }, [fetchData])

  const handleManualFetch = useCallback(async () => {
    if (!confirm('确定手动触发一次资讯抓取？')) return
    setFetching(true)
    try {
      const res = await fetch('/api/cron/fetch-and-process', { method: 'GET', credentials: 'same-origin' })
      const response = await res.json()
      alert(res.ok ? '抓取触发成功！' : `抓取失败: ${response.error || '未知错误'}`)
      await fetchData()
    } catch (error) {
      alert(`请求失败: ${getErrorMessage(error)}`)
    } finally {
      setFetching(false)
    }
  }, [fetchData])

  const loadLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cron-logs', { credentials: 'same-origin' })
      if (res.ok) setLogs((await res.json()).logs ?? [])
    } catch {}
  }, [])

  const toggleLogs = useCallback(() => {
    if (!showLogs) void loadLogs()
    setShowLogs((current) => !current)
  }, [loadLogs, showLogs])

  const handleStopLlm = useCallback(() => {
    stopLlmRef.current = true
    setLlming(false)
    setLlmProgress(null)
  }, [])

  const handleStartSourceEdit = useCallback((source: SourceItem, url: string) => {
    setEditingSource({ id: source.id, name: source.name })
    setEditUrlValue(url)
  }, [])

  const handleSaveUrl = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/admin/sources', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, url: editUrlValue }),
      })
      if (res.ok) {
        setSourceUrlUpdates((current) => ({ ...current, [id]: editUrlValue }))
        setEditingSource(null)
        await fetchData()
      } else {
        alert('保存失败')
      }
    } catch {
      alert('请求失败')
    }
  }, [editUrlValue, fetchData])

  const handleDeleteSource = useCallback(async (id: string, name: string) => {
    if (!confirm(`确定删除信源「${name}」？此操作不可撤销。`)) return
    try {
      const res = await fetch('/api/admin/sources/delete', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) await fetchData()
      else alert('删除失败')
    } catch {
      alert('请求失败')
    }
  }, [fetchData])

  const getSourceUrl = useCallback((source: SourceItem) => sourceUrlUpdates[source.id] || source.url || '', [sourceUrlUpdates])

  const setReviewingState = useCallback((id: string, action: string | null) => {
    setReviewing((current) => {
      const next = { ...current }
      if (action) next[id] = action
      else delete next[id]
      return next
    })
  }, [])

  const restoreReviewItem = useCallback((item: ReviewItem) => {
    setData((current) => {
      if (!current) return current
      const queue = current.reviewQueue ?? []
      if (queue.some((review) => review.id === item.id)) return current
      return { ...current, reviewQueue: [item, ...queue] }
    })
  }, [])

  const handleReviewDelete = useCallback(async (item: ReviewItem) => {
    if (!confirm('确定删除这条资讯？')) return

    setReviewingState(item.id, 'delete')
    setSelectedReviews((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    setData((current) => removeReviews(current, new Set([item.id])))

    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id }),
      })
      if (!res.ok) {
        restoreReviewItem(item)
        alert('删除失败，已恢复')
      }
    } catch {
      restoreReviewItem(item)
      alert('请求失败，已恢复')
    } finally {
      setReviewingState(item.id, null)
    }
  }, [restoreReviewItem, setReviewingState])

  const handleReviewSelect = useCallback(async (item: ReviewItem) => {
    setReviewingState(item.id, 'select')
    setSelectedReviews((current) => {
      const next = new Set(current)
      next.delete(item.id)
      return next
    })
    setData((current) => removeReviews(current, new Set([item.id])))

    try {
      const res = await fetch('/api/admin/update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_selected: true }),
      })
      if (!res.ok) {
        restoreReviewItem(item)
        alert('标记失败，已恢复')
      }
    } catch {
      restoreReviewItem(item)
      alert('请求失败，已恢复')
    } finally {
      setReviewingState(item.id, null)
    }
  }, [restoreReviewItem, setReviewingState])

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedReviews)
    if (ids.length === 0) { alert('请先勾选文章'); return }
    if (!confirm(`确定批量删除 ${ids.length} 条资讯？`)) return

    const removedIds = new Set(ids)
    const removedItems = dataRef.current?.reviewQueue?.filter((item) => removedIds.has(item.id)) ?? []
    setData((current) => removeReviews(current, removedIds))
    setSelectedReviews(new Set())

    try {
      const res = await fetch('/api/admin/delete-batch', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const response = await res.json()
      if (!response.ok) {
        setData((current) => current ? { ...current, reviewQueue: [...removedItems, ...(current.reviewQueue ?? [])] } : current)
        alert(`批量删除失败：${response.error || '未知错误'}，已恢复`)
      }
    } catch {
      setData((current) => current ? { ...current, reviewQueue: [...removedItems, ...(current.reviewQueue ?? [])] } : current)
      alert('请求失败，已恢复')
    }
  }, [dataRef, selectedReviews])

  const handleBatchSelect = useCallback(async () => {
    const ids = Array.from(selectedReviews)
    if (ids.length === 0) { alert('请先勾选文章'); return }
    if (!confirm(`确定批量标记 ${ids.length} 条为精选？`)) return

    const removedIds = new Set(ids)
    const removedItems = dataRef.current?.reviewQueue?.filter((item) => removedIds.has(item.id)) ?? []
    setData((current) => removeReviews(current, removedIds))
    setSelectedReviews(new Set())

    const results = await Promise.all(ids.map((id) =>
      fetch('/api/admin/update', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_selected: true }),
      }).then((res) => res.ok).catch(() => false),
    ))

    const failedIds = ids.filter((_, index) => !results[index])
    if (failedIds.length > 0) {
      const failedSet = new Set(failedIds)
      const failedItems = removedItems.filter((item) => failedSet.has(item.id))
      setData((current) => current ? { ...current, reviewQueue: [...failedItems, ...(current.reviewQueue ?? [])] } : current)
      alert(`批量精选部分失败：${failedIds.length} 条已恢复`)
    }
  }, [dataRef, selectedReviews])

  const handleToggleAllReviews = useCallback((checked: boolean) => {
    setSelectedReviews(checked ? new Set(dataRef.current?.reviewQueue?.map((item) => item.id) ?? []) : new Set())
  }, [dataRef])

  const handleToggleOneReview = useCallback((id: string, checked: boolean) => {
    setSelectedReviews((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const sourceEditor: SourceEditorProps = {
    getUrl: getSourceUrl,
    editingId: editingSource?.id ?? null,
    editValue: editUrlValue,
    onStartEdit: handleStartSourceEdit,
    onEditValueChange: setEditUrlValue,
    onCancelEdit: () => setEditingSource(null),
    onSaveUrl: handleSaveUrl,
    onDelete: handleDeleteSource,
  }

  return (
    <>
      <PageHeader />
      <section className="article-section">
        {(!loaded || (isAdmin && loading)) ? <p className="empty-state">加载中…</p> : !isAdmin || !data ? <p className="empty-state">加载失败，请确认已登录管理员。</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <StatsCards
              data={data}
              fetching={fetching}
              llming={llming}
              progress={llmProgress}
              autoProcessor={autoProcessor}
              onManualFetch={handleManualFetch}
              onManualLlm={() => void runLlmProcessor({ confirmBeforeRun: true })}
              onStopLlm={handleStopLlm}
              onManualReclassify={handleManualReclassify}
              reclassifying={reclassifying}
            />
            {reclassifyResults && reclassifyResults.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '1rem' }}>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.75rem' }}>手动分类结果（{reclassifyResults.length} 条）</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  {reclassifyResults.map((item) => (
                    <div key={item.id} style={{ padding: '0.625rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.25rem' }}>{item.title.slice(0, 60)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span>旧分类: {item.oldCategory} / {item.oldScore}分</span>
                        <span style={{ color: item.newSelected ? '#2e9d5a' : 'inherit' }}>新分类: {item.newCategory} / {item.newScore}分 {item.newSelected && '· 精选'}</span>
                      </div>
                      {item.commentary && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{item.commentary}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <LogsPanel logs={logs} visible={showLogs} onToggle={toggleLogs} />
            <CategoryStats stats={data.categoryStats} />
            <SourceHealthPanel data={data} sourceEditor={sourceEditor} />
            <SourceQuality items={data.sourceQuality} />
            <ReviewQueue
              items={data.reviewQueue ?? []}
              selectedIds={selectedReviews}
              reviewing={reviewing}
              onToggleAll={handleToggleAllReviews}
              onToggleOne={handleToggleOneReview}
              onDelete={handleReviewDelete}
              onSelect={handleReviewSelect}
              onBatchDelete={handleBatchDelete}
              onBatchSelect={handleBatchSelect}
            />
            <RecentErrors errors={data.recentErrors} />
          </div>
        )}
      </section>
    </>
  )
}
