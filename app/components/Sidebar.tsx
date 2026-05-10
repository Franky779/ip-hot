import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

const NAV_ITEMS = [
  {
    href: '/',
    label: '资讯',
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

const EXTERNAL_ITEMS = [
  {
    href: 'https://laojia-ip.com',
    label: '返回主站',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
]

export function Sidebar() {
  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-brand">
        <span className="sidebar-brand-icon">资</span>
        <span className="sidebar-brand-text">
          IP 行业资讯快报
        </span>
      </Link>
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="sidebar-link active"
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
        {EXTERNAL_ITEMS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="sidebar-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="sidebar-footer">
        <ThemeToggle />
      </div>
    </aside>
  )
}
