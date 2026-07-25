'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SearchBox({
  defaultValue,
  activeCategory,
}: {
  defaultValue: string
  activeCategory: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue)

  return (
    <form
      className="search-box"
      action="/"
      method="get"
      onSubmit={(event) => {
        if (value.trim()) return
        event.preventDefault()
        router.replace('/')
      }}
    >
      {activeCategory !== 'all' && (
        <input type="hidden" name="category" value={activeCategory} />
      )}
      <input
        type="search"
        name="q"
        placeholder="搜索标题和内文概述..."
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          const wasSearching = value.trim().length > 0
          setValue(nextValue)
          if (wasSearching && nextValue.length === 0) {
            router.replace('/')
          }
        }}
        className="search-input"
        aria-label="搜索文章标题和内文概述"
      />
      <button type="submit" className="search-btn">
        搜索
      </button>
    </form>
  )
}
