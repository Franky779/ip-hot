'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { IpRecord } from '../IpBrandClient'

type FeedArticle = {
  id: string
  source: string
  url: string
  title: string
  title_cn: string | null
  published_at: string | null
  created_at: string | null
}

export function IpDetailClient({ initialId }: { initialId: number }) {
  const [data, setData] = useState<IpRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [feedNews, setFeedNews] = useState<FeedArticle[]>([])
  const ipId = initialId

  useEffect(() => {
    fetch('/ipbrand/ips.json')
      .then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((d: IpRecord[]) => setData(d))
      .catch(() => setLoadError(true))
  }, [])

  const d = data && ipId && ipId > 0 ? data.find(x => x.id === ipId) : undefined
  const title = d ? d.name_cn || d.name_en || '(未命名)' : 'IP 详情'

  useEffect(() => {
    if (d) document.title = `${title} · IP品牌库`
  }, [d, title])

  // 拉取全球快讯中该 IP 的最新 10 条相关资讯（失败/为空时回退到静态新闻列表）
  useEffect(() => {
    if (!d || !d.name_cn) return
    fetch(`/api/articles/search?q=${encodeURIComponent(d.name_cn)}`)
      .then(r => (r.ok ? r.json() : { articles: [] }))
      .then((res: { articles?: FeedArticle[] }) => setFeedNews(res.articles || []))
      .catch(() => setFeedNews([]))
  }, [d])

  let body: React.ReactNode
  if (loadError) {
    body = <div className="ipd-status">数据加载失败，请刷新重试</div>
  } else if (ipId === -1) {
    body = <div className="ipd-status">缺少 IP 编号，<Link href="/ipbrand">返回列表</Link></div>
  } else if (!data) {
    body = <div className="ipd-status">加载中…</div>
  } else if (!d) {
    body = <div className="ipd-status">没有找到编号为 {ipId} 的 IP，<Link href="/ipbrand">返回列表</Link></div>
  } else {
    const metas: Array<[string, string]> = [
      ['版权方', d.company],
      ['专业分类', d.category],
      ['出品国家/地区', d.place_origin],
      ['IP诞生年代', d.listing_date],
      ['授权有效期', d.auth_start && d.auth_end ? `${d.auth_start} ~ ${d.auth_end}` : (d.auth_start || d.auth_end || '')],
      ['授权案例', d.case_len ? `${d.case_len} 个` : ''],
      ['受众', d.ages && d.ages.length ? d.ages.join('，') : ''],
      ['可授权地区', d.areas && d.areas.length ? d.areas.join('，') : ''],
      ['重点授权品类', d.industries && d.industries.length ? d.industries.join('，') : ''],
    ]
    const galleryImgs = (d.images || []).filter(i => i.type === 'gallery')

    body = (
      <>
        <div className="ipd-hero">
          <div className="ipd-hero-cover">
            {d.cover ? (
              <img src={`/ipbrand/${d.cover}`} alt={title} />
            ) : (
              <div className="ipd-hero-placeholder">{title[0] || '?'}</div>
            )}
          </div>
          <div className="ipd-hero-info">
            <h1>{title}</h1>
            {d.name_en && d.name_en !== d.name_cn && <div className="ipd-name-en">{d.name_en}</div>}
            <div className="ipd-meta-grid">
              {metas.filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="ipd-meta-item">
                  <div className="ipd-meta-label">{label}</div>
                  <div className="ipd-meta-value">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {d.ip_intro && (
          <div className="ipd-section">
            <div className="ipd-section-title">IP 介绍</div>
            <div className="ipd-intro-text">{d.ip_intro}</div>
          </div>
        )}

        {d.company_intro && (
          <div className="ipd-section">
            <div className="ipd-section-title">版权方介绍</div>
            <div className="ipd-intro-text">{d.company_intro}</div>
          </div>
        )}

        {galleryImgs.length > 0 && (
          <div className="ipd-section">
            <div className="ipd-section-title">对外展示图</div>
            <div className="ipd-gallery-row">
              {galleryImgs.map((img, i) => (
                <div
                  key={i}
                  className="ipd-gallery-item"
                  onClick={() => window.open(`/ipbrand/${img.local}`, '_blank')}
                >
                  <img src={`/ipbrand/${img.local}`} alt="展示图" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ipd-section">
          <div className="ipd-section-title">授权案例 ({d.case_len || 0})</div>
          {d.licensor_case_list && d.licensor_case_list.length > 0 ? (
            <div className="ipd-case-list">
              {d.licensor_case_list.map((c, i) => (
                <div key={i} className="ipd-case-item">
                  {c.image && <img className="ipd-case-thumb" src={c.image} alt="" loading="lazy" />}
                  <div className="ipd-case-body">
                    <div className="ipd-case-title">{c.title || ''}</div>
                    {c.date && <div className="ipd-case-date">{c.date}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无授权案例记录</div>
          )}
        </div>

        <div className="ipd-section">
          <div className="ipd-section-head">
            <div className="ipd-section-title">相关新闻</div>
            {feedNews.length > 0 && (
              <a className="ipd-more-link" href={`/?q=${encodeURIComponent(d.name_cn)}`}>
                更多相关快讯 »
              </a>
            )}
          </div>
          {feedNews.length > 0 ? (
            <div className="ipd-news-list">
              {feedNews.map(n => (
                <a key={n.id} className="ipd-news-item" href={n.url} target="_blank" rel="noopener noreferrer">
                  <span className="ipd-news-title">{n.title_cn || n.title}</span>
                  <span className="ipd-news-date">{(n.published_at || n.created_at || '').slice(0, 10)}</span>
                </a>
              ))}
            </div>
          ) : d.news_list && d.news_list.length > 0 ? (
            <div className="ipd-news-list">
              {d.news_list.map((n, i) => (
                <a key={i} className="ipd-news-item" href={n.url || '#'} target="_blank" rel="noopener noreferrer">
                  <span className="ipd-news-title">{n.title || ''}</span>
                  {n.date && <span className="ipd-news-date">{n.date}</span>}
                </a>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无相关新闻</div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="ipb-page">
      <div className="ipd-topbar">
        <Link href="/ipbrand" className="ipd-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回列表
        </Link>
        <div className="ipd-topbar-title">{title}</div>
        {d && d.source_url ? (
          <a className="ipd-source-link" href={d.source_url} target="_blank" rel="noopener noreferrer">
            来源页
          </a>
        ) : (
          <span />
        )}
      </div>
      <div className="ipd-main">{body}</div>
    </div>
  )
}
