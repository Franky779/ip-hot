'use client'

import Link from 'next/link'
import { useAdmin } from './AdminToggle'

const ALL_CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: '新作发布', label: '新作发布' },
  { value: 'IP/品牌/授权', label: 'IP/品牌/授权' },
  { value: '潮玩谷子', label: '潮玩谷子' },
  { value: '影视综艺', label: '影视综艺' },
  { value: '展会活动', label: '展会活动' },
  { value: '文旅及商品', label: '文旅及商品' },
  { value: '待分类', label: '待分类' },
] as const

export function CategoryTabs({
  active,
  query,
}: {
  active: string
  query: string
}) {
  const { isAdmin, loaded } = useAdmin()
  const categories = loaded && !isAdmin
    ? ALL_CATEGORIES.filter((c) => c.value !== '待分类')
    : ALL_CATEGORIES

  return (
    <div className="category-tabs" role="tablist">
      {categories.map((c) => {
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
