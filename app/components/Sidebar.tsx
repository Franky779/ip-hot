'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { AdminToggle, useAdmin } from './AdminToggle'

const NAV_ITEMS = [
  {
    href: '/',
    label: '全球快讯',
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

const MOBILE_NAV_ITEMS = [
  {
    href: '/',
    label: '快讯',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19h16M4 12h16M4 5h16" />
      </svg>
    ),
  },
  {
    href: '/daily',
    label: '日报',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    href: '/research',
    label: '研究',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: '/talks',
    label: '有话说',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    href: '/about',
    label: '关于',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: '/feedback',
    label: '反馈',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      </svg>
    ),
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin, loaded } = useAdmin()

  return (
    <>
      {/* Mobile top bar (brand only; navigation lives in the bottom tab bar) */}
      <div className="mobile-topbar">
        <Link href="/" className="mobile-topbar-brand">
          <img
            className="sidebar-brand-icon"
            src="/laojia-ip-avatar.jpg"
            alt="老贾"
          />
          <span className="sidebar-brand-text">新文创老贾聊IP</span>
        </Link>
      </div>

      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="sidebar">
        <Link href="/" className="sidebar-brand">
          <img
            className="sidebar-brand-icon"
            src="/laojia-ip-avatar.jpg"
            alt="老贾"
          />
          <span className="sidebar-brand-text">
            新文创老贾聊IP
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
          <Link href="/daily" className={`sidebar-link${pathname === '/daily' ? ' active' : ''}`}>
            <span className="sidebar-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </span>
            <span>IP日报</span>
          </Link>
          <Link href="/research" className={`sidebar-link${pathname === '/research' ? ' active' : ''}`}>
            <span className="sidebar-icon">◆</span>
            <span>深度研究</span>
          </Link>
          <Link href="/talks" className={`sidebar-link${pathname === '/talks' ? ' active' : ''}`}>
            <span className="sidebar-icon">✎</span>
            <span>老贾有话说</span>
          </Link>
          <Link href="/about" className={`sidebar-link${pathname === '/about' ? ' active' : ''}`}>
            <span className="sidebar-icon">◆</span>
            <span>关于老贾</span>
          </Link>
          <Link href="/feedback" className={`sidebar-link${pathname === '/feedback' ? ' active' : ''}`}>
            <span className="sidebar-icon">✎</span>
            <span>反馈</span>
          </Link>
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
                href="/admin/talks"
                className={`sidebar-link${pathname === '/admin/talks' ? ' active' : ''}`}
              >
                <span className="sidebar-icon">✎</span>
                <span>管理有话说</span>
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
          <AdminToggle />
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-bottom-nav">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-link${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">{item.icon}</span>
              <span className="mobile-bottom-nav-label">{item.label}</span>
            </Link>
          )
        })}
        {loaded && isAdmin && (
          <>
            <Link
              href="/sources"
              className={`mobile-bottom-nav-link${pathname === '/sources' ? ' active' : ''}`}
              aria-current={pathname === '/sources' ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">信息源</span>
            </Link>
            <Link
              href="/admin/talks"
              className={`mobile-bottom-nav-link${pathname === '/admin/talks' ? ' active' : ''}`}
              aria-current={pathname === '/admin/talks' ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">有话说</span>
            </Link>
            <Link
              href="/monitor"
              className={`mobile-bottom-nav-link${pathname === '/monitor' ? ' active' : ''}`}
              aria-current={pathname === '/monitor' ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                  <path d="M6 10l4 4 4-5 4 3" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">监控</span>
            </Link>
          </>
        )}
      </nav>
    </>
  )
}