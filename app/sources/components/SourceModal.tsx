'use client'

import { useMemo, useState } from 'react'
import { getSourceSchedule, writeSourceSchedule, EXECUTION_MODE_LABELS, SCHEDULE_TIER_LABELS, type SourceExecutionMode, type SourceScheduleTier } from '@/lib/source-schedule'
import { FETCH_TYPE_OPTIONS, REGION_OPTIONS } from '@/lib/source-options'

interface Source {
  id?: string
  section_id: string
  section_title: string
  region: string
  name: string
  url: string
  type: string
  description: string
  method: string
  fetch_type: 'rss' | 'web'
  enabled: boolean
  sort_order: number
  platform?: string
  x_handle?: string
  x_user_id?: string
  x_profile_url?: string
  official_evidence_url?: string
  is_official?: boolean
  verification_status?: 'unverified' | 'verified' | 'revoked'
  verified_by?: string
  verification_notes?: string
}

interface SourceModalProps {
  source?: Source | null
  sectionOptions: Array<{ id: string; title: string }>
  onClose: () => void
  onSaved: () => void
}

export function SourceModal({ source, sectionOptions, onClose, onSaved }: SourceModalProps) {
  const isEdit = !!source?.id
  const initialSchedule = getSourceSchedule({
    name: source?.name ?? '',
    url: source?.url ?? '',
    method: source?.method,
    type: source?.type,
    enabled: source?.enabled ?? false,
  })
  const [form, setForm] = useState<Source>({
    section_id: source?.section_id ?? 'domestic-acg',
    section_title: source?.section_title ?? '动漫 / ACG 垂直媒体',
    region: source?.region ?? 'domestic',
    name: source?.name ?? '',
    url: source?.url ?? '',
    type: source?.type ?? '',
    description: source?.description ?? '',
    method: source?.method ?? '',
    fetch_type: source?.fetch_type ?? 'web',
    enabled: source?.enabled ?? false,
    sort_order: source?.sort_order ?? 0,
    platform: source?.platform ?? '',
    x_handle: source?.x_handle ?? '',
    x_user_id: source?.x_user_id ?? '',
    x_profile_url: source?.x_profile_url ?? '',
    official_evidence_url: source?.official_evidence_url ?? '',
    verification_status: source?.verification_status ?? 'unverified',
    verified_by: source?.verified_by ?? '',
    verification_notes: source?.verification_notes ?? '',
    is_official: source?.is_official ?? false,
  })
  const [executionMode, setExecutionMode] = useState<SourceExecutionMode>(initialSchedule.executionMode)
  const [scheduleTier, setScheduleTier] = useState<SourceScheduleTier>(initialSchedule.tier)
  const [saving, setSaving] = useState(false)

  // 分类下拉：与信息源管理页"行业类型"筛选共用同一份分类清单。
  const allSectionOptions = useMemo(() => {
    const options = [...sectionOptions]
    if (source?.section_id && !options.some((option) => option.id === source.section_id)) {
      options.unshift({ id: source.section_id, title: source.section_title })
    }
    return options
  }, [sectionOptions, source])

  const [sectionChoice, setSectionChoice] = useState<string>(() => {
    if (!source?.section_id) return ''
    return allSectionOptions.some((option) => option.id === source.section_id)
      ? source.section_id
      : 'custom'
  })

  const handleSectionChange = (value: string) => {
    setSectionChoice(value)
    if (value === 'custom') return
    const selected = allSectionOptions.find((option) => option.id === value)
    if (selected) {
      setForm((current) => ({ ...current, section_id: selected.id, section_title: selected.title }))
    }
  }

  const handleSave = async () => {
    if (!form.name || !form.url) {
      alert('请填写网站名称和网址')
      return
    }
    if (!form.region) {
      alert('请选择地区')
      return
    }
    if (!sectionChoice) {
      alert('请选择分类')
      return
    }
    if (sectionChoice === 'custom') {
      if (!form.section_id || !form.section_title) {
        alert('请填写新分类的 ID 和名称')
        return
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(form.section_id)) {
        alert('分类 ID 只能包含英文、数字、横杠或下划线，如 domestic-acg')
        return
      }
    }

    setSaving(true)
    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    const url = isEdit ? '/api/admin/sources' : '/api/admin/sources'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify(isEdit ? {
        id: source!.id,
        ...form,
        enabled: executionMode !== 'paused',
        method: writeSourceSchedule(form.method, { executionMode, tier: scheduleTier }),
      } : {
        ...form,
        enabled: executionMode !== 'paused',
        method: writeSourceSchedule(form.method, { executionMode, tier: scheduleTier }),
      }),
    })
    setSaving(false)

    if (res.ok) {
      onSaved()
      onClose()
    } else {
      const err = await res.json().catch(() => ({}))
      alert('保存失败: ' + (err.error || '未知错误'))
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal source-edit-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? '编辑信息源' : '新增信息源'}</h3>

        <p className="source-form-hint">带 * 的为必填项；只填这几项即可保存，其他字段无需填写。</p>

        <div className="source-form-field">
          <label>网站名称 *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="如：三文娱"
          />
        </div>

        <div className="source-form-field">
          <label>网址 *</label>
          <input
            type="text"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://..."
          />
        </div>

        <div className="source-form-field">
          <label>地区 *</label>
          <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="source-form-hint">与列表上方"来源地区"筛选选项一致。</p>
        </div>

        <div className="source-form-field">
          <label>分类 *</label>
          <select value={sectionChoice} onChange={(e) => handleSectionChange(e.target.value)}>
            <option value="" disabled>请选择分类（与"行业类型"筛选一致）</option>
            {allSectionOptions.map((section) => (
              <option key={section.id} value={section.id}>{section.title}</option>
            ))}
            <option value="custom">＋ 新建分类（自定义）</option>
          </select>
          <p className="source-form-hint">直接选现用分类即可，分类 ID 和名称会自动填入。</p>
        </div>

        {sectionChoice === 'custom' && (
          <>
            <div className="source-form-field">
              <label>新分类 ID *</label>
              <input
                type="text"
                value={form.section_id}
                onChange={(e) => setForm({ ...form, section_id: e.target.value })}
                placeholder="如：domestic-acg（英文、数字、横杠）"
              />
            </div>
            <div className="source-form-field">
              <label>新分类名称 *</label>
              <input
                type="text"
                value={form.section_title}
                onChange={(e) => setForm({ ...form, section_title: e.target.value })}
                placeholder="如：动漫 / ACG 垂直媒体"
              />
            </div>
          </>
        )}

        <div className="source-form-field">
          <label>自动抓取类型 *</label>
          <select
            value={form.fetch_type}
            onChange={(e) => setForm({ ...form, fetch_type: e.target.value as 'rss' | 'web' })}
          >
            {FETCH_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="source-form-hint">RSS＝订阅源自动定时抓取；普通网页＝从页面提取资讯链接。</p>
        </div>

        <div className="source-form-field">
          <label>执行方式 *</label>
          <select
            value={executionMode}
            onChange={(e) => setExecutionMode(e.target.value as SourceExecutionMode)}
          >
            {(Object.entries(EXECUTION_MODE_LABELS) as Array<[SourceExecutionMode, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="source-form-hint">云端＝服务器定时抓取；本地 CDP＝需本地浏览器；人工＝手动处理；已暂停＝不自动抓。</p>
        </div>

        <div className="source-form-field">
          <label>抓取频率 *</label>
          <select value={scheduleTier} onChange={(e) => setScheduleTier(e.target.value as SourceScheduleTier)}>
            {(Object.entries(SCHEDULE_TIER_LABELS) as Array<[SourceScheduleTier, string]>).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="source-form-hint">执行方式为"已暂停"或"人工处理"时不参与自动抓取。</p>
        </div>

        <div className="source-form-field">
          <label>
            <input
              type="checkbox"
              checked={form.is_official ?? false}
              onChange={(e) => setForm({ ...form, is_official: e.target.checked })}
            />
            {' '}官方号
          </label>
          <p className="source-form-hint">勾选后，该来源的所有文章将跳过相关性筛选，LLM 分类后直接展示。</p>
        </div>

        <div className="admin-modal-btns">
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="admin-submit" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
