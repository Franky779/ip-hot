'use client'

import { useCallback, useEffect, useState } from 'react'

// LLM 调用预算面板：查看用量与上限，必要时调整或临时停用熔断。
// 数据来自 /api/admin/llm-budget，与 lib/llm-budget.ts 的 BudgetSnapshot 结构一致。

type BudgetSnapshot = {
  purpose: string
  enabled: boolean
  allowed: boolean
  tripped: 'minute' | 'hour' | 'day' | null
  limits: { minute: number; hour: number; day: number }
  usage: { minute: number; hour: number; day: number }
  today: {
    total: number
    ok: number
    failed: number
    pending: number
    promptTokens: number
    completionTokens: number
  }
}

const PURPOSE_LABELS: Record<string, string> = {
  summarize: '摘要与评分',
  prefilter: '预筛',
  score: '评分',
  relate: '事件归组',
}

function readPassword(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('ip-hot-admin-pw') || ''
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

export default function LlmBudgetPanel() {
  const [budgets, setBudgets] = useState<BudgetSnapshot[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { minute: string; hour: string; day: string }>>({})
  const [purging, setPurging] = useState(false)

  const load = useCallback(async () => {
    const password = readPassword()
    if (!password) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/admin/llm-budget', {
        cache: 'no-store',
        headers: { 'x-admin-password': password },
      })
      if (!res.ok) {
        setError(`读取失败（${res.status}）`)
        setLoading(false)
        return
      }
      const data = (await res.json()) as { budgets?: BudgetSnapshot[] }
      const list = data.budgets ?? []
      setBudgets(list)
      setDrafts((current) => {
        const next = { ...current }
        for (const item of list) {
          if (next[item.purpose]) continue
          next[item.purpose] = {
            minute: String(item.limits.minute),
            hour: String(item.limits.hour),
            day: String(item.limits.day),
          }
        }
        return next
      })
      setError(null)
    } catch {
      setError('读取失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30000)
    return () => clearInterval(timer)
  }, [load])

  const save = async (purpose: string, patch: Record<string, unknown>) => {
    setSaving(purpose)
    try {
      const res = await fetch('/api/admin/llm-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': readPassword() },
        body: JSON.stringify({ purpose, ...patch }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) {
        alert(`保存失败：${result?.error || '未知错误'}`)
        return
      }
      await load()
    } catch (e) {
      alert(`保存失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(null)
    }
  }

  const handleSaveLimits = (purpose: string) => {
    const draft = drafts[purpose]
    if (!draft) return
    const minute = Number(draft.minute)
    const hour = Number(draft.hour)
    const day = Number(draft.day)
    if (![minute, hour, day].every((value) => Number.isInteger(value) && value >= 0)) {
      alert('上限必须是非负整数')
      return
    }
    void save(purpose, { minute, hour, day })
  }

  const handlePurge = async () => {
    if (!confirm('清理 30 天前的调用回执？只影响统计历史，不影响文章内容。')) return
    setPurging(true)
    try {
      const res = await fetch('/api/admin/llm-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': readPassword() },
        body: JSON.stringify({ action: 'purge', retentionDays: 30 }),
      })
      const result = await res.json().catch(() => null)
      alert(res.ok ? `已清理 ${result?.deleted ?? 0} 条旧回执。` : `清理失败：${result?.error || '未知错误'}`)
      await load()
    } catch (e) {
      alert(`清理失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPurging(false)
    }
  }

  if (loading) return <p className="empty-state">正在读取 LLM 用量…</p>
  if (error) return <p className="empty-state">{error}</p>
  if (!budgets || budgets.length === 0) return null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <h2 className="monitor-section-title" style={{ margin: 0 }}>LLM 调用预算</h2>
        <button className="monitor-action-btn" onClick={handlePurge} disabled={purging}>
          {purging ? '清理中…' : '清理 30 天前回执'}
        </button>
      </div>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        分钟 / 小时 / 天三级上限，任一超限即暂停该类模型调用并告警；文章保持原状，下一轮自动重试。相同输入不会重复调用。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: '860px', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.5rem' }}>用途</th>
              <th style={{ padding: '0.5rem' }}>今日调用 / 成功 / 失败</th>
              <th style={{ padding: '0.5rem' }}>分钟</th>
              <th style={{ padding: '0.5rem' }}>小时</th>
              <th style={{ padding: '0.5rem' }}>天</th>
              <th style={{ padding: '0.5rem' }}>今日 tokens</th>
              <th style={{ padding: '0.5rem' }}>状态</th>
              <th style={{ padding: '0.5rem' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {budgets.map((item) => {
              const draft = drafts[item.purpose]
              return (
                <tr key={item.purpose} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.625rem 0.5rem' }}>{PURPOSE_LABELS[item.purpose] ?? item.purpose}</td>
                  <td style={{ padding: '0.625rem 0.5rem' }}>
                    {formatNumber(item.today.total)} / {formatNumber(item.today.ok)} / {formatNumber(item.today.failed)}
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem' }}>
                    {formatNumber(item.usage.minute)} / <input
                      className="monitor-action-btn"
                      style={{ width: '4.5rem' }}
                      value={draft?.minute ?? String(item.limits.minute)}
                      onChange={(e) => setDrafts((current) => ({ ...current, [item.purpose]: { ...(current[item.purpose] ?? { minute: '', hour: '', day: '' }), minute: e.target.value } }))}
                      inputMode="numeric"
                      aria-label={`${item.purpose} 分钟上限`}
                    />
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem' }}>
                    {formatNumber(item.usage.hour)} / <input
                      className="monitor-action-btn"
                      style={{ width: '5rem' }}
                      value={draft?.hour ?? String(item.limits.hour)}
                      onChange={(e) => setDrafts((current) => ({ ...current, [item.purpose]: { ...(current[item.purpose] ?? { minute: '', hour: '', day: '' }), hour: e.target.value } }))}
                      inputMode="numeric"
                      aria-label={`${item.purpose} 小时上限`}
                    />
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem' }}>
                    {formatNumber(item.usage.day)} / <input
                      className="monitor-action-btn"
                      style={{ width: '5.5rem' }}
                      value={draft?.day ?? String(item.limits.day)}
                      onChange={(e) => setDrafts((current) => ({ ...current, [item.purpose]: { ...(current[item.purpose] ?? { minute: '', hour: '', day: '' }), day: e.target.value } }))}
                      inputMode="numeric"
                      aria-label={`${item.purpose} 每天上限`}
                    />
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem' }}>
                    {formatNumber(item.today.promptTokens + item.today.completionTokens)}
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem', color: item.allowed ? '#2e9d5a' : '#e94560' }}>
                    {!item.enabled ? '已停用熔断' : item.allowed ? '正常' : `已熔断（${item.tripped === 'minute' ? '分钟' : item.tripped === 'hour' ? '小时' : '天'}窗口）`}
                  </td>
                  <td style={{ padding: '0.625rem 0.5rem', display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                    <button
                      className="monitor-action-btn"
                      onClick={() => handleSaveLimits(item.purpose)}
                      disabled={saving === item.purpose}
                    >
                      {saving === item.purpose ? '保存中…' : '保存上限'}
                    </button>
                    <button
                      className="monitor-action-btn"
                      style={{ color: item.enabled ? '#e94560' : '#2e9d5a', borderColor: item.enabled ? '#e94560' : '#2e9d5a' }}
                      onClick={() => void save(item.purpose, { enabled: !item.enabled })}
                      disabled={saving === item.purpose}
                    >
                      {item.enabled ? '停用熔断' : '启用熔断'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
