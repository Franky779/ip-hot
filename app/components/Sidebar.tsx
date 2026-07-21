'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { useAdmin } from './AdminToggle'

type NavRole = 'public' | 'admin'

type NavItem = {
  href: string
  label: string
  role: NavRole
  icon: ReactNode
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/',
    label: '实时快讯',
    role: 'public',
    icon: (
      <svg {...iconProps}>
        <path d="M4 19h16M4 12h16M4 5h16" />
      </svg>
    ),
  },
  {
    href: '/sources',
    label: '管理信息源',
    role: 'admin',
    icon: (
      <svg {...iconProps}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: '/monitor',
    label: '运营监控',
    role: 'admin',
    icon: (
      <svg {...iconProps}>
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
        <path d="M6 10l4 4 4-5 4 3" />
      </svg>
    ),
  },
  {
    href: '/changelog',
    label: '版本迭代日志',
    role: 'admin',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
]

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname()
  const { isAdmin, loaded } = useAdmin()

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.role === 'public') return true
    return loaded && isAdmin
  })

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="sidebar-brand-icon">资</span>
        <span className="sidebar-brand-text">IP 行业资讯快报</span>
      </Link>

      <nav className="sidebar-nav" aria-label="全局导航">
        {visibleItems.map((item) => {
          const isActive = isActivePath(pathname, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${isActive ? ' active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  )
}
