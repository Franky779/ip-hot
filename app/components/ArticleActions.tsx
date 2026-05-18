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
  selected?: boolean
  onToggle?: () => void
}

export function ArticleActions({ id, title_cn, summary_cn, commentary, category, selected, onToggle }: ArticleActionsProps) {
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
