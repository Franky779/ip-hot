'use client'

import { useState } from 'react'

interface EditModalProps {
  id: string
  title_cn: string
  summary_cn: string
  commentary: string
  category: string
  onClose: () => void
}

const CATEGORIES = ['新作发布', 'IP/品牌/授权', '潮玩谷子', '影视综艺', '展会活动', '文旅及商品', '待分类']

export function EditModal({ id, title_cn, summary_cn, commentary, category, onClose }: EditModalProps) {
  const [form, setForm] = useState({ title_cn, summary_cn, commentary, category })
  const [saving, setSaving] = useState(false)

  const recordLearning = async (correctedCategory: string) => {
    // 分类没变，不记录
    if (correctedCategory === category) return

    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    try {
      await fetch('/api/admin/record-learning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': pw,
        },
        body: JSON.stringify({
          article_id: id,
          original_title: title_cn,
          original_category: category,
          corrected_category: correctedCategory,
        }),
      })
    } catch (e) {
      console.error('[Learning] 记录学习行为失败:', e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const pw = localStorage.getItem('ip-hot-admin-pw') || ''
    const res = await fetch('/api/admin/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ id, ...form }),
    })
    setSaving(false)

    if (res.ok) {
      // 异步记录学习行为（不阻塞页面刷新）
      recordLearning(form.category)
      window.location.reload()
    } else {
      alert('保存失败')
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <h3>编辑资讯</h3>

        <label>标题</label>
        <input
          type="text"
          value={form.title_cn}
          onChange={(e) => setForm({ ...form, title_cn: e.target.value })}
        />

        <label>分类</label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <label>摘要</label>
        <textarea
          rows={3}
          value={form.summary_cn}
          onChange={(e) => setForm({ ...form, summary_cn: e.target.value })}
        />

        <label>推荐理由</label>
        <textarea
          rows={2}
          value={form.commentary}
          onChange={(e) => setForm({ ...form, commentary: e.target.value })}
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
