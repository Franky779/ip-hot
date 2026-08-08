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
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="6" x2="12" y2="12" />
        <line x1="12" y1="12" x2="16" y2="14" />
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
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="6" x2="12" y2="12" />
        <line x1="12" y1="12" x2="16" y2="14" />
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
    label: '数据',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/talks',
    label: '专业',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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
]

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin, loaded } = useAdmin()

  return (
    <>
      {/* Mobile top bar (brand + theme/admin toggles) */}
      <div className="mobile-topbar">
        <Link href="/" className="mobile-topbar-brand">
          <img
            className="sidebar-brand-icon"
            src="/laojia-ip-avatar.jpg"
            alt="老贾"
          />
          <span className="sidebar-brand-text">新文创老贾聊IP</span>
        </Link>
        <div className="mobile-topbar-actions">
          <AdminToggle />
          <ThemeToggle />
        </div>
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
            <span>行业日报</span>
          </Link>
          <Link href="/research" className={`sidebar-link${pathname === '/research' ? ' active' : ''}`}>
            <span className="sidebar-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </span>
            <span>数据分析</span>
          </Link>
          <Link href="/talks" className={`sidebar-link${pathname === '/talks' ? ' active' : ''}`}>
            <span className="sidebar-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </span>
            <span>专业知识</span>
          </Link>
          <Link href="/about" className={`sidebar-link${pathname === '/about' ? ' active' : ''}`}>
            <span className="sidebar-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span>关于老贾</span>
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
                <span>[管理]信息源</span>
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
                <span>[管理]资讯处理</span>
              </Link>
              <Link
                href="/admin/talks"
                className={`sidebar-link${pathname === '/admin/talks' ? ' active' : ''}`}
              >
                <span className="sidebar-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </span>
                <span>[管理]有话说</span>
              </Link>
              <Link
                href="/admin/analytics"
                className={`sidebar-link${pathname === '/admin/analytics' ? ' active' : ''}`}
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
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </span>
                <span>[管理]数据分析</span>
              </Link>
              <Link
                href="/admin/review"
                className={`sidebar-link${pathname === '/admin/review' ? ' active' : ''}`}
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
                    <line x1="10" y1="9" x2="9" y2="9" />
                  </svg>
                </span>
                <span>[管理]人工复核</span>
              </Link>
              <a
                href={process.env.NEXT_PUBLIC_UMAMI_URL || 'https://stats.laojia-ip.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="sidebar-link"
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
                    <path d="M18 20V10" />
                    <path d="M12 20V4" />
                    <path d="M6 20v-6" />
                  </svg>
                </span>
                <span>数据后台</span>
              </a>
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
              <span className="mobile-bottom-nav-label">资讯</span>
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
              href="/admin/analytics"
              className={`mobile-bottom-nav-link${pathname === '/admin/analytics' ? ' active' : ''}`}
              aria-current={pathname === '/admin/analytics' ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">数据</span>
            </Link>
            <Link
              href="/admin/review"
              className={`mobile-bottom-nav-link${pathname === '/admin/review' ? ' active' : ''}`}
              aria-current={pathname === '/admin/review' ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">复核</span>
            </Link>
            <a
              href={process.env.NEXT_PUBLIC_UMAMI_URL || 'https://stats.laojia-ip.com'}
              target="_blank"
              rel="noopener noreferrer"
              className="mobile-bottom-nav-link"
            >
              <span className="mobile-bottom-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 20V10" />
                  <path d="M12 20V4" />
                  <path d="M6 20v-6" />
                </svg>
              </span>
              <span className="mobile-bottom-nav-label">后台</span>
            </a>
          </>
        )}
      </nav>
    </>
  )
}
