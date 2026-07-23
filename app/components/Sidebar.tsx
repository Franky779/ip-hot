'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { useAdmin } from './AdminToggle'

const NAV_ITEMS = [
  {
    href: '/',
    label: '实时快讯',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 19h16M4 12h16M4 5h16" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin, loaded } = useAdmin()

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="sidebar-brand-icon">资</span>
        <span className="sidebar-brand-text">
          IP 行业资讯快报
        </span>
      </Link>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
        {loaded && isAdmin && (
          <>
            <Link
              href="/sources"
              className={`sidebar-link${pathname === '/sources' ? ' active' : ''}`}
            >
              <span className="sidebar-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </span>
              <span>管理信息源</span>
            </Link>
            <Link
              href="/monitor"
              className={`sidebar-link${pathname === '/monitor' ? ' active' : ''}`}
            >
              <span className="sidebar-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                  <path d="M6 10l4 4 4-5 4 3" />
                </svg>
              </span>
              <span>运营监控</span>
            </Link>
          </>
        )}
      </nav>
      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  )
}
