'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { countSourceExecutionModes } from '@/lib/source-schedule'
import type { SourceHealthStatus } from '@/lib/source-health'

type HealthCounts = Partial<Record<SourceHealthStatus, number>>

interface Source {
  id: string
  region?: string
  url?: string
  type?: string
  fetch_type?: 'rss' | 'web'
  enabled?: boolean
  last_test_status?: 'untested' | 'success' | 'failed'
  method?: string
}

interface SourceStatsProps {
  initialSources: Source[]
}

function isRssSource(source: Source) {
  return source.fetch_type === 'rss'
    || source.type?.toLowerCase() === 'rss'
    || /(?:feed|rss|atom|\.xml)(?:\/|$|\?)/i.test(source.url || '')
}

export function SourceStats({ initialSources }: SourceStatsProps) {
  const [sources, setSources] = useState(initialSources)
  const [healthCounts, setHealthCounts] = useState<HealthCounts | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch('/api/sources', { cache: 'no-store' })
    if (!response.ok) return
    const data = await response.json()
    setSources(data.sources || [])
  }, [])

  useEffect(() => {
    const handleSourcesUpdated = (event: Event) => {
      const updatedSources = (event as CustomEvent<Source[]>).detail
      if (Array.isArray(updatedSources)) {
        setSources(updatedSources)
      } else {
        void refresh()
      }
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const interval = window.setInterval(refresh, 15_000)

    const handleHealthUpdated = (event: Event) => {
      const rows = (event as CustomEvent<Array<{ status: SourceHealthStatus }>>).detail
      if (!Array.isArray(rows)) return
      const counts: HealthCounts = {}
      for (const row of rows) {
        counts[row.status] = (counts[row.status] || 0) + 1
      }
      setHealthCounts(counts)
    }

    window.addEventListener('sources-updated', handleSourcesUpdated)
    window.addEventListener('sources-health-updated', handleHealthUpdated)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('sources-updated', handleSourcesUpdated)
      window.removeEventListener('sources-health-updated', handleHealthUpdated)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  const stats = useMemo(() => {
    const domestic = sources.filter((source) => source.region === 'domestic').length
    const rss = sources.filter(isRssSource).length
    const executionModes = countSourceExecutionModes(sources)
    const success = sources.filter((source) => source.last_test_status === 'success').length
    const failed = sources.filter((source) => source.last_test_status === 'failed').length

    return {
      total: sources.length,
      domestic,
      overseas: sources.length - domestic,
      rss,
      web: sources.length - rss,
      ...executionModes,
      success,
      failed,
      untested: sources.length - success - failed,
    }
  }, [sources])

  return (
    <div className="sources-header-stats" aria-label="信息源状态统计" aria-live="polite">
      <section className="source-stat-group">
        <span className="source-stat-group-title">全部来源</span>
        <div className="source-stat-values">
          <div className="source-stat-metric">
            <strong>{stats.total}</strong>
            <span>全部</span>
          </div>
          <div className="source-stat-metric">
            <strong>{stats.domestic}</strong>
            <span>国内</span>
          </div>
          <div className="source-stat-metric">
            <strong>{stats.overseas}</strong>
            <span>海外</span>
          </div>
        </div>
      </section>
      <section className="source-stat-group">
        <span className="source-stat-group-title">来源类型</span>
        <div className="source-stat-values">
          <div className="source-stat-metric">
            <strong>{stats.rss}</strong>
            <span>RSS</span>
          </div>
          <div className="source-stat-metric">
            <strong>{stats.web}</strong>
            <span>网页</span>
          </div>
        </div>
      </section>
      <section className="source-stat-group">
        <span className="source-stat-group-title">执行方式</span>
        <div className="source-stat-values">
          <div className="source-stat-metric active">
            <strong>{stats.cloud}</strong>
            <span>云端</span>
          </div>
          <div className="source-stat-metric active">
            <strong>{stats.local}</strong>
            <span>本地 CDP</span>
          </div>
          <div className="source-stat-metric">
            <strong>{stats.manual}</strong>
            <span>人工</span>
          </div>
          <div className="source-stat-metric muted">
            <strong>{stats.paused}</strong>
            <span>已暂停</span>
          </div>
        </div>
      </section>
      <section className="source-stat-group">
        <span className="source-stat-group-title">测试状态</span>
        <div className="source-stat-values">
          <div className="source-stat-metric active">
            <strong>{stats.success}</strong>
            <span>成功</span>
          </div>
          <div className="source-stat-metric failed">
            <strong>{stats.failed}</strong>
            <span>失败</span>
          </div>
          <div className="source-stat-metric muted">
            <strong>{stats.untested}</strong>
            <span>未测试</span>
          </div>
        </div>
      </section>
      <section className="source-stat-group">
        <span className="source-stat-group-title">抓取状态</span>
        <div className="source-stat-values">
          <div className="source-stat-metric active">
            <strong>{healthCounts ? (healthCounts.healthy ?? 0) : '—'}</strong>
            <span>正常</span>
          </div>
          <div className="source-stat-metric failed">
            <strong>{healthCounts ? (healthCounts.repair ?? 0) : '—'}</strong>
            <span>待修复</span>
          </div>
          <div className="source-stat-metric failed">
            <strong>{healthCounts ? (healthCounts.dead_links ?? 0) : '—'}</strong>
            <span>失效链接过多</span>
          </div>
          <div className="source-stat-metric muted">
            <strong>{healthCounts ? (healthCounts.untested ?? 0) : '—'}</strong>
            <span>尚未验证</span>
          </div>
        </div>
      </section>
    </div>
  )
}
