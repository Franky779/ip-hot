'use client'

import { useEffect, useState } from 'react'

type Mode = 'system' | 'light' | 'dark'

function applyTheme(m: Mode) {
  if (typeof document === 'undefined') return
  if (m === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', m)
  }
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const MoonIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const SystemIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
)

const SunIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

const MODES: ReadonlyArray<{ value: Mode; label: string; Icon: () => React.ReactElement }> = [
  { value: 'dark', label: '深色', Icon: MoonIcon },
  { value: 'system', label: '跟随系统', Icon: SystemIcon },
  { value: 'light', label: '浅色', Icon: SunIcon },
]

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setMode(saved as Mode)
    }
    setMounted(true)
  }, [])

  function setTheme(m: Mode) {
    localStorage.setItem('theme', m)
    setMode(m)
    applyTheme(m)
  }

  if (!mounted) return null

  return (
    <div className="theme-toggle-wrap" role="group" aria-label="主题切换">
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={`theme-toggle-btn${mode === value ? ' active' : ''}`}
          onClick={() => setTheme(value)}
          aria-label={label}
          aria-pressed={mode === value}
          title={label}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}
