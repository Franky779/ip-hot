'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { FACTORY_CATEGORIES, FACTORY_HUBS, FACTORY_SUPPLY_TYPES, formatLocation, mergeFactoryRecords, type FactoryAdminData, type FactoryConfig, type FactoryRecord, type FactorySupplyType } from '@/lib/factory-types'
import { VerifiedBadge } from '../VerifiedBadge'

function imageUrl(local: string) { return `/factory/${local}` }

export function FactoryDetailClient({ initialId }: { initialId: number }) {
  const [data, setData] = useState<FactoryRecord[] | null>(null)
  const [adminConfig, setAdminConfig] = useState<FactoryConfig>({ contact_public: true, custom_hubs: [], custom_categories: [] })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<FactoryRecord | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const imageInput = useRef<HTMLInputElement>(null)
  const qrInput = useRef<HTMLInputElement>(null)
  const d = data?.find(item => item.id === initialId)
  const title = d?.name || '供应链详情'

  useEffect(() => {
    Promise.all([
      fetch('/factory/factories.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<FactoryRecord[]> }),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve({ deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } } as FactoryAdminData)),
    ])
      .then(([records, admin]) => { setData(mergeFactoryRecords(records, admin)); setAdminConfig(admin.config || { contact_public: true }) })
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => { if (d) document.title = `${d.name} · IP工厂供应链` }, [d])

  const patch = (changes: Partial<FactoryRecord>) => setDraft(prev => prev ? { ...prev, ...changes } : prev)
  const toggleCategory = (category: string) => patch({ categories: draft?.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...(draft?.categories || []), category] })
  const toggleSupplyType = (type: FactorySupplyType) => patch({ supply_types: (draft?.supply_types || []).includes(type) ? (draft?.supply_types || []).filter(item => item !== type) : [...(draft?.supply_types || []), type] })
  const moveImage = (index: number, direction: -1 | 1) => setDraft(prev => {
    if (!prev) return prev
    const images = [...prev.images]
    const next = index + direction
    if (next < 0 || next >= images.length) return prev
    ;[images[index], images[next]] = [images[next], images[index]]
    return { ...prev, images }
  })
  const deleteImage = (index: number) => patch({ images: (draft?.images || []).filter((_, i) => i !== index) })

  const uploadImages = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append('id', String(d.id)); form.append('name', d.name); files.forEach(file => form.append('files', file))
      const response = await fetch('/api/admin/factory/upload-images', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: form })
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
      const response = await fetch('/api/admin/factory/upload-qr', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: form })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '二维码上传失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? { ...item, qr_images: [...item.qr_images, ...json.files.map((file: { local: string }) => file.local)] } : item) : prev)
      setDraft(prev => prev ? { ...prev, qr_images: [...prev.qr_images, ...json.files.map((file: { local: string }) => file.local)] } : prev)
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const deleteQr = async (local: string) => {
    if (!d) return
    const parts = local.split('/')
    const name = parts.pop() || ''
    const folder = parts.pop() || ''
    setBusy(true)
    try {
      const response = await fetch('/api/admin/factory/delete-qr', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ id: d.id, name, folder }) })
      if (!response.ok) throw new Error('删除二维码失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? { ...item, qr_images: item.qr_images.filter(qr => qr !== local) } : item) : prev)
      setDraft(prev => prev ? { ...prev, qr_images: prev.qr_images.filter(qr => qr !== local) } : prev)
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const setContactPublic = async (value: boolean) => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/factory/set-config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ contact_public: value }) })
      if (!response.ok) throw new Error('设置失败')
      setAdminConfig({ ...adminConfig, contact_public: value })
    } catch (error) { alert((error as Error).message) } finally { setBusy(false) }
  }

  const save = async () => {
    if (!d || !draft) return
    setSaving(true)
    try {
      const response = await fetch('/api/admin/factory/save-edit', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify({ id: d.id, edit: draft }) })
      if (!response.ok) throw new Error('保存失败')
      setData(prev => prev ? prev.map(item => item.id === d.id ? draft : item) : prev)
      setEditing(false); setDraft(null)
    } catch (error) { alert((error as Error).message) } finally { setSaving(false) }
  }

  const body = loadError ? <div className="factory-status">数据加载失败，请刷新重试</div> : !data ? <div className="factory-status">加载中…</div> : !d ? <div className="factory-status">没有找到该供应链，<Link href="/factory">返回列表</Link></div> : editing && draft ? (
    <div className="factory-detail-main editing">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{draft.images[0] ? <img src={imageUrl(draft.images[0].local)} alt={draft.name} /> : <div className="factory-detail-placeholder">{draft.name.slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <input className="factory-edit-input factory-edit-name" value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="供应链名称" />
          <textarea className="factory-edit-input factory-edit-line" rows={2} value={draft.one_line} onChange={e => patch({ one_line: e.target.value })} placeholder="一句话定位" />
          <div className="factory-hint">第一张图片为封面，可在下方图廊中调整顺序。</div>
        </div>
      </div>

      <section className="factory-edit-section">
        <div className="factory-section-heading">维度信息</div>
        <div className="factory-edit-meta-grid">
          <label className="factory-check-label">平台是否已验厂<input type="checkbox" checked={!!draft.verified} onChange={e => patch({ verified: e.target.checked })} /><span>{draft.verified ? '平台已验厂' : '未验厂'}</span></label>
          <label>产业带<select className="factory-edit-input" value={draft.hub} onChange={e => patch({ hub: e.target.value })}><option value="">请选择</option>{FACTORY_HUBS.map(item => <option key={item}>{item}</option>)}</select></label>
          <label>所在地<input className="factory-edit-input" value={draft.location} onChange={e => patch({ location: e.target.value })} placeholder="如：东莞石排" /></label>
          <label>已落地 IP 项目数量<input className="factory-edit-input" type="number" min="0" value={draft.ip_project_count} onChange={e => patch({ ip_project_count: Math.max(0, Number(e.target.value) || 0) })} /></label>
          <label className="factory-check-label">是否自有原创产品品牌<input type="checkbox" checked={draft.own_brand} onChange={e => patch({ own_brand: e.target.checked })} /><span>{draft.own_brand ? '是' : '否'}</span></label>
        </div>
        <div className="factory-category-edit"><div className="factory-meta-label">供应链性质（可多选）</div><div className="factory-choice-grid">{FACTORY_SUPPLY_TYPES.map(item => <button key={item} className={(draft.supply_types || []).includes(item) ? 'selected' : ''} onClick={() => toggleSupplyType(item)}>{item}</button>)}</div></div>
        <div className="factory-category-edit"><div className="factory-meta-label">主营品类（可多选）</div><div className="factory-choice-grid">{FACTORY_CATEGORIES.map(item => <button key={item} className={draft.categories.includes(item) ? 'selected' : ''} onClick={() => toggleCategory(item)}>{item}</button>)}</div></div>
      </section>

      <section className="factory-edit-section"><div className="factory-section-heading">工厂图片</div><label className="factory-upload-btn">＋ 批量上传图片<input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadImages(files); e.target.value = '' }} /></label><div className="factory-edit-gallery">{draft.images.map((image, index) => <div className="factory-edit-image" key={image.local}><img src={imageUrl(image.local)} alt="供应链图片" /><div><button disabled={index === 0} onClick={() => moveImage(index, -1)}>↑</button><button disabled={index === draft.images.length - 1} onClick={() => moveImage(index, 1)}>↓</button><button onClick={() => deleteImage(index)}>删除</button></div></div>)}</div></section>

      <section className="factory-edit-section"><div className="factory-section-heading">联系二维码</div><div className="factory-hint">联系方式公开开关：{adminConfig.contact_public ? '当前公开' : '当前隐藏'}</div><div className="factory-contact-edit-actions"><button className="factory-upload-btn" onClick={() => setContactPublic(!adminConfig.contact_public)}>{adminConfig.contact_public ? '隐藏联系方式' : '公开联系方式'}</button><label className="factory-upload-btn">＋ 上传二维码<input ref={qrInput} type="file" accept="image/*" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); if (files.length) uploadQr(files); e.target.value = '' }} /></label></div><div className="factory-qr-grid">{draft.qr_images.map(qr => <div className="factory-qr-item" key={qr}><img src={imageUrl(qr)} alt="联系二维码" /><button onClick={() => deleteQr(qr)}>删除</button></div>)}</div></section>
    </div>
  ) : d ? (
    <div className="factory-detail-main">
      <div className="factory-detail-hero">
        <div className="factory-detail-cover">{d.images[0] ? <img src={imageUrl(d.images[0].local)} alt={d.name} /> : <div className="factory-detail-placeholder">{d.name.slice(0, 1)}</div>}</div>
        <div className="factory-detail-info">
          <h1>{d.name}{d.verified && <VerifiedBadge size={20} />}</h1>
          <p className="factory-detail-line">{d.one_line || '暂无定位信息'}</p>
          <div className="factory-meta-grid factory-meta-in-hero">
            <div className="factory-verified-item"><b>平台是否已验厂</b><span className={d.verified ? 'verified-yes' : 'verified-no'}>{d.verified ? <span className="verified-yes"><VerifiedBadge size={16} />平台已验厂</span> : '未验厂'}</span></div>
            <div><b>主营品类</b><span>{d.categories.join(' / ') || '未填写'}</span></div>
            <div><b>产业带</b><span>{d.hub || '未填写'}</span></div>
            <div className="factory-meta-location"><b>所在地</b><span>{formatLocation(d)}</span></div>
            <div className="factory-meta-own-brand"><b>自有原创产品品牌</b><span>{d.own_brand ? '是' : '否'}</span></div>
            <div className="factory-meta-supply"><b>供应链性质</b><span>{(d.supply_types || []).join(' / ') || '未填写'}</span></div>
            <div className="factory-meta-projects"><b>已落地 IP 项目</b><span>{d.ip_project_count} 个</span></div>
          </div>
        </div>
      </div>
      {d.images.length > 1 && <section className="factory-detail-section"><div className="factory-section-heading">工厂实拍</div><div className="factory-gallery">{d.images.slice(1).map(image => <div key={image.local} onClick={() => window.open(imageUrl(image.local), '_blank')}><img src={imageUrl(image.local)} alt={d.name} loading="lazy" /></div>)}</div></section>}
      <section className="factory-detail-section"><div className="factory-section-heading">联系信息</div>{adminConfig.contact_public && d.qr_images.length ? <div className="factory-qr-grid">{d.qr_images.map(qr => <img key={qr} src={imageUrl(qr)} alt="联系二维码" />)}</div> : <div className="factory-contact-hidden">联系方式已隐藏，对接请联系管理员</div>}</section>
    </div>
  ) : null

  return <div className="factory-page"><div className="factory-detail-topbar"><Link href="/factory" className="factory-back">‹ 返回供应链</Link><div className="factory-detail-title">{title}</div>{adminLoaded && isAdmin && d && <button className="factory-edit-top-btn" onClick={editing ? () => { setEditing(false); setDraft(null) } : () => { setDraft(d); setEditing(true) }}>{editing ? '取消编辑' : '✎ 编辑'}</button>}</div>{body}{editing && draft && <div className="factory-save-bar"><span>{busy ? '处理中…' : '二维码上传/删除与公开开关即时生效，其余修改点击保存'}</span><button onClick={() => { setEditing(false); setDraft(null) }} disabled={saving || busy}>取消</button><button className="primary" onClick={save} disabled={saving || busy}>{saving ? '保存中…' : '保存修改'}</button></div>}</div>
}
