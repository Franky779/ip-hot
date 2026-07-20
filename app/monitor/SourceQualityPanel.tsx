'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

export type SourceQualityItem = {
  sourceId: string | null
  name: string
  enabled: boolean
  mode: 'normal' | 'observe' | 'reduced' | 'paused'
  discovered: number
  inserted: number
  scored: number
  llmUnprocessed: number
  low: number
  mid: number
  high: number
  selected: number
  duplicates: number
  noiseBlocked: number
  deadLinks: number
  llmFailed: number
  lowRate: number
  usefulRate: number
  previousLowRate: number | null
  trend: number | null
  confidence: 'insufficient' | 'enough'
  status: 'insufficient' | 'healthy' | 'warning' | 'poor'
  managementStatus: 'normal' | 'review' | 'insufficient' | 'reduced' | 'observe' | 'paused'
  recommendation: string
  legacyEstimate: boolean
  lowSamples: Array<{ title: string; url: string; score: number; commentary: string; createdAt: string }>
  midSamples: Array<{ title: string; url: string; score: number; commentary: string; createdAt: string }>
  highSamples: Array<{ title: string; url: string; score: number; commentary: string; createdAt: string }>
  selectedSamples: Array<{ title: string; url: string; score: number; commentary: string; createdAt: string }>
}

type Props = {
  items: SourceQualityItem[]
  days: 7 | 30 | 180 | 365
  onDaysChange: (days: 7 | 30 | 180 | 365) => void
  onRefresh: () => Promise<void>
}

const STATUS_LABELS = {
  insufficient: '样本不足',
  healthy: '正常',
  warning: '需观察',
  poor: '重点复核',
}

const MODE_LABELS = {
  normal: '正常频率',
  observe: '观察中',
  reduced: '已降频',
  paused: '已停用',
}

const MANAGEMENT_STATUS_LABELS = {
  normal: '正常信源',
  review: '需人工复核',
  insufficient: '样本不足',
  reduced: '降低频率',
  observe: '继续观察',
  paused: '停用来源',
}

function adminPassword() {
  return typeof window === 'undefined' ? '' : localStorage.getItem('ip-hot-admin-pw') || ''
}

function trendLabel(trend: number | null) {
  if (trend === null) return '暂无上期数据'
  if (trend === 0) return '与上期持平'
  return `较上期${trend > 0 ? '上升' : '下降'} ${Math.abs(trend)} 个百分点`
}

export default function SourceQualityPanel({ items, days, onDaysChange, onRefresh }: Props) {
  const [filter, setFilter] = useState<'all' | SourceQualityItem['managementStatus']>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [deletedSourceIds, setDeletedSourceIds] = useState<Set<string>>(new Set())

  const attentionCount = items.filter((item) => item.managementStatus === 'review').length
  const insufficientCount = items.filter((item) => item.status === 'insufficient').length
  const visibleItems = useMemo(
    () => items.filter((item) => {
      if (item.sourceId && deletedSourceIds.has(item.sourceId)) return false
      return filter === 'all' || item.managementStatus === filter
    }),
    [deletedSourceIds, filter, items],
  )

  const runAction = async (
    item: SourceQualityItem,
    action: 'observe' | 'reduce' | 'normal' | 'pause' | 'resume',
  ) => {
    if (!item.sourceId) {
      alert('该统计名称尚未匹配到信息源管理记录，请前往信息源管理页处理。')
      return
    }
    const confirmations = {
      observe: `将“${item.name}”标记为继续观察？这不会改变抓取状态。`,
      reduce: `将“${item.name}”改为降频抓取？后续只参加一半的定时轮次。`,
      normal: `恢复“${item.name}”的正常抓取频率？`,
      pause: `确认停用“${item.name}”？请确保已检查低分样本。`,
      resume: `确认恢复启用“${item.name}”？只有最近测试成功的来源才能恢复。`,
    }
    if (!confirm(confirmations[action])) return
    setBusy(`${item.sourceId}:${action}`)
    try {
      const response = await fetch('/api/admin/source-quality/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword() },
        body: JSON.stringify({ sourceId: item.sourceId, action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '操作失败')
      alert(result.message)
      await onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const deleteSource = async (item: SourceQualityItem) => {
    if (!item.sourceId) {
      alert('该统计名称尚未匹配到信息源管理记录，无法删除。')
      return
    }
    if (!confirm(`确认删除“${item.name}”吗？该来源会立即退出管理页和后续抓取队列，历史资讯与审计日志会保留。`)) return

    setBusy(`${item.sourceId}:delete`)
    try {
      const response = await fetch('/api/admin/sources/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': adminPassword() },
        body: JSON.stringify({ id: item.sourceId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '删除信息源失败')
      setDeletedSourceIds((current) => {
        const next = new Set(current)
        next.add(item.sourceId!)
        return next
      })
      setExpanded(null)
      await onRefresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="source-efficiency-section">
      <div className="source-efficiency-heading">
        <div>
          <h2 className="monitor-section-title">信源命中效率</h2>
          <p className="source-efficiency-intro">
            衡量抓取内容与动漫/IP/文创选题的匹配程度，不代表媒体事实可信度。低分率分母为 LLM 已评分文章，不是网页抓取总数。
          </p>
        </div>
        <div className="source-efficiency-controls" aria-label="信源命中效率筛选">
          <label>
            <span>时间</span>
            <select value={days} onChange={(event) => onDaysChange(Number(event.target.value) as Props['days'])}>
              <option value={7}>7 天</option>
              <option value={30}>30 天</option>
              <option value={180}>180 天</option>
              <option value={365}>1 年</option>
            </select>
          </label>
          <label>
            <span>信息源状态</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">全部</option>
              {Object.entries(MANAGEMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="source-efficiency-summary">
        <span><strong>{attentionCount}</strong> 个来源需要复核</span>
        <span><strong>{insufficientCount}</strong> 个来源样本不足</span>
        <span>至少评分 <strong>20</strong> 条后才给出质量结论</span>
      </div>

      {items.some((item) => item.legacyEstimate) && (
        <p className="source-efficiency-legacy">
          “历史估算”来自旧版文章表，低分文章曾被删除，结果可能偏乐观；下一轮抓取和评分后会自动切换为完整审计口径。
        </p>
      )}

      {visibleItems.length === 0 ? (
        <p className="empty-state">当前筛选下没有需要关注的来源。</p>
      ) : (
        <div className="source-quality-grid">
          {visibleItems.map((item) => {
            const isExpanded = expanded === item.name
            return (
              <article
                key={item.name}
                className={`source-quality-card is-${item.status} ${isExpanded ? 'is-expanded' : ''}`}
              >
                <button
                  type="button"
                  className="source-quality-card-toggle"
                  onClick={() => setExpanded(isExpanded ? null : item.name)}
                  aria-expanded={isExpanded}
                >
                  <span className="source-quality-name-row">
                    <span className="source-quality-name" title={item.name}>{item.name}</span>
                    <span className={`source-quality-status is-${item.status}`}>{STATUS_LABELS[item.status]}</span>
                    {item.legacyEstimate && <span className="source-quality-legacy-badge">历史估算</span>}
                  </span>
                  <strong className={`source-quality-management-status is-${item.managementStatus}`}>
                    {MANAGEMENT_STATUS_LABELS[item.managementStatus]}
                  </strong>
                  <span className="source-quality-detail">低分 <b>{item.low}</b> / 已评分 <b>{item.scored}</b> 条</span>
                  <span className="source-quality-mode">{MODE_LABELS[item.mode]} · {item.enabled ? '自动抓取已启用' : '自动抓取已停用'}</span>
                  <span className="source-quality-mini-funnel">
                    <span>发现 <b>{item.discovered}</b></span>
                    <span>新增 <b>{item.inserted}</b></span>
                    <span>高分 <b>{item.high}</b></span>
                    <span>精选 <b>{item.selected}</b></span>
                  </span>
                  <span className="source-quality-expand-label">{isExpanded ? '收起详情' : '查看漏斗、样本与操作'}</span>
                </button>

                {isExpanded && (
                  <div className="source-quality-expanded">
                    <div className="source-quality-funnel" aria-label={`${item.name}内容处理漏斗`}>
                      <div className="source-quality-funnel-stage is-discovered"><span>抓取发现</span><strong className="source-quality-funnel-value">{item.discovered}</strong></div>
                      <div className="source-quality-funnel-stage is-inserted"><span>去重入库</span><strong className="source-quality-funnel-value">{item.inserted}</strong></div>
                      <div className="source-quality-funnel-stage is-llm">
                        <span>LLM 处理</span>
                        <div className="source-quality-funnel-inline-stats">
                          <b>已评分 <strong>{item.scored}</strong></b>
                          <b>未处理 <strong>{item.llmUnprocessed}</strong></b>
                        </div>
                      </div>
                      <div className="source-quality-funnel-stage is-score-buckets">
                        <span>评分分布</span>
                        <div className="source-quality-score-grid">
                          <span>高分 7–10 <b>{item.high}</b></span>
                          <span>边界 4–6 <b>{item.mid}</b></span>
                          <span>低分 0–3 <b>{item.low}</b></span>
                        </div>
                      </div>
                      <div className="source-quality-funnel-stage is-selected"><span>精选</span><strong className="source-quality-funnel-value">{item.selected}</strong></div>
                    </div>
                    <div className="source-quality-breakdown">
                      <span>低分 0–3：<b>{item.low}</b></span>
                      <span>边界 4–6：<b>{item.mid}</b></span>
                      <span>高分 7–10：<b>{item.high}</b></span>
                      <span>重复：<b>{item.duplicates}</b></span>
                      <span>噪音过滤：<b>{item.noiseBlocked}</b></span>
                      <span>失效链接：<b>{item.deadLinks}</b></span>
                      <span>LLM 失败：<b>{item.llmFailed}</b></span>
                      <span>有效命中率：<b>{item.usefulRate}%</b></span>
                    </div>
                    <p className="source-quality-recommendation">
                      <strong>{trendLabel(item.trend)}</strong> · {item.recommendation}
                    </p>

                    <div className="source-quality-samples">
                      <SampleList title="最近低分样本" samples={item.lowSamples} empty="当前没有可展示的低分样本。" />
                      <SampleList title="最近边界样本" samples={item.midSamples} empty="当前没有可展示的边界样本。" />
                      <SampleList title="最近高分样本" samples={item.highSamples} empty="当前没有可展示的高分样本。" />
                      <SampleList title="最近精选样本" samples={item.selectedSamples} empty="当前没有可展示的精选样本。" />
                    </div>

                    <div className="source-quality-actions">
                      <span>人工决策：</span>
                      <button disabled={busy !== null} onClick={() => runAction(item, 'observe')}>继续观察</button>
                      {item.mode === 'reduced'
                        ? <button disabled={busy !== null} onClick={() => runAction(item, 'normal')}>恢复正常频率</button>
                        : <button disabled={busy !== null || !item.enabled} onClick={() => runAction(item, 'reduce')}>降低频率</button>}
                      {item.enabled
                        ? <button className="is-danger" disabled={busy !== null} onClick={() => runAction(item, 'pause')}>停用来源</button>
                        : <button disabled={busy !== null} onClick={() => runAction(item, 'resume')}>恢复启用</button>}
                      <Link href="/sources">修改栏目/抓取规则</Link>
                      <button
                        className="is-normalize"
                        disabled={busy !== null || item.managementStatus === 'normal'}
                        onClick={() => runAction(item, item.enabled ? 'normal' : 'resume')}
                      >
                        转为正常信源
                      </button>
                      <button className="is-delete-source" disabled={busy !== null} onClick={() => deleteSource(item)}>删除信源</button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SampleList({
  title,
  samples,
  empty,
}: {
  title: string
  samples: SourceQualityItem['lowSamples']
  empty: string
}) {
  return (
    <div>
      <h3>{title}</h3>
      {samples.length === 0 ? <p>{empty}</p> : (
        <ul>
          {samples.map((sample) => (
            <li key={`${sample.url}-${sample.score}`}>
              <span className="source-quality-sample-score">{sample.score} 分</span>
              {sample.url ? <a href={sample.url} target="_blank" rel="noreferrer">{sample.title}</a> : <span>{sample.title}</span>}
              {sample.commentary && <small>{sample.commentary}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
