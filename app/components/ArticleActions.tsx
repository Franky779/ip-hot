'use client'

import { useState } from 'react'
import { useAdmin, ADMIN_PW_KEY } from './AdminToggle'
import { EditModal } from './EditModal'

interface ArticleActionsProps {
  id: string
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  category: string | null
  relevance_score: number | null
  selected?: boolean
  onToggle?: () => void
}

export function ArticleActions({ id, title_cn, summary_cn, commentary, category, relevance_score, selected, onToggle }: ArticleActionsProps) {
  const { isAdmin, loaded } = useAdmin()
  const [showEdit, setShowEdit] = useState(false)
  const [deleted, setDeleted] = useState(false)

  if (!loaded || !isAdmin) return null

  const handleDelete = async () => {
    if (!confirm('确定删除这条资讯？')) return
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''

    const res = await fetch('/api/admin/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ id }),
    })

    if (res.ok) {
      setDeleted(true)
      setTimeout(() => {
        const el = document.getElementById(`article-${id}`)
        if (el) el.style.display = 'none'
      }, 300)
    } else {
      alert('删除失败')
    }
  }

  const handleScoreChange = async () => {
    const newScore = prompt(`当前评分: ${relevance_score ?? '无'}\n输入新评分 (0-10):`)
    if (newScore === null) return
    const score = parseInt(newScore, 10)
    if (isNaN(score) || score < 0 || score > 10) {
      alert('评分必须是 0-10 的整数')
      return
    }
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
    const res = await fetch('/api/admin/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pw,
      },
      body: JSON.stringify({ id, relevance_score: score }),
    })
    if (res.ok) {
      window.location.reload()
    } else {
      alert('改分失败')
    }
  }

  if (deleted) return null

  return (
    <>
      <div className="article-actions">
        <label className="article-checkbox" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle?.()
            }}
          />
        </label>
        <button
          className="article-action-btn edit"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowEdit(true)
          }}
        >
          编辑
        </button>
        <button
          className="article-action-btn edit"
          style={{ color: '#c45c26', borderColor: '#c45c26' }}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleScoreChange()
          }}
        >
          改分
        </button>
        <button
          className="article-action-btn delete"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleDelete()
          }}
        >
          删除
        </button>
      </div>
      {showEdit && (
        <EditModal
          id={id}
          title_cn={title_cn ?? ''}
          summary_cn={summary_cn ?? ''}
          commentary={commentary ?? ''}
          category={category ?? ''}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  )
}
