'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { LICENSEE_AUDIENCES, LICENSEE_BIZ_TYPES, LICENSEE_CATEGORIES, LICENSEE_CHANNELS, LICENSEE_HUBS, mergeLicenseeRecords, type LicenseeAdminData, type LicenseeConfig, type LicenseeRecord } from '@/lib/licensee-types'

type ImageDraft = { id: string; file: File; preview: string }
type CustomOptionManagerProps = {
  label: string
  items: string[]
  reserved: readonly string[]
  onChange: (items: string[]) => Promise<void>
  canRemove?: (item: string) => Promise<boolean>
}

function CustomOptionManager({ label, items, reserved, onChange, canRemove }: CustomOptionManagerProps) {
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')

  const commit = async () => {
    const nextValue = value.trim()
    if (!nextValue) return setError('请输入名称')
    if (reserved.includes(nextValue) || items.some(item => item === nextValue && item !== editing)) return setError('这个名称已存在')
    const next = editing ? items.map(item => item === editing ? nextValue : item) : [...items, nextValue]
    await onChange(next)
    setValue('')
    setEditing(null)
    setError('')
  }

  const remove = async (item: string) => {
    if (canRemove && !(await canRemove(item))) return
    if (!window.confirm(`删除自定义${label}“${item}”？`)) return
    await onChange(items.filter(value => value !== item))
    if (editing === item) { setEditing(null); setValue('') }
  }

  return <div className="factory-custom-options">
    <div className="factory-custom-options-title">{label}管理 <span>仅管理员可保存</span></div>
    <div className="factory-custom-option-editor">
      <input className="factory-form-input" value={value} onChange={event => { setValue(event.target.value); setError('') }} placeholder={`新增${label}名称`} />
      <button type="button" className="factory-option-save" onClick={commit}>{editing ? '保存修改' : '新增'}</button>
      {editing && <button type="button" className="factory-option-cancel" onClick={() => { setEditing(null); setValue('') }}>取消</button>}
    </div>
    {error && <div className="factory-option-error">{error}</div>}
    {items.length > 0 && <div className="factory-custom-option-list">{items.map(item => <div className="factory-custom-option" key={item}><span>{item}</span><button type="button" onClick={() => { setEditing(item); setValue(item) }}>修改</button>{!reserved.includes(item) && <button type="button" className="factory-custom-option-delete" aria-label={`删除${label}${item}`} onClick={() => remove(item)}>删除</button>}</div>)}</div>}
  </div>
}

export function LicenseeNewClient() {
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImageDraft[]>([])
  const [qrFiles, setQrFiles] = useState<File[]>([])
  const [customHubs, setCustomHubs] = useState<string[]>([])
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [licenseeRecords, setLicenseeRecords] = useState<LicenseeRecord[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', name_en: '', one_line: '', company: '', founded: '', hub: '', location: '', intro: '', verified: false })
  const [categories, setCategories] = useState<string[]>([])
  const [bizTypes, setBizTypes] = useState<string[]>([])
  const [channels, setChannels] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const set = (key: keyof typeof form, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }))
  const toggleIn = (list: string[], apply: (next: string[]) => void, value: string) => apply(list.includes(value) ? list.filter(item => item !== value) : [...list, value])

  useEffect(() => {
    Promise.all([
      fetch('/api/licensee/overrides').then(response => response.ok ? response.json() as Promise<LicenseeAdminData> : null),
      fetch('/licensee/licensees.json').then(response => response.ok ? response.json() as Promise<LicenseeRecord[]> : [])
    ]).then(([admin, records]) => {
      if (admin?.config) {
        setCustomHubs(admin.config.custom_hubs || [])
        setCustomCategories(admin.config.custom_categories || [])
        setLicenseeRecords(mergeLicenseeRecords(records, admin))
      } else {
        setLicenseeRecords(records)
      }
    }).catch(() => undefined)
  }, [])

  const persistConfig = async (patch: Partial<LicenseeConfig>) => {
    if (patch.custom_hubs) setCustomHubs(patch.custom_hubs)
    if (patch.custom_categories) setCustomCategories(patch.custom_categories)
    if (!isAdmin) return
    const response = await fetch('/api/admin/licensee/set-config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify(patch) })
    if (!response.ok) throw new Error('自定义选项保存失败，请确认管理员身份')
  }

  const updateCustomHubs = async (items: string[]) => { try { await persistConfig({ custom_hubs: items }) } catch (e) { setError((e as Error).message) } }
  const updateCustomCategories = async (items: string[]) => { try { await persistConfig({ custom_categories: items }) } catch (e) { setError((e as Error).message) } }
  const canRemoveCategory = async (category: string) => {
    const related = licenseeRecords.filter(record => record.categories.includes(category))
    if (related.length > 0 || categories.includes(category)) {
      const names = related.slice(0, 3).map(record => `「${record.name}」`).join('、')
      const suffix = related.length > 3 ? `等 ${related.length} 家品牌方` : related.length ? `${related.length} 家品牌方` : '当前正在编辑的品牌方'
      window.alert(`无法删除“${category}”：${names || suffix}仍在使用该品类。请先调整相关品牌方的主营品类。`)
      return false
    }
    return true
  }

  const removeCategory = async (category: string) => {
    if ((LICENSEE_CATEGORIES as readonly string[]).includes(category)) return
    if (!(await canRemoveCategory(category))) return
    if (!window.confirm(`删除自定义主营品类“${category}”？`)) return
    await updateCustomCategories(customCategories.filter(item => item !== category))
  }

  const addImages = (files: File[]) => setImages(prev => [...prev, ...files.map((file, index) => ({ id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`, file, preview: URL.createObjectURL(file) }))])
  const removeImage = (index: number) => setImages(prev => { const target = prev[index]; if (target) URL.revokeObjectURL(target.preview); return prev.filter((_, itemIndex) => itemIndex !== index) })
  const moveImage = (from: number, to: number) => setImages(prev => { if (to < 0 || to >= prev.length) return prev; const next = [...prev]; [next[from], next[to]] = [next[to], next[from]]; return next })
  const handleDrop = (event: DragEvent<HTMLDivElement>, to: number) => { event.preventDefault(); if (dragIndex !== null && dragIndex !== to) moveImage(dragIndex, to); setDragIndex(null) }

  const save = async () => {
    setError('')
    if (!form.name.trim()) { setError('请填写品牌方名称'); return }
    setSaving(true)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)))
      body.append('categories', JSON.stringify(categories))
      body.append('biz_types', JSON.stringify(bizTypes))
      body.append('channels', JSON.stringify(channels))
      body.append('audiences', JSON.stringify(audiences))
      images.forEach(image => body.append('files', image.file))
      qrFiles.forEach(file => body.append('qr_files', file))
      const response = await fetch('/api/admin/licensee/create', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '创建失败')
      window.location.href = `/licensee/detail?id=${json.id}`
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  const availableHubs = [...LICENSEE_HUBS, ...customHubs]
  const availableCategories = [...LICENSEE_CATEGORIES, ...customCategories]

  return <div className="factory-page">
    <div className="factory-detail-topbar"><Link href="/licensee" className="factory-back">‹ 返回品牌方库</Link><div className="factory-detail-title">新增品牌方</div>{adminLoaded && isAdmin && <button className="factory-new-save-top" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button>}</div>
    <main className="factory-new-main">
      {adminLoaded && !isAdmin ? <div className="factory-status">请先登录管理员身份再新增品牌方，<Link href="/licensee">返回列表</Link></div> : <>
        <div className="factory-form-card"><div className="factory-section-heading">基础信息</div><label>品牌方名称*<input className="factory-form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="品牌名或公司简称" /></label><label>英文名<input className="factory-form-input" value={form.name_en} onChange={e => set('name_en', e.target.value)} placeholder="选填" /></label><label>一句话定位<textarea className="factory-form-input" rows={2} value={form.one_line} onChange={e => set('one_line', e.target.value)} placeholder="如：东莞 · IP授权儿童食品品牌" /></label><div className="factory-form-two"><label>公司主体<input className="factory-form-input" value={form.company} onChange={e => set('company', e.target.value)} placeholder="工商注册公司名" /></label><label>成立年份<input className="factory-form-input" value={form.founded} onChange={e => set('founded', e.target.value)} placeholder="如：2015" /></label></div><div className="factory-form-two"><div className="factory-field"><label>所在地区<select className="factory-form-input" value={form.hub} onChange={e => set('hub', e.target.value)}><option value="">请选择</option>{availableHubs.map(item => <option key={item}>{item}</option>)}</select></label><CustomOptionManager label="地区" items={customHubs} reserved={LICENSEE_HUBS} onChange={updateCustomHubs} /></div><label>详细所在地<input className="factory-form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="如：东莞东城" /></label></div></div>
        <div className="factory-form-card"><div className="factory-section-heading">主营品类</div><div className="factory-choice-grid factory-category-choice-grid">{availableCategories.map(item => <div className={`factory-category-option${categories.includes(item) ? ' selected' : ''}`} key={item}><button type="button" className="factory-category-option-toggle" onClick={() => toggleIn(categories, setCategories, item)}>{item}</button>{!(LICENSEE_CATEGORIES as readonly string[]).includes(item) && <button type="button" className="factory-category-option-delete" aria-label={`删除主营品类${item}`} onClick={() => removeCategory(item)}>×</button>}</div>)}</div><CustomOptionManager label="主营品类" items={customCategories} reserved={LICENSEE_CATEGORIES} onChange={updateCustomCategories} canRemove={canRemoveCategory} /></div>
        <div className="factory-form-card"><div className="factory-section-heading">经营属性</div><label className="factory-check-label">平台是否已认证<input type="checkbox" checked={form.verified} onChange={e => set('verified', e.target.checked)} /><span>{form.verified ? '平台已认证' : '未认证'}</span></label><div><div className="factory-meta-label">企业性质（可多选）</div><div className="factory-choice-grid">{LICENSEE_BIZ_TYPES.map(item => <button type="button" key={item} className={bizTypes.includes(item) ? 'selected' : ''} onClick={() => toggleIn(bizTypes, setBizTypes, item)}>{item}</button>)}</div></div><div><div className="factory-meta-label">销售渠道（可多选）</div><div className="factory-choice-grid">{LICENSEE_CHANNELS.map(item => <button type="button" key={item} className={channels.includes(item) ? 'selected' : ''} onClick={() => toggleIn(channels, setChannels, item)}>{item}</button>)}</div></div><div><div className="factory-meta-label">受众定位（可多选）</div><div className="factory-choice-grid">{LICENSEE_AUDIENCES.map(item => <button type="button" key={item} className={audiences.includes(item) ? 'selected' : ''} onClick={() => toggleIn(audiences, setAudiences, item)}>{item}</button>)}</div></div><label>品牌介绍<textarea className="factory-form-input" rows={4} value={form.intro} onChange={e => set('intro', e.target.value)} placeholder="品牌方的定位、商业模式、授权策略…" /></label></div>
        <div className="factory-form-card"><div className="factory-section-heading">图片与联系</div><div className="factory-hint">授权合作案例在创建后进入详情页「编辑」中添加，可把 IP 和生产工厂关联起来。</div><label className="factory-upload-btn">＋ 批量选择封面/产品实拍图<input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={e => { addImages(Array.from(e.target.files || [])); e.target.value = '' }} /></label><div className="factory-file-count">{images.length ? `已选择 ${images.length} 张图片 · 第一张为封面` : '尚未选择图片'}</div>{images.length > 0 && <div className="factory-new-image-list"><div className="factory-image-sort-hint">拖动图片调整顺序，第一张将作为封面</div>{images.map((image, index) => <div className={`factory-new-image${dragIndex === index ? ' dragging' : ''}`} key={image.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, index)}><img src={image.preview} alt={`上传图片 ${index + 1}`} /><div className="factory-new-image-info"><strong>{index === 0 ? '封面' : `实拍图 ${index}`}</strong><span>拖动排序</span></div><div className="factory-new-image-actions"><button type="button" disabled={index === 0} onClick={() => moveImage(index, index - 1)}>↑</button><button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, index + 1)}>↓</button><button type="button" onClick={() => removeImage(index)}>删除</button></div></div>)}</div>}<label className="factory-upload-btn">＋ 选择联系二维码<input ref={qrRef} type="file" accept="image/*" multiple hidden onChange={e => { setQrFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} /></label><div className="factory-file-count">{qrFiles.length ? `已选择 ${qrFiles.length} 张二维码` : '尚未选择二维码'}</div></div>
        {error && <div className="factory-form-error">{error}</div>}<div className="factory-new-footer"><button onClick={() => window.history.back()}>取消</button><button className="primary" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button></div>
      </>}
    </main>
  </div>
}
