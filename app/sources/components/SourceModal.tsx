'use client'

import { useState } from 'react'

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
  sort_order: number
}

interface SourceModalProps {
  source?: Source | null
  onClose: () => void
  onSaved: () => void
}

const REGIONS = [
  { value: 'domestic', label: '国内' },
  { value: 'overseas', label: '海外' },
  { value: 'japan', label: '日本' },
]

export function SourceModal({ source, onClose, onSaved }: SourceModalProps) {
  const isEdit = !!source?.id
  const [form, setForm] = useState<Source>({
    section_id: source?.section_id ?? 'domestic-acg',
    section_title: source?.section_title ?? '动漫 / ACG 垂直媒体',
    region: source?.region ?? 'domestic',
    name: source?.name ?? '',
    url: source?.url ?? '',
    type: source?.type ?? '',
    description: source?.description ?? '',
    method: source?.method ?? '',
    sort_order: source?.sort_order ?? 0,
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!form.name || !form.url || !form.type || !form.section_id || !form.section_title) {
      alert('请填写必填字段')
      return
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
      body: JSON.stringify(isEdit ? { id: source!.id, ...form } : form),
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
      <div className="admin-modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? '编辑信息源' : '新增信息源'}</h3>

        <label>网站名称</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="如：三文娱"
        />

        <label>网址</label>
        <input
          type="text"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
          placeholder="https://..."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label>地区</label>
            <select
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label>排序</label>
            <input
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        <label>分类 ID</label>
        <input
          type="text"
          value={form.section_id}
          onChange={(e) => setForm({ ...form, section_id: e.target.value })}
          placeholder="如：domestic-acg"
        />

        <label>分类名称</label>
        <input
          type="text"
          value={form.section_title}
          onChange={(e) => setForm({ ...form, section_title: e.target.value })}
          placeholder="如：动漫 / ACG 垂直媒体"
        />

        <label>网站定位</label>
        <input
          type="text"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          placeholder="如：动漫/IP垂直媒体"
        />

        <label>收录原因 / 简介</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <label>抓取方式</label>
        <input
          type="text"
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
          placeholder="如：web-access CDP搜索"
        />

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
