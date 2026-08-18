'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

export type IpImage = { type: string; local: string }
export type IpCase = { title?: string; image?: string; date?: string }
export type IpNews = { title?: string; date?: string; url?: string }

export type IpRecord = {
  id: number
  name_cn: string
  name_en: string
  initial: string
  cover: string
  images: IpImage[]
  case_len: number
  category: string
  place_origin: string
  company: string
  one_line_intro: string
  ip_intro: string
  company_intro: string
  areas: string[]
  ages: string[]
  industries: string[]
  listing_date: string
  auth_start: string
  auth_end: string
  licensor_case_list: IpCase[]
  news_list: IpNews[]
  source_url: string
}

const LETTERS = ['', '#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

export function IpBrandClient() {
  const [data, setData] = useState<IpRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [q, setQ] = useState('')
  const [inputValue, setInputValue] = useState('')
  const [cat, setCat] = useState('')
  const [init, setInit] = useState('')

  useEffect(() => {
    fetch('/ipbrand/ips.json')
      .then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((d: IpRecord[]) => setData(d))
      .catch(() => setLoadError(true))
  }, [])

  // 搜索防抖 80ms
  useEffect(() => {
    const t = setTimeout(() => setQ(inputValue), 80)
    return () => clearTimeout(t)
  }, [inputValue])

  const cats = useMemo(() => {
    if (!data) return []
    const map = new Map<string, number>()
    data.forEach(d => {
      const c = d.category || '未分类'
      map.set(c, (map.get(c) || 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const kw = q.trim().toLowerCase()
    return data.filter(d => {
      if (kw) {
        const hay = [d.name_cn, d.name_en, d.company, d.category, d.ip_intro, d.one_line_intro]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(kw)) return false
      }
      if (cat && d.category !== cat) return false
      if (init && d.initial !== init) return false
      return true
    })
  }, [data, q, cat, init])

  return (
    <div className="ipb-page">
      <div className="ipb-topbar">
        <div className="ipb-brand">
          <div className="ipb-brand-title">IP 品牌库</div>
          <div className="ipb-brand-count">{data ? `共 ${data.length} 个 IP` : '—'}</div>
        </div>
        <div className="ipb-search-wrap">
          <input
            type="text"
            className="ipb-search-input"
            placeholder="搜 IP 名 / 版权方 / 分类 / 简介关键词…"
            autoComplete="off"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
          <svg className="ipb-search-icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div />
      </div>

      <div className="ipb-main">
        <div className="ipb-cat-row">
          <button
            className={`ipb-cat-btn${cat === '' ? ' active' : ''}`}
            onClick={() => setCat('')}
          >
            全部 ({data ? data.length : 0})
          </button>
          {cats.map(([name, count]) => (
            <button
              key={name}
              className={`ipb-cat-btn${cat === name ? ' active' : ''}`}
              onClick={() => setCat(name)}
            >
              {name} ({count})
            </button>
          ))}
        </div>

        <div className="ipb-init-row">
          {LETTERS.map(l => (
            <button
              key={l === '' ? '__all' : l}
              className={`ipb-init-btn${init === l ? ' active' : ''}`}
              onClick={() => setInit(l)}
            >
              {l === '' ? '全部' : l}
            </button>
          ))}
        </div>

        <div className="ipb-grid">
          {loadError && (
            <div className="ipb-empty">
              <div className="ipb-empty-text">数据加载失败，请刷新重试</div>
            </div>
          )}
          {!loadError && !data && <div className="ipb-loading">加载档案中…</div>}
          {data && filtered.length === 0 && (
            <div className="ipb-empty">
              <div className="ipb-empty-icon">🔍</div>
              <div className="ipb-empty-text">没有找到匹配的 IP</div>
              <div className="ipb-empty-sub">试试换关键词、清除分类或换首字母</div>
            </div>
          )}
          {data && filtered.map(d => (
            <Link key={d.id} href={`/ipbrand/detail?id=${d.id}`} className="ipb-card" title={d.name_cn}>
              <div className="ipb-card-cover">
                {d.cover ? (
                  <img src={`/ipbrand/${d.cover}`} alt={d.name_cn} loading="lazy" />
                ) : (
                  <div className="ipb-card-placeholder">{d.name_cn ? d.name_cn[0] : '?'}</div>
                )}
                <span className={`ipb-case-badge${d.case_len ? '' : ' zero'}`}>
                  {d.case_len ? `案例 ${d.case_len}` : '暂无案例'}
                </span>
              </div>
              <div className="ipb-card-name">{d.name_cn || d.name_en || '(未命名)'}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
