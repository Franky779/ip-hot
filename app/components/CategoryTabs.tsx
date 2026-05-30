'use client'

import Link from 'next/link'
import { useAdmin } from './AdminToggle'

const ALL_CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: '创作/上新', label: '创作/上新' },
  { value: 'IP/品牌/授权', label: 'IP/品牌/授权' },
  { value: '潮玩谷子', label: '潮玩谷子' },
  { value: '零售/渠道', label: '零售/渠道' },
  { value: '影视综艺', label: '影视综艺' },
  { value: '游戏/体育', label: '游戏/体育' },
  { value: 'AI/新技术', label: 'AI/新技术' },
  { value: '展会活动', label: '展会活动' },
  { value: '文旅及商品', label: '文旅及商品' },
  { value: '艺术/亚文化', label: '艺术/亚文化' },
  { value: '政策规则', label: '政策规则' },
  { value: '版权保护', label: '版权保护' },
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
