import Link from 'next/link'

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'IP', label: 'IP' },
  { value: '文博', label: '文博' },
  { value: '文创', label: '文创' },
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
