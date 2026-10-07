'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../components/AdminToggle'
import { CASE_CITIES, CASE_LICENSE_KINDS, caseTitle, mergeCaseRecords, type CaseAdminData, type CaseConfig, type CaseRecord } from '@/lib/case-types'
import { mergeLicenseeRecords, type LicenseeAdminData } from '@/lib/licensee-types'
import { mergeFactoryRecords, type FactoryAdminData } from '@/lib/factory-types'
import { buildFactoryIndex, buildIpIndex, buildLicenseeIndex, resolveEntityHref, type EntityKind } from '@/lib/entity-links'

const EMPTY_CONFIG: CaseConfig = { custom_categories: [], custom_cities: [] }

export function CaseClient() {
  const [data, setData] = useState<CaseRecord[] | null>(null)
  const [config, setConfig] = useState<CaseConfig>(EMPTY_CONFIG)
  const [inputValue, setInputValue] = useState('')
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [confirmDel, setConfirmDel] = useState<CaseRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchConfirm, setBatchConfirm] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()

  const EMPTY_LICENSEE_ADMIN: LicenseeAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }
  const EMPTY_FACTORY_ADMIN: FactoryAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }

  // 载入三库名称→编号索引，供长条卡里的 IP方/品牌方 名字按名字自动跳转（无需手动关联编号）
  const [licensees, setLicensees] = useState<{ id: number; name: string; name_en?: string }[]>([])
  const [factories, setFactories] = useState<{ id: number; name: string; name_en?: string }[]>([])
  const [ipLibrary, setIpLibrary] = useState<{ id: number; name_cn?: string; name_en?: string }[] | null>(null)
  useEffect(() => {
    Promise.all([
      fetch('/licensee/licensees.json').then(r => r.ok ? r.json() : []),
      fetch('/api/licensee/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_LICENSEE_ADMIN)),
      fetch('/factory/factories.json').then(r => r.ok ? r.json() : []),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_FACTORY_ADMIN)),
    ])
      .then(([lr, la, fr, fa]) => {
        setLicensees(mergeLicenseeRecords(lr || [], (la as LicenseeAdminData) || { deleted: [], edits: {}, new_records: [] }))
        setFactories(mergeFactoryRecords(fr || [], (fa as FactoryAdminData) || { deleted: [], edits: {}, new_records: [] }))
      })
      .catch(() => { setLicensees([]); setFactories([]) })
    fetch('/api/ipbrand/summary', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then(records => setIpLibrary(records))
      .catch(() => setIpLibrary([]))
  }, [])

  const licenseeIndex = useMemo(() => buildLicenseeIndex(licensees), [licensees])
  const factoryIndex = useMemo(() => buildFactoryIndex(factories), [factories])
  const ipIndex = useMemo(() => (ipLibrary ? buildIpIndex(ipLibrary) : null), [ipLibrary])
  const linkFor = (kind: EntityKind, id: number, name: string): string | null =>
    resolveEntityHref(kind, { id, name, index: kind === 'ip' ? ipIndex : kind === 'licensee' ? licenseeIndex : factoryIndex })

  useEffect(() => {
    Promise.all([
      fetch('/case/cases.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<CaseRecord[]> }),
      fetch('/api/case/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: EMPTY_CONFIG } as CaseAdminData)),
    ])
      .then(([records, admin]) => { setData(mergeCaseRecords(records, admin)); setConfig(admin.config || EMPTY_CONFIG) })
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setQ(inputValue), 80)
    return () => clearTimeout(timer)
  }, [inputValue])

  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data || []).forEach(item => item.license_kind && counts.set(item.license_kind, (counts.get(item.license_kind) || 0) + 1))
    return CASE_LICENSE_KINDS.map(k => [k, counts.get(k) || 0] as [string, number])
  }, [data])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data || []).forEach(item => item.product_category && counts.set(item.product_category, (counts.get(item.product_category) || 0) + 1))
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  }, [data])

  const cities = useMemo(() => {
    const counts = new Map<string, number>()
    ;(data || []).forEach(item => item.city && counts.set(item.city, (counts.get(item.city) || 0) + 1))
    return [...CASE_CITIES, ...config.custom_cities].map(c => [c, counts.get(c) || 0] as [string, number]).filter(([, count]) => count > 0)
  }, [data, config])

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase()
    return (data || []).filter(item => {
      const hay = [item.ip_name, item.licensee_name, item.factory_name, item.product_category, item.city, item.description, item.license_kind].join(' ').toLowerCase()
      return (!keyword || hay.includes(keyword)) && (!kind || item.license_kind === kind) && (!category || item.product_category === category) && (!city || item.city === city)
    })
  }, [data, q, kind, category, city])

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      const response = await fetch('/api/admin/case/delete', {
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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  const handleBatchDelete = async () => {
    if (!selectedIds.size) return
    setBatchDeleting(true)
    const password = localStorage.getItem(ADMIN_PW_KEY) || ''
    try {
      const results = await Promise.all([...selectedIds].map(id => fetch('/api/admin/case/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ id }),
      })))
      if (results.some(r => !r.ok)) throw new Error('partially failed')
      const ids = selectedIds
      setData(prev => prev ? prev.filter(item => !ids.has(item.id)) : prev)
      setSelectedIds(new Set())
      setBatchConfirm(false)
    } catch {
      alert('批量删除失败，请重试')
    } finally {
      setBatchDeleting(false)
    }
  }

  return (
    <div className="factory-page">
      <div className="factory-topbar">
        <div className="factory-brand">
          <div className="factory-brand-title">IP授权案例库</div>
          <div className="factory-brand-count">{data ? `共 ${data.length} 条` : '—'}</div>
        </div>
        <div className="factory-search-wrap">
          <input className="factory-search" value={inputValue} onChange={e => setInputValue(e.target.value)} placeholder="搜IP / 品牌方 / 工厂 / 品类 / 城市…" autoComplete="off" />
          <svg viewBox="0 0 24 24" className="factory-search-icon"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </div>
        <div className="factory-topbar-right">
          {adminLoaded && isAdmin && <>
            <button className="factory-batch-del-btn" disabled={!selectedIds.size} onClick={() => setBatchConfirm(true)} title="删除选中的案例">🗑 批量删除{selectedIds.size ? ` (${selectedIds.size})` : ''}</button>
            <Link href="/case/new" className="factory-add-btn">＋ 新增案例</Link>
          </>}
        </div>
      </div>

      <main className="factory-main">
        <div className="factory-filter-row">
          <button className={`factory-filter-btn${!kind ? ' active' : ''}`} onClick={() => setKind('')}>全部授权方式 ({data?.length || 0})</button>
          {kindCounts.map(([name, count]) => <button key={name} className={`factory-filter-btn${kind === name ? ' active' : ''}`} onClick={() => setKind(name)}>{name} ({count})</button>)}
        </div>
        {categories.length > 0 && <div className="factory-filter-row">
          <button className={`factory-filter-btn${!category ? ' active' : ''}`} onClick={() => setCategory('')}>全部品类</button>
          {categories.map(([name, count]) => <button key={name} className={`factory-filter-btn${category === name ? ' active' : ''}`} onClick={() => setCategory(name)}>{name} ({count})</button>)}
        </div>}
        {cities.length > 0 && <div className="factory-filter-row factory-hub-row">
          <button className={`factory-hub-btn${!city ? ' active' : ''}`} onClick={() => setCity('')}>全部城市</button>
          {cities.map(([name, count]) => <button key={name} className={`factory-hub-btn${city === name ? ' active' : ''}`} onClick={() => setCity(name)}>{name} ({count})</button>)}
        </div>}

        <div className="case-list">
          {loadError && <div className="factory-empty">数据加载失败，请刷新重试</div>}
          {!loadError && !data && <div className="factory-empty">加载案例库中…</div>}
          {data && filtered.length === 0 && <div className="factory-empty">没有找到匹配的案例</div>}
          {filtered.map(item => {
            const tags = [item.license_kind, item.product_category, item.city, item.factory_name, item.case_date].filter(Boolean) as string[]
            const ipHref = linkFor('ip', item.ip_id, item.ip_name)
            const licHref = linkFor('licensee', item.licensee_id, item.licensee_name)
            return (
              <div className={`case-strip${adminLoaded && isAdmin && selectedIds.has(item.id) ? ' selected' : ''}`} key={item.id} title={caseTitle(item)}>
                {adminLoaded && isAdmin && <span className={`case-select-box${selectedIds.has(item.id) ? ' checked' : ''}`} onClick={event => { event.preventDefault(); event.stopPropagation(); toggleSelect(item.id) }} title={selectedIds.has(item.id) ? '取消选择' : '选择案例'} role="checkbox" aria-checked={selectedIds.has(item.id)} />}
                <span className="case-strip-title">
                  【{ipHref
                    ? <Link href={ipHref} className="case-strip-entity" onClick={event => event.stopPropagation()} title="查看IP档案">{item.ip_name}</Link>
                    : <span>{item.ip_name}</span>}
                  {' × '}
                  {licHref
                    ? <Link href={licHref} className="case-strip-entity" onClick={event => event.stopPropagation()} title="查看品牌方档案">{item.licensee_name}</Link>
                    : <span>{item.licensee_name}</span>}】
                </span>
                <span className="case-strip-tags">{tags.map(tag => <span className="case-strip-tag" key={tag}>#{tag}</span>)}</span>
                <Link href={`/case/detail?id=${item.id}`} className="case-strip-open" onClick={event => event.stopPropagation()} title="查看案例详情">详情 ›</Link>
                {adminLoaded && isAdmin && <button className="factory-delete-btn" title="删除案例" onClick={event => { event.preventDefault(); event.stopPropagation(); setConfirmDel(item) }}>✕</button>}
              </div>
            )
          })}
        </div>
      </main>

      {confirmDel && <div className="factory-confirm-mask" onClick={() => !deleting && setConfirmDel(null)}><div className="factory-confirm-box" onClick={e => e.stopPropagation()}><div className="factory-confirm-title">删除确认</div><div className="factory-confirm-text">确定从案例库中删除「{caseTitle(confirmDel)}」吗？<div>删除后此记录不再显示，且不可撤销。</div></div><div className="factory-confirm-actions"><button onClick={() => setConfirmDel(null)} disabled={deleting}>取消</button><button className="danger" onClick={handleDelete} disabled={deleting}>{deleting ? '删除中…' : '确认删除'}</button></div></div></div>}

      {batchConfirm && <div className="factory-confirm-mask" onClick={() => !batchDeleting && setBatchConfirm(false)}><div className="factory-confirm-box" onClick={e => e.stopPropagation()}><div className="factory-confirm-title">批量删除确认</div><div className="factory-confirm-text">确定从案例库中删除选中的 {selectedIds.size} 条案例吗？<div>删除后这些记录不再显示，且不可撤销。</div></div><div className="factory-confirm-actions"><button onClick={() => setBatchConfirm(false)} disabled={batchDeleting}>取消</button><button className="danger" onClick={handleBatchDelete} disabled={batchDeleting}>{batchDeleting ? '删除中…' : '确认删除'}</button></div></div></div>}
    </div>
  )
}
