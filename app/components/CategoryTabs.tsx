import Link from 'next/link'

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: '新作发布', label: '新作发布' },
  { value: 'IP授权', label: 'IP授权' },
  { value: '潮玩谷子', label: '潮玩谷子' },
  { value: '产业动态', label: '产业动态' },
  { value: '展会活动', label: '展会活动' },
] as const

export function CategoryTabs({
  active,
  query,
}: {
  active: string
  query: string
}) {
  return (
    <div className="category-tabs" role="tablist">
      {CATEGORIES.map((c) => {
        const params = new URLSearchParams()
        if (c.value !== 'all') params.set('category', c.value)
        if (query) params.set('q', query)
        const search = params.toString()
        const href = search ? `/?${search}` : '/'
        return (
          <Link
            key={c.value}
            href={href}
            className={`category-tab${active === c.value ? ' active' : ''}`}
            role="tab"
            aria-selected={active === c.value}
          >
            {c.label}
          </Link>
        )
      })}
    </div>
  )
}
