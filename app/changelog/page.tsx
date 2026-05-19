'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAdmin } from '../components/AdminToggle'

type ChangelogEntry = {
  id: string
  title: string
  content: string
  created_at: string
}

function getPw(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('ip-hot-admin-pw')
}

export default function ChangelogPage() {
  const { isAdmin, loaded } = useAdmin()
  const [entries, setEntries] = useState<ChangelogEntry[]>([])
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  async function fetchEntries() {
    const pw = getPw()
    if (!pw) return

    try {
      const res = await fetch('/api/admin/changelogs', {
        headers: { 'x-admin-password': pw },
      })
      if (res.ok) setEntries(await res.json())
    } catch {
      // 静默失败
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (loaded) fetchEntries()
  }, [loaded])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim() || !formContent.trim() || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/changelogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': getPw() ?? '',
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          content: formContent.trim(),
        }),
      })

      if (res.ok) {
        setFormTitle('')
        setFormContent('')
        await fetchEntries()
      }
    } catch {
      // 静默失败
    } finally {
      setSubmitting(false)
    }
  }

  function formatTime(iso: string) {
    try {
      const d = new Date(iso)
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <>
      <header className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="page-toolbar" style={{ justifyContent: 'flex-start', gap: '0.75rem' }}>
            <Link href="/" className="sidebar-link" style={{ padding: '0.5rem', width: 'auto' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="page-title font-serif" style={{ margin: 0 }}>版本迭代日志</h1>
          </div>
        </div>
        <p className="page-sub">记录每次更新的核心更改，便于后期追溯管理</p>
      </header>

      <section className="article-section">
        {loaded && isAdmin && (
          <form
            onSubmit={handleSubmit}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-light)',
              borderRadius: 12,
              padding: '1.25rem 1.5rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text)' }}>
              新增日志
            </h3>
            <input
              type="text"
              placeholder="更改标题（如：修复 checkbox 不显示对勾）"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              style={{ marginBottom: '0.75rem' }}
              maxLength={200}
            />
            <textarea
              placeholder="更改内容详情（如：ArticleActions.tsx checked 从 {selected} 改为 {!!selected}）"
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={3}
              style={{ marginBottom: '0.75rem', resize: 'vertical' }}
              maxLength={2000}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={submitting || !formTitle.trim() || !formContent.trim()}
                className="admin-submit"
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                }}
              >
                {submitting ? '提交中…' : '记录更新'}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="empty-state">加载中…</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">暂无日志。提交第一次更新后会自动出现在这里。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {entries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 12,
                  padding: '1.25rem 1.5rem',
                }}
              >
                <div className="article-meta">
                  <span>{formatTime(entry.created_at)}</span>
                </div>
                <h2
                  className="article-title font-serif"
                  style={{ fontSize: '1rem', marginBottom: '0.5rem' }}
                >
                  {entry.title}
                </h2>
                <p className="article-summary" style={{ whiteSpace: 'pre-wrap' }}>
                  {entry.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
