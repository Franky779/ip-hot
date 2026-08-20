'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../components/AdminToggle'
import { FACTORY_HUBS, formatLocation, mergeFactoryRecords, type FactoryAdminData, type FactoryRecord } from '@/lib/factory-types'
import { VerifiedBadge } from './VerifiedBadge'

export function FactoryClient() {
  const [data, setData] = useState<FactoryRecord[] | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [hub, setHub] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [confirmDel, setConfirmDel] = useState<FactoryRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()

  useEffect(() => {
    Promise.all([
      fetch('/factory/factories.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<FactoryRecord[]> }),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } } as FactoryAdminData)),
    ])
      .then(([records, admin]) => setData(mergeFactoryRecords(records, admin)))
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setQ(inputValue), 80)
    return () => clearTimeout(timer)
  }, [inputValue])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data || []).forEach(item => item.categories.forEach(value => counts.set(value, (counts.get(value) || 0) + 1)))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const hubs = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data || []).forEach(item => item.hub && counts.set(item.hub, (counts.get(item.hub) || 0) + 1))
    return FACTORY_HUBS.map(h => [h, counts.get(h) || 0] as [string, number]).filter(([, count]) => count > 0)
  }, [data])

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (data || []).filter(item => {
      const hay = [item.name, item.one_line, item.location, item.hub, ...(item.supply_types || []), ...item.categories].join(' ').toLowerCase()
      return (!keyword || hay.includes(keyword)) && (!category || item.categories.includes(category)) && (!hub || item.hub === hub)
    })
  }, [data, q, category, hub])

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const response = await fetch('/api/admin/factory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' },
        body: JSON.stringify({ id: confirmDel.id }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setData(prev => prev ? prev.filter(item => item.id !== confirmDel.id) : prev)
      setConfirmDel(null)
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="factory-page">
      <div className="factory-topbar">
        <div className="factory-brand">
          <div className="factory-brand-title">IP工厂供应链</div>
          <div className="factory-brand-count">{data ? `共 ${data.length} 家` : '—'}</div>
        </div>
        <div className="factory-search-wrap">
          <input className="factory-search" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="搜供应链名称 / 品类 / 产业带 / 所在地…" autoComplete="off" />
          <svg viewBox="0 0 24 24" className="factory-search-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <div className="factory-topbar-right">
          {adminLoaded && isAdmin && <Link href="/factory/new" className="factory-add-btn">＋ 新增供应链</Link>}
        </div>
      </div>

      <main className="factory-main">
        <div className="factory-filter-row">
          <button className={`factory-filter-btn${!category ? ' active' : ''}`} onClick={() => setCategory('')}>全部品类 ({data?.length || 0})</button>
          {categories.map(([name, count]) => <button key={name} className={`factory-filter-btn${category === name ? ' active' : ''}`} onClick={() => setCategory(name)}>{name} ({count})</button>)}
        </div>
        <div className="factory-filter-row factory-hub-row">
          <button className={`factory-hub-btn${!hub ? ' active' : ''}`} onClick={() => setHub('')}>全部产业带</button>
          {hubs.map(([name, count]) => <button key={name} className={`factory-hub-btn${hub === name ? ' active' : ''}`} onClick={() => setHub(name)}>{name} ({count})</button>)}
        </div>

        <div className="factory-grid">
          {loadError && <div className="factory-empty">数据加载失败，请刷新重试</div>}
          {!loadError && !data && <div className="factory-empty">加载供应链档案中…</div>}
          {data && filtered.length === 0 && <div className="factory-empty">没有找到匹配的供应链</div>}
          {filtered.map(item => (
            <Link href={`/factory/detail?id=${item.id}`} className="factory-card" key={item.id} title={item.name}>
              <div className="factory-card-cover">
                {item.images[0] ? <img src={`/factory/${item.images[0].local}`} alt={item.name} loading="lazy" /> : <div className="factory-card-placeholder">{item.name.slice(0, 1) || '?'}</div>}
                {item.verified && <span className="factory-card-verified"><VerifiedBadge size={13} />平台已验厂</span>}
                <span className="factory-ip-count">已落地IP项目 {item.ip_project_count}</span>
                {adminLoaded && isAdmin && <button className="factory-delete-btn" title="删除供应链" onClick={event => { event.preventDefault(); event.stopPropagation(); setConfirmDel(item) }}>✕</button>}
              </div>
              <div className="factory-card-name">{item.name || '(未命名)'}{item.verified && <VerifiedBadge size={14} />}</div>
              <div className="factory-card-location-type-row"><div className="factory-card-meta"><span>{formatLocation(item)}</span></div><div className="factory-type-badges">{(item.supply_types || []).map(type => <span key={type}>{type}</span>)}</div></div>
              <div className="factory-tags">{item.categories.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
            </Link>
          ))}
        </div>
      </main>

      {confirmDel && <div className="factory-confirm-mask" onClick={() => !deleting && setConfirmDel(null)}><div className="factory-confirm-box" onClick={e => e.stopPropagation()}><div className="factory-confirm-title">删除确认</div><div className="factory-confirm-text">确定从供应链库中删除「{confirmDel.name}」吗？<div>删除后此记录不再显示，且不可撤销。</div></div><div className="factory-confirm-actions"><button onClick={() => setConfirmDel(null)} disabled={deleting}>取消</button><button className="danger" onClick={handleDelete} disabled={deleting}>{deleting ? '删除中…' : '确认删除'}</button></div></div></div>}
    </div>
  )
}
