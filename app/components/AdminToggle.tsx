'use client'

import { useState, useEffect } from 'react'

const ADMIN_KEY = 'ip-hot-admin'
export const ADMIN_PW_KEY = 'ip-hot-admin-pw'

export function useAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setIsAdmin(localStorage.getItem(ADMIN_KEY) === '1')
    setLoaded(true)
  }, [])

  return { isAdmin, loaded }
}

export function AdminToggle() {
  const [showInput, setShowInput] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { isAdmin, loaded } = useAdmin()

  if (!loaded) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      localStorage.setItem(ADMIN_KEY, '1')
      localStorage.setItem(ADMIN_PW_KEY, password)
      setShowInput(false)
      setPassword('')
      window.location.reload()
    } else {
      setError('密码错误')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_KEY)
    localStorage.removeItem(ADMIN_PW_KEY)
    window.location.reload()
  }

  if (isAdmin) {
    return (
      <button
        onClick={handleLogout}
        className="admin-toggle-btn admin-active"
        title="退出管理"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowInput(true)}
        className="admin-toggle-btn"
        title="管理入口"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>

      {showInput && (
        <div className="admin-modal-overlay" onClick={() => setShowInput(false)}>
          <form
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h3>管理验证</h3>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              autoFocus
            />
            {error && <span className="admin-error">{error}</span>}
            <div className="admin-modal-btns">
              <button type="button" onClick={() => setShowInput(false)}>
                取消
              </button>
              <button type="submit" className="admin-submit">
                确认
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
