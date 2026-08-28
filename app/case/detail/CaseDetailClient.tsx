'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { CASE_CITIES, CASE_LICENSE_KINDS, CASE_PRODUCT_CATEGORIES, caseTitle, mergeCaseRecords, type CaseAdminData, type CaseConfig, type CaseRecord } from '@/lib/case-types'
import { mergeLicenseeRecords, type LicenseeAdminData, type LicenseeRecord } from '@/lib/licensee-types'
import { mergeFactoryRecords, type FactoryAdminData, type FactoryRecord } from '@/lib/factory-types'
import type { IpRecord } from '@/lib/ipbrand-types'

function imageUrl(local: string) { return `/case/${local}` }

const EMPTY_CONFIG: CaseConfig = { custom_categories: [], custom_cities: [] }
const EMPTY_LICENSEE_ADMIN: LicenseeAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }
const EMPTY_FACTORY_ADMIN: FactoryAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }

export function CaseDetailClient({ initialId }: { initialId: number }) {
  const [data, setData] = useState<CaseRecord[] | null>(null)
  const [config, setConfig] = useState<CaseConfig>(EMPTY_CONFIG)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CaseRecord | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [zoomImg, setZoomImg] = useState<string | null>(null)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const imageInput = useRef<HTMLInputElement>(null)
  const d = data?.find(item => item.id === initialId)
  const title = d ? caseTitle(d) : '案例详情'

  // 编辑态三方关联选择器：品牌方/工厂列表（小，直接载入）；IP库（4.5MB，点击后才拉取）
  const [licensees, setLicensees] = useState<LicenseeRecord[]>([])
  const [factories, setFactories] = useState<FactoryRecord[]>([])
  const [ipLibrary, setIpLibrary] = useState<IpRecord[] | null>(null)
  const [ipLoading, setIpLoading] = useState(false)
  const [ipSearch, setIpSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/case/cases.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<CaseRecord[]> }),
      fetch('/api/case/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: EMPTY_CONFIG } as CaseAdminData)),
    ])
      .then(([records, admin]) => { setData(mergeCaseRecords(records, admin)); setConfig(admin.config || EMPTY_CONFIG) })
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => { if (d) document.title = `${caseTitle(d)} · IP授权案例库` }, [d])

  // 进入编辑态时载入品牌方/工厂列表供三方关联选择
  useEffect(() => {
    if (!editing) return
    Promise.all([
      fetch('/licensee/licensees.json').then(r => r.ok ? r.json() as Promise<LicenseeRecord[]> : []),
      fetch('/api/licensee/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_LICENSEE_ADMIN)),
      fetch('/factory/factories.json').then(r => r.ok ? r.json() as Promise<FactoryRecord[]> : []),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_FACTORY_ADMIN)),
    ])
      .then(([licenseeRecords, licenseeAdmin, factoryRecords, factoryAdmin]) => {
        setLicensees(mergeLicenseeRecords(licenseeRecords, licenseeAdmin))
        setFactories(mergeFactoryRecords(factoryRecords, factoryAdmin))
      })
      .catch(() => { setLicensees([]); setFactories([]) })
  }, [editing])

  const loadIpLibrary = () => {
    if (ipLibrary !== null || ipLoading) return
    setIpLoading(true)
    fetch('/ipbrand/ips.json')
      .then(r => r.ok ? r.json() as Promise<IpRecord[]> : [])
      .then(records => setIpLibrary(records))
      .catch(() => setIpLibrary([]))
      .finally(() => setIpLoading(false))
  }

  const patch = (changes: Partial<CaseRecord>) => setDraft(prev => prev ? { ...prev, ...changes } : prev)

  const moveImage = (index: number, direction: -1 | 1) => setDraft(prev => {
    if (!prev) return prev
    const images = [...prev.images]
    const next = index + direction
    if (next < 0 || next >= images.length) return prev
    ;[images[index], images[next]] = [images[next], images[index]]
    return { ...prev, images }
  })
  const deleteImage = (index: number) => patch({ images: (draft?.images || []).filter((_, i) => i !== index) })

  const pickIp = (ip: IpRecord) => {
    patch({ ip_id: ip.id, ip_name: ip.name_cn || ip.name_en })
    setIpSearch('')
  }
  const pickLicensee = (licenseeId: number) => {
    const target = licensees.find(item => item.id === licenseeId)
    patch(target ? { licensee_id: target.id, licensee_name: target.name } : { licensee_id: 0 })
  }
  const pickFactory = (factoryId: number) => {
    const target = factories.find(item => item.id === factoryId)
    patch(target ? { factory_id: target.id, factory_name: target.name } : { factory_id: 0 })
  }

  const uploadImages = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('id', String(d.id)); form.append('name', d.ip_name || d.licensee_name); files.forEach(file => form.append('files', file))
      const response = await fetch('/api/admin/case/upload-images', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '上传失败')
      patch({ images: [...(draft?.images || []), ...json.files] })
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const save = async () => {
    if (!d || !draft) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/case/save-edit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ id: d.id, edit: draft }) })
      if (!response.ok) throw new Error('保存失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? draft : item) : prev)
      setEditing(false); setDraft(null)
    } catch (error) { alert((error as Error).message) } finally { setSaving(false) }
  }

  const availableCategories = [...CASE_PRODUCT_CATEGORIES, ...config.custom_categories]
  const availableCities = [...CASE_CITIES, ...config.custom_cities]
  const keyword = ipSearch.trim().toLowerCase()
  const ipHits = ipLibrary && keyword ? ipLibrary.filter(ip => (ip.name_cn || '').toLowerCase().includes(keyword) || (ip.name_en || '').toLowerCase().includes(keyword)).slice(0, 8) : []

  const body = loadError ? <div className="factory-status">数据加载失败，请刷新重试</div> : !data ? <div className="factory-status">加载中…</div> : !d ? <div className="factory-status">没有找到该案例，<Link href="/case">返回案例库</Link></div> : editing && draft ? (
    <div className="factory-detail-main editing">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{draft.images[0] ? <img src={imageUrl(draft.images[0].local)} alt={caseTitle(draft)} /> : <div className="factory-detail-placeholder">{(draft.ip_name || draft.licensee_name || '?').slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <div className="factory-hint">第一张图片为封面，可在下方图廊中调整顺序。三方关联：从库里选择后可跳转对方档案；不在库中则手填名称纯文本展示。</div>
        </div>
      </div>

      <section className="factory-edit-section">
        <div className="factory-section-heading">三方关联</div>
        <div className="lic-case-edit">
          <div className="lic-case-edit-grid">
            <label>IP 名称<input className="factory-edit-input" value={draft.ip_name} onChange={e => patch({ ip_name: e.target.value })} placeholder="如：经典奥特曼" /></label>
            <label>IP 库编号<input className="factory-edit-input" type="number" min="0" value={draft.ip_id || ''} onChange={e => patch({ ip_id: Math.max(0, Number(e.target.value) || 0) })} placeholder="0 = 未关联" /></label>
          </div>
          <div className="lic-ip-search">
            {ipLibrary === null
              ? <button className="factory-upload-btn" onClick={loadIpLibrary} disabled={ipLoading}>{ipLoading ? '载入IP库中…' : '从IP品牌库搜索并填入'}</button>
              : <input className="factory-edit-input" value={ipSearch} onChange={e => setIpSearch(e.target.value)} placeholder="输入IP名搜索，点结果自动填入编号" />}
            {ipHits.length > 0 && <div className="lic-ip-hits">{ipHits.map(ip => <button key={ip.id} onClick={() => pickIp(ip)}>{ip.name_cn || ip.name_en}<span>#{ip.id}</span></button>)}</div>}
          </div>
          <div className="lic-case-edit-grid">
            <label>品牌方（被授权商）<select className="factory-edit-input" value={draft.licensee_id || ''} onChange={e => pickLicensee(Number(e.target.value) || 0)}><option value="">未关联 / 不在库中</option>{licensees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>品牌方名称（未关联时手填）<input className="factory-edit-input" value={draft.licensee_name} onChange={e => patch({ licensee_name: e.target.value })} placeholder="选了库里品牌方会自动填入" disabled={draft.licensee_id > 0} /></label>
            <label>生产工厂<select className="factory-edit-input" value={draft.factory_id || ''} onChange={e => pickFactory(Number(e.target.value) || 0)}><option value="">未关联 / 不在库中</option>{factories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>工厂名称（未关联时手填）<input className="factory-edit-input" value={draft.factory_name} onChange={e => patch({ factory_name: e.target.value })} placeholder="选了库里工厂会自动填入，无工厂信息留空" disabled={draft.factory_id > 0} /></label>
          </div>
        </div>
      </section>

      <section className="factory-edit-section">
        <div className="factory-section-heading">案例信息</div>
        <div className="factory-edit-meta-grid">
          <label>授权分类<select className="factory-edit-input" value={draft.license_kind} onChange={e => patch({ license_kind: e.target.value as CaseRecord['license_kind'] })}><option value="">请选择</option>{CASE_LICENSE_KINDS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>案例品类<select className="factory-edit-input" value={draft.product_category} onChange={e => patch({ product_category: e.target.value })}><option value="">请选择</option>{availableCategories.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>城市<select className="factory-edit-input" value={draft.city} onChange={e => patch({ city: e.target.value })}><option value="">请选择</option>{availableCities.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>案例时间<input className="factory-edit-input" value={draft.case_date} onChange={e => patch({ case_date: e.target.value })} placeholder="如：2026-03" /></label>
        </div>
        <div className="factory-category-edit"><div className="factory-meta-label">案例描述</div><textarea className="factory-edit-input" rows={4} value={draft.description} onChange={e => patch({ description: e.target.value })} placeholder="案例背景、合作内容、落地效果…" /></div>
        <div className="factory-edit-meta-grid">
          <label>信息来源网址<input className="factory-edit-input" value={draft.source_url} onChange={e => patch({ source_url: e.target.value })} placeholder="https://…" /></label>
        </div>
      </section>

      <section className="factory-edit-section"><div className="factory-section-heading">案例图片</div><label className="factory-upload-btn">＋ 批量上传图片<input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadImages(files); e.target.value = '' }} /></label><div className="factory-edit-gallery">{draft.images.map((image, index) => <div className="factory-edit-image" key={image.local}><img src={imageUrl(image.local)} alt="案例图片" /><div><button disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button onClick={() => deleteImage(index)}>删除</button></div></div>)}</div></section>
    </div>
  ) : d ? (
    <div className="factory-detail-main">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{d.images[0] ? <img src={imageUrl(d.images[0].local)} alt={caseTitle(d)} /> : <div className="factory-detail-placeholder">{(d.ip_name || d.licensee_name || '?').slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <h1>{caseTitle(d)}</h1>
          <div className="factory-meta-grid factory-meta-in-hero">
            <div><b>授权分类</b><span>{d.license_kind || '未填写'}</span></div>
            <div><b>案例品类</b><span>{d.product_category || '未填写'}</span></div>
            <div><b>城市</b><span>{d.city || '未填写'}</span></div>
            <div><b>案例时间</b><span>{d.case_date || '未填写'}</span></div>
          </div>
        </div>
      </div>

      <section className="factory-detail-section">
        <div className="factory-section-heading">授权链路</div>
        <div className="lic-case-card">
          <div className="case-chain">
            {d.ip_id > 0
              ? <Link href={`/ipbrand/detail?id=${d.ip_id}`} className="case-chain-node case-chain-ip" title="查看IP档案"><span className="case-chain-role case-role-ip">IP方</span><b>{d.ip_name}</b><i>›</i></Link>
              : <div className="case-chain-node case-chain-off"><span className="case-chain-role case-role-ip">IP方</span><b>{d.ip_name || '未填写'}</b></div>}
            <span className="case-chain-arrow">→</span>
            {d.licensee_id > 0
              ? <Link href={`/licensee/detail?id=${d.licensee_id}`} className="case-chain-node case-chain-licensee" title="查看品牌方档案"><span className="case-chain-role case-role-licensee">品牌方</span><b>{d.licensee_name}</b><i>›</i></Link>
              : <div className="case-chain-node case-chain-off"><span className="case-chain-role case-role-licensee">品牌方</span><b>{d.licensee_name || '未填写'}</b></div>}
            {(d.factory_id > 0 || d.factory_name) && <>
              <span className="case-chain-arrow">→</span>
              {d.factory_id > 0
                ? <Link href={`/factory/detail?id=${d.factory_id}`} className="case-chain-node case-chain-factory" title="查看工厂档案"><span className="case-chain-role case-role-factory">工厂</span><b>{d.factory_name}</b><i>›</i></Link>
                : <div className="case-chain-node case-chain-off"><span className="case-chain-role case-role-factory">工厂</span><b>{d.factory_name}</b></div>}
            </>}
          </div>
        </div>
      </section>

      {d.description && <section className="factory-detail-section"><div className="factory-section-heading">案例描述</div><p className="lic-intro">{d.description}</p></section>}

      {d.source_url && <section className="factory-detail-section"><div className="factory-section-heading">信息来源</div><a className="case-source-link" href={d.source_url} target="_blank" rel="noreferrer">{d.source_url} »</a></section>}

      {d.images.length > 0 && <section className="factory-detail-section"><div className="factory-section-heading">案例图片 ({d.images.length})</div><div className="case-gallery">{d.images.map(image => <div key={image.local} onClick={() => setZoomImg(image.local)}><img src={imageUrl(image.local)} alt={caseTitle(d)} loading="lazy" /></div>)}</div></section>}
    </div>
  ) : null

  return <div className="factory-page"><div className="factory-detail-topbar"><Link href="/case" className="factory-back">‹ 返回案例库</Link><div className="factory-detail-title">{title}</div>{adminLoaded && isAdmin && d && <button className="factory-edit-top-btn" onClick={editing ? () => { setEditing(false); setDraft(null) } : () => { setDraft(d); setEditing(true) }}>{editing ? '取消编辑' : '✎ 编辑'}</button>}</div>{body}{zoomImg && <div className="case-lightbox" onClick={() => setZoomImg(null)}><img src={imageUrl(zoomImg)} alt={title} /></div>}{editing && draft && <div className="factory-save-bar"><span>{busy ? '处理中…' : '图片上传即时生效，其余修改点击保存'}</span><button onClick={() => { setEditing(false); setDraft(null) }} disabled={saving || busy}>取消</button><button className="primary" onClick={save} disabled={saving || busy}>{saving ? '保存中…' : '保存修改'}</button></div>}</div>
}
