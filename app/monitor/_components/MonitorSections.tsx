'use client'

import Link from 'next/link'
import type { AutoProcessorState, CronLog, LlmProgress, MonitorData, ReviewItem, SourceItem } from './types'
import { ALL_CATEGORIES, formatCountdown, formatTime, getStatusColor, getStatusLabel } from './utils'

export type SourceEditorProps = {
  getUrl: (source: SourceItem) => string
  editingId: string | null
  editValue: string
  onStartEdit: (source: SourceItem, url: string) => void
  onEditValueChange: (value: string) => void
  onCancelEdit: () => void
  onSaveUrl: (id: string) => void
  onDelete: (id: string, name: string) => void
}

export function PageHeader() {
  return (
    <header className="page-header">
      <div className="page-toolbar" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
        <Link href="/" className="sidebar-link" style={{ padding: '0.5rem', width: 'auto' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="page-title font-serif" style={{ margin: 0 }}>运营监控</h1>
      </div>
    </header>
  )
}

function AutoTriggerControls({
  llming,
  progress,
  autoProcessor,
  onManualLlm,
  onStopLlm,
}: {
  llming: boolean
  progress: LlmProgress | null
  autoProcessor: AutoProcessorState
  onManualLlm: () => void
  onStopLlm: () => void
}) {
  if (llming) {
    return (
      <>
        <button className="monitor-action-btn" onClick={onStopLlm} style={{ color: '#e94560', borderColor: '#e94560' }}>
          停止处理
        </button>
        {progress && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            已处理 {progress.processed} 条 · 剩余 {progress.remaining} 条 · 第 {progress.rounds} 轮
          </span>
        )}
      </>
    )
  }

  return (
    <>
      <button className="monitor-action-btn" onClick={onManualLlm}>手动处理LLM</button>
      <button
        className="monitor-action-btn"
        onClick={autoProcessor.toggle}
        style={{
          borderColor: autoProcessor.enabled ? '#2e9d5a' : 'var(--border)',
          color: autoProcessor.enabled ? '#2e9d5a' : 'var(--text-muted)',
        }}
        title="每3小时自动触发一次LLM处理"
      >
        {autoProcessor.enabled ? '自动处理 ON' : '自动处理 OFF'}
      </button>
      {autoProcessor.enabled && autoProcessor.remainingMs !== null && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          下次 {formatCountdown(autoProcessor.remainingMs)}
        </span>
      )}
    </>
  )
}

export function StatsCards({
  data,
  fetching,
  llming,
  progress,
  autoProcessor,
  onManualFetch,
  onManualLlm,
  onStopLlm,
}: {
  data: MonitorData
  fetching: boolean
  llming: boolean
  progress: LlmProgress | null
  autoProcessor: AutoProcessorState
  onManualFetch: () => void
  onManualLlm: () => void
  onStopLlm: () => void
  onManualReclassify?: () => void
  reclassifying?: boolean
}) {
  const task = data.todayTask
  const health = data.queueHealth
  const healthColor = health?.level === 'critical' ? '#e94560' : health?.level === 'warning' ? '#f59e0b' : '#2e9d5a'
  const healthLabel = health?.level === 'critical' ? '严重积压' : health?.level === 'warning' ? '需要关注' : '队列健康'
  const reviewStats = data.reviewStats ?? { total: 0, lowScore: 0, midScore: 0 }

  return (
    <>
      {health && health.level !== 'healthy' && (
        <div style={{ border: `1px solid ${healthColor}`, background: health.level === 'critical' ? 'rgba(233,69,96,0.08)' : 'rgba(245,158,11,0.08)', borderRadius: 10, padding: '0.875rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span className="status-dot" style={{ background: healthColor }} />
            <strong style={{ color: healthColor }}>{healthLabel}</strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>警戒线 {health.queueWarningThreshold} 条，严重线 {health.queueCriticalThreshold} 条</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {health.alerts.map((alert, index) => (
              <div key={`${alert.level}-${index}`} style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700 }}>{alert.message}</span>
                <span style={{ color: 'var(--text-muted)' }}> {alert.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <button className="monitor-action-btn" onClick={onManualFetch} disabled={fetching}>{fetching ? '抓取中…' : '手动抓取'}</button>
          </div>
        </div>
        <div className="monitor-stat-card">
          <div className="monitor-stat-value" style={{ color: healthColor }}>{data.queue}</div>
          <div className="monitor-stat-label">LLM 待处理 · {healthLabel}</div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <AutoTriggerControls llming={llming} progress={progress} autoProcessor={autoProcessor} onManualLlm={onManualLlm} onStopLlm={onStopLlm} />
          </div>
        </div>
        <div className="monitor-stat-card">
          <div className="monitor-stat-value" style={{ color: reviewStats.total > 100 ? '#f59e0b' : '#2e9d5a' }}>{reviewStats.total}</div>
          <div className="monitor-stat-label">待分类资讯</div>
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem' }}>
            <span style={{ color: '#e94560' }}>噪音 {reviewStats.lowScore}</span>
            <span style={{ color: '#888' }}>待确认 {reviewStats.midScore}</span>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button className="monitor-action-btn" onClick={onManualReclassify} disabled={reclassifying}>
              {reclassifying ? '分类中…' : '手动分类'}
            </button>
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
    </>
  )
}

export function LogsPanel({ logs, visible, onToggle }: { logs: CronLog[]; visible: boolean; onToggle: () => void }) {
  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="monitor-action-btn" onClick={onToggle}>{visible ? '隐藏日志' : '查看日志'}</button>
      </div>
      {visible && (
        <div className="cron-logs-panel">
          <h4>任务日志（最近20条）</h4>
          {logs.length === 0 ? <p className="cron-logs-empty">暂无日志</p> : (
            <table className="cron-logs-table">
              <thead><tr><th>时间</th><th>触发</th><th>抓取</th><th>入库</th><th>LLM处理</th><th>耗时</th><th>状态</th></tr></thead>
              <tbody>{logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.started_at ? new Date(log.started_at).toLocaleString('zh-CN') : '-'}</td>
                  <td>{log.trigger_type === 'manual' ? '手动' : log.trigger_type === 'manual_llm' ? '手动LLM' : log.trigger_type === 'source_add' ? '添加信源' : log.trigger_type === 'source_delete' ? '删除信源' : '定时'}</td>
                  <td>{log.fetch_total_fetched ?? 0}</td>
                  <td>{log.fetch_total_inserted ?? 0}</td>
                  <td>{log.trigger_type === 'manual_llm' ? `${log.llm_processed ?? 0} / ${log.details?.batch_total != null ? log.details.batch_total : ((log.llm_processed ?? 0) + (log.llm_failed ?? 0) || '-')}` : `${log.llm_processed ?? 0} / ${log.llm_pending ?? 0}`}</td>
                  <td>{log.ended_at && log.started_at ? `${Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s` : '-'}</td>
                  <td><span className={`cron-log-status ${log.status}`}>{log.status === 'success' ? '成功' : log.status === 'error' ? '失败' : '运行中'}</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}

export function CategoryStats({ stats }: { stats: MonitorData['categoryStats'] }) {
  const catMap = new Map(stats.map((item) => [item.category, item.count]))

  return (
    <div>
      <h2 className="monitor-section-title">分类资讯数量统计</h2>
      {stats.length === 0 ? <p className="empty-state">暂无数据</p> : (
        <table className="monitor-table">
          <thead><tr><th>分类</th><th style={{ textAlign: 'right' }}>数量</th></tr></thead>
          <tbody>{ALL_CATEGORIES.map((category) => (
            <tr key={category}><td>{category}</td><td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{catMap.get(category) || 0}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

function SourceRow({ source, showDelete, getUrl, editingId, editValue, onStartEdit, onEditValueChange, onCancelEdit, onSaveUrl, onDelete }: SourceEditorProps & { source: SourceItem; showDelete: boolean }) {
  const displayUrl = getUrl(source)
  const isEditing = editingId === source.id

  return (
    <div className="source-compact-row">
      <span className="source-compact-name">{source.name}</span>
      {isEditing ? (
        <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: 1 }}>
          <input value={editValue} onChange={(event) => onEditValueChange(event.target.value)} style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: '1px solid var(--border)', borderRadius: 4 }} />
          <button className="monitor-action-btn" onClick={() => onSaveUrl(source.id)}>确认</button>
          <button className="monitor-action-btn" onClick={onCancelEdit}>取消</button>
        </span>
      ) : (
        <span className="source-compact-url" onClick={() => onStartEdit(source, displayUrl)} title="点击编辑">{displayUrl || '(无网址)'}</span>
      )}
      {source.count7d != null && <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>{source.count7d || 0}篇/7d</span>}
      {showDelete && <button className="monitor-action-btn" onClick={() => onDelete(source.id, source.name)} style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }}>删除</button>}
    </div>
  )
}

function SourceGroup({ title, color, sources, showDelete = false, sourceEditor }: { title: string; color: string; sources: SourceItem[]; showDelete?: boolean; sourceEditor: SourceEditorProps }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />{title} · {sources.length}
      </h3>
      {sources.length === 0 ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>无</p> : (
        <div className="source-compact-list">{sources.map((source) => <SourceRow key={source.id} source={source} showDelete={showDelete} {...sourceEditor} />)}</div>
      )}
    </div>
  )
}

export function SourceHealthPanel({ data, sourceEditor }: { data: MonitorData; sourceEditor: SourceEditorProps }) {
  return (
    <div>
      <h2 className="monitor-section-title">源健康度（7天）</h2>
      <SourceGroup title="未跑通" color="#e94560" sources={data.deadSourceList} showDelete sourceEditor={sourceEditor} />
      <SourceGroup title="失效" color="#f59e0b" sources={data.failedSourceList} sourceEditor={sourceEditor} />
      <SourceGroup title="活跃" color="#2e9d5a" sources={data.activeSourceList} sourceEditor={sourceEditor} />
    </div>
  )
}

export function SourceQuality({ items }: { items?: MonitorData['sourceQuality'] }) {
  if (!items?.length) return null

  return (
    <div>
      <h2 className="monitor-section-title">信源质量（7天低分率）</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map((source) => (
          <div key={source.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: 6, background: source.rate >= 50 ? 'rgba(233,69,96,0.06)' : 'var(--bg-secondary)', border: source.rate >= 50 ? '1px solid rgba(233,69,96,0.2)' : '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{source.name}</span>
            <span style={{ fontSize: '0.8125rem', color: source.rate >= 50 ? '#e94560' : source.rate >= 30 ? '#f59e0b' : '#2e9d5a', fontVariantNumeric: 'tabular-nums' }}>{source.low}/{source.total} · {source.rate}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ReviewQueue({ items, selectedIds, reviewing, onToggleAll, onToggleOne, onDelete, onSelect, onBatchDelete, onBatchSelect }: {
  items: ReviewItem[]
  selectedIds: Set<string>
  reviewing: Record<string, string>
  onToggleAll: (checked: boolean) => void
  onToggleOne: (id: string, checked: boolean) => void
  onDelete: (item: ReviewItem) => void
  onSelect: (item: ReviewItem) => void
  onBatchDelete: () => void
  onBatchSelect: () => void
}) {
  if (items.length === 0) return null
  const allSelected = selectedIds.size === items.length && items.length > 0

  return (
    <div>
      <h2 className="monitor-section-title" style={{ color: '#f59e0b' }}>待人工复核 · {items.length}</h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>LLM 拿不准分类但觉得还有点价值（评分4-6），你来决定留不留</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', cursor: 'pointer' }}><input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />全选</label>
        {selectedIds.size > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>已选 {selectedIds.size} 条</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
          <button className="monitor-action-btn" style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }} onClick={onBatchDelete} disabled={selectedIds.size === 0}>批量删除</button>
          <button className="monitor-action-btn" style={{ fontSize: '0.6875rem' }} onClick={onBatchSelect} disabled={selectedIds.size === 0}>批量精选</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((item) => (
          <div key={item.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <input type="checkbox" checked={selectedIds.has(item.id)} onChange={(event) => onToggleOne(item.id, event.target.checked)} style={{ marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.4 }}>{item.titleCn}</div>
                  <span style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: 4, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>评分 {item.relevanceScore}</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.5 }}>{item.summaryCn}</div>
                {item.commentary && <div style={{ fontSize: '0.75rem', color: '#c97b3b', marginTop: '0.25rem' }}>推荐理由：{item.commentary}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.375rem', paddingLeft: '1.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.source} · {formatTime(item.createdAt)}</span>
              <div style={{ display: 'flex', gap: '0.375rem' }}>
                <button className="monitor-action-btn" style={{ fontSize: '0.6875rem', color: '#e94560', borderColor: '#e94560' }} onClick={() => onDelete(item)} disabled={reviewing[item.id] === 'delete'}>{reviewing[item.id] === 'delete' ? '删除中…' : '删除'}</button>
                <button className="monitor-action-btn" style={{ fontSize: '0.6875rem' }} onClick={() => onSelect(item)} disabled={reviewing[item.id] === 'select'}>{reviewing[item.id] === 'select' ? '标记中…' : '精选'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RecentErrors({ errors }: { errors: MonitorData['recentErrors'] }) {
  if (errors.length === 0) return null

  return (
    <div>
      <h2 className="monitor-section-title" style={{ color: '#e94560' }}>最近错误</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {errors.map((error) => (
          <div key={error.id} style={{ background: 'rgba(233,69,96,0.06)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 8, padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{formatTime(error.startedAt)}</div>
            <div style={{ fontSize: '0.875rem', color: '#e94560' }}>{error.errorMessage || '未知错误'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
