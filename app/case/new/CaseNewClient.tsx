'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { CASE_CITIES, CASE_LICENSE_KINDS, CASE_PRODUCT_CATEGORIES, type CaseAdminData, type CaseConfig, type CaseRecord } from '@/lib/case-types'
import { mergeLicenseeRecords, type LicenseeAdminData, type LicenseeRecord } from '@/lib/licensee-types'
import { mergeFactoryRecords, type FactoryAdminData, type FactoryRecord } from '@/lib/factory-types'
import type { IpRecord } from '@/lib/ipbrand-types'

type ImageDraft = { id: string; file: File; preview: string }

const EMPTY_LICENSEE_ADMIN: LicenseeAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }
const EMPTY_FACTORY_ADMIN: FactoryAdminData = { deleted: [], edits: {}, new_records: [], config: { contact_public: true, custom_hubs: [], custom_categories: [] } }

export function CaseNewClient() {
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImageDraft[]>([])
  const [config, setConfig] = useState<CaseConfig>({ custom_categories: [], custom_cities: [] })
  const [licensees, setLicensees] = useState<LicenseeRecord[]>([])
  const [factories, setFactories] = useState<FactoryRecord[]>([])
  const [ipLibrary, setIpLibrary] = useState<IpRecord[] | null>(null)
  const [ipLoading, setIpLoading] = useState(false)
  const [ipSearch, setIpSearch] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    ip_id: 0, ip_name: '',
    licensee_id: 0, licensee_name: '',
    factory_id: 0, factory_name: '',
    license_kind: '', product_category: '', city: '', case_date: '',
    description: '', source_url: '',
  })
  const set = (key: keyof typeof form, value: string | number) => setForm(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    Promise.all([
      fetch('/api/case/overrides').then(r => r.ok ? r.json() as Promise<CaseAdminData> : null),
      fetch('/licensee/licensees.json').then(r => r.ok ? r.json() as Promise<LicenseeRecord[]> : []),
      fetch('/api/licensee/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_LICENSEE_ADMIN)),
      fetch('/factory/factories.json').then(r => r.ok ? r.json() as Promise<FactoryRecord[]> : []),
      fetch('/api/factory/overrides').then(r => r.ok ? r.json() : Promise.resolve(EMPTY_FACTORY_ADMIN)),
    ]).then(([admin, licenseeRecords, licenseeAdmin, factoryRecords, factoryAdmin]) => {
      if (admin?.config) setConfig(admin.config)
      setLicensees(mergeLicenseeRecords(licenseeRecords, licenseeAdmin))
      setFactories(mergeFactoryRecords(factoryRecords, factoryAdmin))
    }).catch(() => undefined)
  }, [])

  const loadIpLibrary = () => {
    if (ipLibrary !== null || ipLoading) return
    setIpLoading(true)
    fetch('/ipbrand/ips.json')
      .then(r => r.ok ? r.json() as Promise<IpRecord[]> : [])
      .then(records => setIpLibrary(records))
      .catch(() => setIpLibrary([]))
      .finally(() => setIpLoading(false))
  }

  const keyword = ipSearch.trim().toLowerCase()
  const ipHits = ipLibrary && keyword ? ipLibrary.filter(ip => (ip.name_cn || '').toLowerCase().includes(keyword) || (ip.name_en || '').toLowerCase().includes(keyword)).slice(0, 8) : []

  const pickIp = (ip: IpRecord) => {
    setForm(prev => ({ ...prev, ip_id: ip.id, ip_name: ip.name_cn || ip.name_en }))
    setIpSearch('')
  }
  const pickLicensee = (licenseeId: number) => {
    const target = licensees.find(item => item.id === licenseeId)
    setForm(prev => target ? { ...prev, licensee_id: target.id, licensee_name: target.name } : { ...prev, licensee_id: 0 })
  }
  const pickFactory = (factoryId: number) => {
    const target = factories.find(item => item.id === factoryId)
    setForm(prev => target ? { ...prev, factory_id: target.id, factory_name: target.name } : { ...prev, factory_id: 0 })
  }

  const addImages = (files: File[]) => setImages(prev => [...prev, ...files.map((file, index) => ({ id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, file, preview: URL.createObjectURL(file) }))])
  const removeImage = (index: number) => setImages(prev => { const target = prev[index]; if (target) URL.revokeObjectURL(target.preview); return prev.filter((_, itemIndex) => itemIndex !== index) })
  const moveImage = (from: number, to: number) => setImages(prev => { if (to < 0 || to >= prev.length) return prev; const next = [...prev]; [next[from], next[to]] = [next[to], next[from]]; return next })
  const handleDrop = (event: DragEvent<HTMLDivElement>, to: number) => { event.preventDefault(); if (dragIndex !== null && dragIndex !== to) moveImage(dragIndex, to); setDragIndex(null) }

  const save = async () => {
    setError('')
    if (!form.ip_name.trim() && !form.licensee_name.trim()) { setError('请至少填写 IP 名称或品牌方名称'); return }
    setSaving(true)
    try {
      const body = new FormData()
      body.append('ip_id', String(form.ip_id)); body.append('ip_name', form.ip_name)
      body.append('licensee_id', String(form.licensee_id)); body.append('licensee_name', form.licensee_name)
      body.append('factory_id', String(form.factory_id)); body.append('factory_name', form.factory_name)
      body.append('license_kind', form.license_kind); body.append('product_category', form.product_category)
      body.append('city', form.city); body.append('case_date', form.case_date)
      body.append('description', form.description); body.append('source_url', form.source_url)
      body.append('social', 'null')
      images.forEach(image => body.append('files', image.file))
      const response = await fetch('/api/admin/case/create', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '创建失败')
      window.location.href = `/case/detail?id=${json.id}`
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  const availableCategories = [...CASE_PRODUCT_CATEGORIES, ...config.custom_categories]
  const availableCities = [...CASE_CITIES, ...config.custom_cities]

  return <div className="factory-page">
    <div className="factory-detail-topbar"><Link href="/case" className="factory-back">‹ 返回案例库</Link><div className="factory-detail-title">新增授权案例</div>{adminLoaded && isAdmin && <button className="factory-new-save-top" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button>}</div>
    <main className="factory-new-main">
      {adminLoaded && !isAdmin ? <div className="factory-status">请先登录管理员身份再新增案例，<Link href="/case">返回案例库</Link></div> : <>
        <div className="factory-form-card">
          <div className="factory-section-heading">三方关联</div>
          <div className="factory-hint">从库里选择后可跳转对方档案；不在库中则手填名称纯文本展示。工厂信息没有可留空。</div>
          <div className="factory-form-two">
            <label>IP 名称<input className="factory-form-input" value={form.ip_name} onChange={e => set('ip_name', e.target.value)} placeholder="如：经典奥特曼" /></label>
            <label>IP 库编号<input className="factory-form-input" type="number" min="0" value={form.ip_id || ''} onChange={e => set('ip_id', Math.max(0, Number(e.target.value) || 0))} placeholder="0 = 未关联" /></label>
          </div>
          <div className="lic-ip-search">
            {ipLibrary === null
              ? <button type="button" className="factory-upload-btn" onClick={loadIpLibrary} disabled={ipLoading}>{ipLoading ? '载入IP库中…' : '从IP品牌库搜索并填入'}</button>
              : <input className="factory-form-input" value={ipSearch} onChange={e => setIpSearch(e.target.value)} placeholder="输入IP名搜索，点结果自动填入编号" />}
            {ipHits.length > 0 && <div className="lic-ip-hits">{ipHits.map(ip => <button type="button" key={ip.id} onClick={() => pickIp(ip)}>{ip.name_cn || ip.name_en}<span>#{ip.id}</span></button>)}</div>}
          </div>
          <div className="factory-form-two">
            <label>品牌方（被授权商）<select className="factory-form-input" value={form.licensee_id || ''} onChange={e => pickLicensee(Number(e.target.value) || 0)}><option value="">未关联 / 不在库中</option>{licensees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>品牌方名称（未关联时手填）<input className="factory-form-input" value={form.licensee_name} onChange={e => set('licensee_name', e.target.value)} placeholder="选了库里品牌方会自动填入" disabled={form.licensee_id > 0} /></label>
          </div>
          <div className="factory-form-two">
            <label>生产工厂<select className="factory-form-input" value={form.factory_id || ''} onChange={e => pickFactory(Number(e.target.value) || 0)}><option value="">未关联 / 不在库中</option>{factories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>工厂名称（未关联时手填）<input className="factory-form-input" value={form.factory_name} onChange={e => set('factory_name', e.target.value)} placeholder="无工厂信息留空" disabled={form.factory_id > 0} /></label>
          </div>
        </div>

        <div className="factory-form-card">
          <div className="factory-section-heading">案例信息</div>
          <div className="factory-form-two">
            <label>授权分类<select className="factory-form-input" value={form.license_kind} onChange={e => set('license_kind', e.target.value)}><option value="">请选择</option>{CASE_LICENSE_KINDS.map(item => <option key={item}>{item}</option>)}</select></label>
            <label>案例品类<select className="factory-form-input" value={form.product_category} onChange={e => set('product_category', e.target.value)}><option value="">请选择</option>{availableCategories.map(item => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="factory-form-two">
            <label>城市<select className="factory-form-input" value={form.city} onChange={e => set('city', e.target.value)}><option value="">请选择</option>{availableCities.map(item => <option key={item}>{item}</option>)}</select></label>
            <label>案例时间<input className="factory-form-input" value={form.case_date} onChange={e => set('case_date', e.target.value)} placeholder="如：2026-03" /></label>
          </div>
          <label>案例描述<textarea className="factory-form-input" rows={4} value={form.description} onChange={e => set('description', e.target.value)} placeholder="案例背景、合作内容、落地效果…" /></label>
          <label>信息来源网址<input className="factory-form-input" value={form.source_url} onChange={e => set('source_url', e.target.value)} placeholder="https://…" /></label>
        </div>

        <div className="factory-form-card">
          <div className="factory-section-heading">案例图片</div>
          <label className="factory-upload-btn">＋ 批量选择案例图片<input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={e => { addImages(Array.from(e.target.files || [])); e.target.value = '' }} /></label>
          <div className="factory-file-count">{images.length ? `已选择 ${images.length} 张图片 · 第一张为封面` : '尚未选择图片'}</div>
          {images.length > 0 && <div className="factory-new-image-list"><div className="factory-image-sort-hint">拖动图片调整顺序，第一张将作为封面</div>{images.map((image, index) => <div className={`factory-new-image${dragIndex === index ? ' dragging' : ''}`} key={image.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, index)}><img src={image.preview} alt={`上传图片 ${index + 1}`} /><div className="factory-new-image-info"><strong>{index === 0 ? '封面' : `图片 ${index}`}</strong><span>拖动排序</span></div><div className="factory-new-image-actions"><button type="button" disabled={index === 0} onClick={() => moveImage(index, index - 1)}>↑</button><button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, index + 1)}>↓</button><button type="button" onClick={() => removeImage(index)}>删除</button></div></div>)}</div>}
        </div>

        {error && <div className="factory-form-error">{error}</div>}<div className="factory-new-footer"><button onClick={() => window.history.back()}>取消</button><button className="primary" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button></div>
      </>}
    </main>
  </div>
}
