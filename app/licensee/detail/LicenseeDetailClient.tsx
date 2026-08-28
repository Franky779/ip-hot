'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import {
  LICENSEE_AUDIENCES, LICENSEE_BIZ_TYPES, LICENSEE_CATEGORIES, LICENSEE_CHANNELS, LICENSEE_HUBS, LICENSE_TYPES,
  emptyLicenseeCase, formatLocation, linkedFactories, linkedIps, mergeLicenseeRecords,
  type LicenseeAdminData, type LicenseeCase, type LicenseeConfig, type LicenseeRecord,
} from '@/lib/licensee-types'
import { mergeFactoryRecords, type FactoryAdminData, type FactoryRecord } from '@/lib/factory-types'
import { casesByLicensee, caseTitle, mergeCaseRecords, type CaseAdminData, type CaseRecord } from '@/lib/case-types'
import type { IpRecord } from '@/lib/ipbrand-types'
import { LicenseeBadge } from '../LicenseeBadge'

function imageUrl(local: string) { return `/licensee/${local}` }

const EMPTY_CONFIG: LicenseeConfig = { contact_public: true, custom_hubs: [], custom_categories: [] }

export function LicenseeDetailClient({ initialId }: { initialId: number }) {
  const [data, setData] = useState<LicenseeRecord[] | null>(null)
  const [adminConfig, setAdminConfig] = useState<LicenseeConfig>(EMPTY_CONFIG)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LicenseeRecord | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const imageInput = useRef<HTMLInputElement>(null)
  const qrInput = useRef<HTMLInputElement>(null)
  const d = data?.find(item => item.id === initialId)
  const title = d?.name || '品牌方详情'

  // 案例编辑器用：工厂列表（小，直接载入）；IP库（4.5MB，点击"载入IP库"后才拉取）
  const [factories, setFactories] = useState<FactoryRecord[]>([])
  const [ipLibrary, setIpLibrary] = useState<IpRecord[] | null>(null)
  const [ipLoading, setIpLoading] = useState(false)
  const [ipSearch, setIpSearch] = useState<Record<number, string>>({})
  const [relatedCases, setRelatedCases] = useState<CaseRecord[]>([])

  useEffect(() => {
    Promise.all([
      fetch('/licensee/licensees.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<LicenseeRecord[]> }),
      fetch('/api/licensee/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: EMPTY_CONFIG } as LicenseeAdminData)),
    ])
      .then(([records, admin]) => { setData(mergeLicenseeRecords(records, admin)); setAdminConfig(admin.config || EMPTY_CONFIG) })
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => { if (d) document.title = `${d.name} · 品牌方库` }, [d])

  // 反向联动：拉案例库，筛出关联了当前品牌方的授权案例（失败则隐藏该区块）
  useEffect(() => {
    if (!initialId || initialId <= 0) return
    Promise.all([
      fetch('/case/cases.json').then(r => (r.ok ? r.json() as Promise<CaseRecord[]> : [])),
      fetch('/api/case/overrides').then(r => (r.ok ? r.json() : Promise.resolve(null))),
    ])
      .then(([records, admin]) => {
        const merged = admin ? mergeCaseRecords(records, admin as CaseAdminData) : records
        setRelatedCases(casesByLicensee(merged, initialId))
      })
      .catch(() => setRelatedCases([]))
  }, [initialId])

  // 进入编辑态时载入工厂列表供案例选择
  useEffect(() => {
    if (!editing) return
    Promise.all([
      fetch('/factory/factories.json').then(r => r.ok ? r.json() as Promise<FactoryRecord[]> : []),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } } as FactoryAdminData)),
    ])
      .then(([records, admin]) => setFactories(mergeFactoryRecords(records, admin)))
      .catch(() => setFactories([]))
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

  const patch = (changes: Partial<LicenseeRecord>) => setDraft(prev => prev ? { ...prev, ...changes } : prev)
  const toggleIn = (field: 'categories' | 'biz_types' | 'channels' | 'audiences', value: string) =>
    patch({ [field]: (draft?.[field] || []).includes(value) ? (draft?.[field] || []).filter(item => item !== value) : [...(draft?.[field] || []), value] } as Partial<LicenseeRecord>)

  const moveImage = (index: number, direction: -1 | 1) => setDraft(prev => {
    if (!prev) return prev
    const images = [...prev.images]
    const next = index + direction
    if (next < 0 || next >= images.length) return prev
    ;[images[index], images[next]] = [images[next], images[index]]
    return { ...prev, images }
  })
  const deleteImage = (index: number) => patch({ images: (draft?.images || []).filter((_, i) => i !== index) })

  /* ---------- 授权案例编辑 ---------- */
  const patchCase = (index: number, changes: Partial<LicenseeCase>) => setDraft(prev => {
    if (!prev) return prev
    const cases = prev.licensing_cases.map((item, i) => i === index ? { ...item, ...changes } : item)
    return { ...prev, licensing_cases: cases }
  })
  const addCase = () => patch({ licensing_cases: [...(draft?.licensing_cases || []), emptyLicenseeCase()] })
  const removeCase = (index: number) => patch({ licensing_cases: (draft?.licensing_cases || []).filter((_, i) => i !== index) })
  const pickFactory = (index: number, factoryId: number) => {
    const target = factories.find(f => f.id === factoryId)
    patchCase(index, target ? { factory_id: target.id, factory_name: target.name } : { factory_id: 0, factory_name: '' })
  }
  const pickIp = (index: number, ip: IpRecord) => {
    patchCase(index, { ip_id: ip.id, ip_name: ip.name_cn || ip.name_en })
    setIpSearch(prev => ({ ...prev, [index]: '' }))
  }

  const uploadImages = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('id', String(d.id)); form.append('name', d.name); files.forEach(file => form.append('files', file))
      const response = await fetch('/api/admin/licensee/upload-images', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '上传失败')
      patch({ images: [...(draft?.images || []), ...json.files] })
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const uploadQr = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('id', String(d.id)); form.append('name', d.name); files.forEach(file => form.append('files', file))
      const response = await fetch('/api/admin/licensee/upload-qr', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '二维码上传失败')
      const locals = json.files.map((file: { local: string }) => file.local)
      setData(prev => prev ? prev.map(item => item.id === d.id ? { ...item, qr_images: [...item.qr_images, ...locals] } : item) : prev)
      setDraft(prev => prev ? { ...prev, qr_images: [...prev.qr_images, ...locals] } : prev)
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const deleteQr = async (local: string) => {
    if (!d) return
    const parts = local.split('/')
    const name = parts.pop() || ''
    const folder = parts.pop() || ''
    setBusy(true)
    try {
      const response = await fetch('/api/admin/licensee/delete-qr', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ id: d.id, name, folder }) })
      if (!response.ok) throw new Error('删除二维码失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? { ...item, qr_images: item.qr_images.filter(qr => qr !== local) } : item) : prev)
      setDraft(prev => prev ? { ...prev, qr_images: prev.qr_images.filter(qr => qr !== local) } : prev)
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const setContactPublic = async (value: boolean) => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/licensee/set-config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ contact_public: value }) })
      if (!response.ok) throw new Error('设置失败')
      setAdminConfig({ ...adminConfig, contact_public: value })
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const save = async () => {
    if (!d || !draft) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/licensee/save-edit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ id: d.id, edit: draft }) })
      if (!response.ok) throw new Error('保存失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? draft : item) : prev)
      setEditing(false); setDraft(null)
    } catch (error) { alert((error as Error).message) } finally { setSaving(false) }
  }

  const availableCategories = [...LICENSEE_CATEGORIES, ...adminConfig.custom_categories]
  const availableHubs = [...LICENSEE_HUBS, ...adminConfig.custom_hubs]

  const body = loadError ? <div className="factory-status">数据加载失败，请刷新重试</div> : !data ? <div className="factory-status">加载中…</div> : !d ? <div className="factory-status">没有找到该品牌方，<Link href="/licensee">返回列表</Link></div> : editing && draft ? (
    <div className="factory-detail-main editing">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{draft.images[0] ? <img src={imageUrl(draft.images[0].local)} alt={draft.name} /> : <div className="factory-detail-placeholder">{draft.name.slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <input className="factory-edit-input factory-edit-name" value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="品牌方名称" />
          <input className="factory-edit-input" value={draft.name_en} onChange={e => patch({ name_en: e.target.value })} placeholder="英文名（选填）" />
          <textarea className="factory-edit-input factory-edit-line" rows={2} value={draft.one_line} onChange={e => patch({ one_line: e.target.value })} placeholder="一句话定位，如：东莞 · IP授权儿童食品品牌" />
          <div className="factory-hint">第一张图片为封面，可在下方图廊中调整顺序。</div>
        </div>
      </div>

      <section className="factory-edit-section">
        <div className="factory-section-heading">维度信息</div>
        <div className="factory-edit-meta-grid">
          <label className="factory-check-label">平台是否已认证<input type="checkbox" checked={!!draft.verified} onChange={e => patch({ verified: e.target.checked })} /><span>{draft.verified ? '平台已认证' : '未认证'}</span></label>
          <label>公司主体<input className="factory-edit-input" value={draft.company} onChange={e => patch({ company: e.target.value })} placeholder="工商注册公司名" /></label>
          <label>成立年份<input className="factory-edit-input" value={draft.founded} onChange={e => patch({ founded: e.target.value })} placeholder="如：2015" /></label>
          <label>所在地区<select className="factory-edit-input" value={draft.hub} onChange={e => patch({ hub: e.target.value })}><option value="">请选择</option>{availableHubs.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>详细所在地<input className="factory-edit-input" value={draft.location} onChange={e => patch({ location: e.target.value })} placeholder="如：东莞东城" /></label>
        </div>
        <div className="factory-category-edit"><div className="factory-meta-label">企业性质（可多选）</div><div className="factory-choice-grid">{LICENSEE_BIZ_TYPES.map(item => <button key={item} className={(draft.biz_types || []).includes(item) ? 'selected' : ''} onClick={() => toggleIn('biz_types', item)}>{item}</button>)}</div></div>
        <div className="factory-category-edit"><div className="factory-meta-label">主营品类（可多选）</div><div className="factory-choice-grid">{availableCategories.map(item => <button key={item} className={draft.categories.includes(item) ? 'selected' : ''} onClick={() => toggleIn('categories', item)}>{item}</button>)}</div></div>
        <div className="factory-category-edit"><div className="factory-meta-label">销售渠道（可多选）</div><div className="factory-choice-grid">{LICENSEE_CHANNELS.map(item => <button key={item} className={(draft.channels || []).includes(item) ? 'selected' : ''} onClick={() => toggleIn('channels', item)}>{item}</button>)}</div></div>
        <div className="factory-category-edit"><div className="factory-meta-label">受众定位（可多选）</div><div className="factory-choice-grid">{LICENSEE_AUDIENCES.map(item => <button key={item} className={(draft.audiences || []).includes(item) ? 'selected' : ''} onClick={() => toggleIn('audiences', item)}>{item}</button>)}</div></div>
        <div className="factory-category-edit"><div className="factory-meta-label">品牌介绍</div><textarea className="factory-edit-input" rows={4} value={draft.intro} onChange={e => patch({ intro: e.target.value })} placeholder="品牌方的定位、商业模式、授权策略…" /></div>
      </section>

      <section className="factory-edit-section">
        <div className="factory-section-heading">授权合作案例</div>
        <div className="factory-hint">每条案例把一个 IP、一个品类、一家生产工厂关联起来；IP 和工厂选了库里的记录后，详情页即可三方互跳。</div>
        {(draft.licensing_cases || []).map((c, index) => {
          const keyword = (ipSearch[index] || '').trim().toLowerCase()
          const ipHits = ipLibrary && keyword ? ipLibrary.filter(ip => (ip.name_cn || '').toLowerCase().includes(keyword) || (ip.name_en || '').toLowerCase().includes(keyword)).slice(0, 8) : []
          return (
            <div className="lic-case-edit" key={index}>
              <div className="lic-case-edit-head"><span>案例 {index + 1}</span><button onClick={() => removeCase(index)}>删除案例</button></div>
              <div className="lic-case-edit-grid">
                <label>IP 名称<input className="factory-edit-input" value={c.ip_name} onChange={e => patchCase(index, { ip_name: e.target.value })} placeholder="如：经典奥特曼" /></label>
                <label>IP 库编号<input className="factory-edit-input" type="number" min="0" value={c.ip_id || ''} onChange={e => patchCase(index, { ip_id: Math.max(0, Number(e.target.value) || 0) })} placeholder="0 = 未关联" /></label>
              </div>
              <div className="lic-ip-search">
                {ipLibrary === null
                  ? <button className="factory-upload-btn" onClick={loadIpLibrary} disabled={ipLoading}>{ipLoading ? '载入IP库中…' : '从IP品牌库搜索并填入'}</button>
                  : <input className="factory-edit-input" value={ipSearch[index] || ''} onChange={e => setIpSearch(prev => ({ ...prev, [index]: e.target.value }))} placeholder="输入IP名搜索，点结果自动填入编号" />}
                {ipHits.length > 0 && <div className="lic-ip-hits">{ipHits.map(ip => <button key={ip.id} onClick={() => pickIp(index, ip)}>{ip.name_cn || ip.name_en}<span>#{ip.id}</span></button>)}</div>}
              </div>
              <div className="lic-case-edit-grid">
                <label>授权品类<select className="factory-edit-input" value={c.category} onChange={e => patchCase(index, { category: e.target.value })}><option value="">请选择</option>{availableCategories.map(item => <option key={item}>{item}</option>)}</select></label>
                <label>授权方式<select className="factory-edit-input" value={c.license_type} onChange={e => patchCase(index, { license_type: e.target.value })}><option value="">请选择</option>{LICENSE_TYPES.map(item => <option key={item}>{item}</option>)}</select></label>
                <label>生产工厂<select className="factory-edit-input" value={c.factory_id || ''} onChange={e => pickFactory(index, Number(e.target.value) || 0)}><option value="">未关联 / 不在库中</option>{factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
                <label>工厂名称（未关联时手填）<input className="factory-edit-input" value={c.factory_name} onChange={e => patchCase(index, { factory_name: e.target.value })} placeholder="选了库里工厂会自动填入" disabled={c.factory_id > 0} /></label>
                <label>上市时间<input className="factory-edit-input" value={c.launch_date} onChange={e => patchCase(index, { launch_date: e.target.value })} placeholder="如：2026-03" /></label>
                <label>销售成绩 / 备注<input className="factory-edit-input" value={c.sales_note} onChange={e => patchCase(index, { sales_note: e.target.value })} placeholder="如：首批铺货3000家母婴店" /></label>
              </div>
            </div>
          )
        })}
        <button className="factory-upload-btn" onClick={addCase}>＋ 新增授权案例</button>
      </section>

      <section className="factory-edit-section"><div className="factory-section-heading">产品与品牌图片</div><label className="factory-upload-btn">＋ 批量上传图片<input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadImages(files); e.target.value = '' }} /></label><div className="factory-edit-gallery">{draft.images.map((image, index) => <div className="factory-edit-image" key={image.local}><img src={imageUrl(image.local)} alt="品牌方图片" /><div><button disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button onClick={() => deleteImage(index)}>删除</button></div></div>)}</div></section>

      <section className="factory-edit-section"><div className="factory-section-heading">联系二维码</div><div className="factory-hint">联系方式公开开关：{adminConfig.contact_public ? '当前公开' : '当前隐藏'}</div><div className="factory-contact-edit-actions"><button className="factory-upload-btn" onClick={() => setContactPublic(!adminConfig.contact_public)}>{adminConfig.contact_public ? '隐藏联系方式' : '公开联系方式'}</button><label className="factory-upload-btn">＋ 上传二维码<input ref={qrInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadQr(files); e.target.value = '' }} /></label></div><div className="factory-qr-grid">{draft.qr_images.map(qr => <div className="factory-qr-item" key={qr}><img src={imageUrl(qr)} alt="联系二维码" /><button onClick={() => deleteQr(qr)}>删除</button></div>)}</div></section>
    </div>
  ) : d ? (
    <div className="factory-detail-main">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{d.images[0] ? <img src={imageUrl(d.images[0].local)} alt={d.name} /> : <div className="factory-detail-placeholder">{d.name.slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <h1>{d.name}{d.verified && <LicenseeBadge size={20} />}</h1>
          {d.name_en && <p className="lic-name-en">{d.name_en}</p>}
          <p className="factory-detail-line">{d.one_line || '暂无定位信息'}</p>
          <div className="factory-meta-grid factory-meta-in-hero">
            <div className="factory-verified-item"><b>平台认证</b><span className={d.verified ? 'verified-yes' : 'verified-no'}>{d.verified ? <span className="verified-yes"><LicenseeBadge size={16} />平台已认证</span> : '未认证'}</span></div>
            <div><b>公司主体</b><span>{d.company || '未填写'}</span></div>
            <div><b>成立年份</b><span>{d.founded || '未填写'}</span></div>
            <div className="factory-meta-location"><b>所在地</b><span>{formatLocation(d)}</span></div>
            <div><b>主营品类</b><span>{d.categories.join(' / ') || '未填写'}</span></div>
            <div><b>企业性质</b><span>{(d.biz_types || []).join(' / ') || '未填写'}</span></div>
            <div><b>销售渠道</b><span>{(d.channels || []).join(' / ') || '未填写'}</span></div>
            <div><b>受众定位</b><span>{(d.audiences || []).join(' / ') || '未填写'}</span></div>
          </div>
        </div>
      </div>

      {d.intro && <section className="factory-detail-section"><div className="factory-section-heading">品牌介绍</div><p className="lic-intro">{d.intro}</p></section>}

      {linkedIps(d).length > 0 && (
        <section className="factory-detail-section">
          <div className="factory-section-heading">授权IP列表（包含已合作/正在合作中的IP）</div>
          <div className="lic-chip-row">
            {linkedIps(d).map(ip => <Link key={ip.id} href={`/ipbrand/detail?id=${ip.id}`} className="lic-chip lic-chip-ip">{ip.name}<span>IP档案 »</span></Link>)}
          </div>
        </section>
      )}

      {linkedFactories(d).length > 0 && (
        <section className="factory-detail-section">
          <div className="factory-section-heading">合作供应链</div>
          <div className="lic-chip-row">
            {linkedFactories(d).map(f => <Link key={f.id} href={`/factory/detail?id=${f.id}`} className="lic-chip lic-chip-factory">{f.name}<span>工厂档案 »</span></Link>)}
          </div>
        </section>
      )}

      {relatedCases.length > 0 && (
        <section className="factory-detail-section">
          <div className="factory-section-heading">相关授权案例 ({relatedCases.length})</div>
          <div className="lic-chip-row">
            {relatedCases.map(item => <Link key={item.id} href={`/case/detail?id=${item.id}`} className="lic-chip lic-chip-ip">{caseTitle(item)}<span>{[item.license_kind, item.product_category].filter(Boolean).join(' / ') || '案例详情'} »</span></Link>)}
          </div>
        </section>
      )}

      {d.images.length > 1 && <section className="factory-detail-section"><div className="factory-section-heading">产品实拍</div><div className="factory-gallery">{d.images.slice(1).map(image => <div key={image.local} onClick={() => window.open(imageUrl(image.local), '_blank')}><img src={imageUrl(image.local)} alt={d.name} loading="lazy" /></div>)}</div></section>}

      <section className="factory-detail-section"><div className="factory-section-heading">联系信息</div>{adminConfig.contact_public && d.qr_images.length ? <div className="factory-qr-grid">{d.qr_images.map(qr => <img key={qr} src={imageUrl(qr)} alt="联系二维码" />)}</div> : <div className="factory-contact-hidden">联系方式已隐藏，对接请联系管理员</div>}</section>
    </div>
  ) : null

  return <div className="factory-page"><div className="factory-detail-topbar"><Link href="/licensee" className="factory-back">‹ 返回品牌方库</Link><div className="factory-detail-title">{title}</div>{adminLoaded && isAdmin && d && <button className="factory-edit-top-btn" onClick={editing ? () => { setEditing(false); setDraft(null) } : () => { setDraft(d); setEditing(true) }}>{editing ? '取消编辑' : '✎ 编辑'}</button>}</div>{body}{editing && draft && <div className="factory-save-bar"><span>{busy ? '处理中…' : '二维码上传/删除与公开开关即时生效，其余修改点击保存'}</span><button onClick={() => { setEditing(false); setDraft(null) }} disabled={saving || busy}>取消</button><button className="primary" onClick={save} disabled={saving || busy}>{saving ? '保存中…' : '保存修改'}</button></div>}</div>
}
