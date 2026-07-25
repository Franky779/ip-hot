'use client'

import { useMemo, useState } from 'react'
import { RESEARCH_CATEGORIES, RESEARCH_ITEMS, type ResearchCategory } from '@/lib/migrated-content'

export default function ResearchPage() {
  const [category, setCategory] = useState<ResearchCategory>('品类研究')
  const items = useMemo(() => RESEARCH_ITEMS.filter((item) => item.category === category), [category])
  return <>
    <header className="page-header"><div className="home-header-top"><div><h1 className="page-title font-serif">深度研究</h1><p className="page-sub">从品类趋势、品牌/IP 到授权营销，沉淀可复用的行业观察。</p></div></div><div className="research-tabs" role="tablist" aria-label="深度研究分类">{RESEARCH_CATEGORIES.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} role="tab" aria-selected={item === category}>{item}</button>)}</div></header>
    <section className="research-page article-section"><div className="research-grid">{items.map((item) => <article className="research-card" key={item.id}><div className="research-card-meta"><span>{item.category}</span><time dateTime={item.publishedAt || undefined}>{item.publishedAt || '日期待确认'}</time></div><h2>{item.title}</h2>{item.note && <p>{item.note}</p>}{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">查看原文件 <span>↗</span></a> : <span className="research-pending">待确认原文件</span>}</article>)}</div></section>
  </>
}
