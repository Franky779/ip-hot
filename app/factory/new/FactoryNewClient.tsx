'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { FACTORY_CATEGORIES, FACTORY_HUBS, FACTORY_SUPPLY_TYPES, mergeFactoryRecords, type FactoryAdminData, type FactoryConfig, type FactoryRecord } from '@/lib/factory-types'

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

export function FactoryNewClient() {
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const PREVIEW = process.env.NEXT_PUBLIC_FACTORY_PREVIEW === '1'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<ImageDraft[]>([])
  const [qrFiles, setQrFiles] = useState<File[]>([])
  const [customHubs, setCustomHubs] = useState<string[]>([])
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [factoryRecords, setFactoryRecords] = useState<FactoryRecord[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const qrRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ name: '', one_line: '', hub: '', location: '', own_brand: false, verified: false, ip_project_count: '0' })
  const [categories, setCategories] = useState<string[]>([])
  const [supplyTypes, setSupplyTypes] = useState<string[]>([])
  const set = (key: keyof typeof form, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }))
  const toggleCategory = (category: string) => setCategories(prev => prev.includes(category) ? prev.filter(item => item !== category) : [...prev, category])
  const toggleSupplyType = (type: string) => setSupplyTypes(prev => prev.includes(type) ? prev.filter(item => item !== type) : [...prev, type])

  useEffect(() => {
    Promise.all([
      fetch('/api/factory/overrides').then(response => response.ok ? response.json() as Promise<FactoryAdminData> : null),
      fetch('/factory/factories.json').then(response => response.ok ? response.json() as Promise<FactoryRecord[]> : [])
    ]).then(([admin, records]) => {
      if (admin?.config) {
        setCustomHubs(admin.config.custom_hubs || [])
        setCustomCategories(admin.config.custom_categories || [])
        setFactoryRecords(mergeFactoryRecords(records, admin))
      } else {
        setFactoryRecords(records)
      }
    }).catch(() => undefined)
  }, [])

  const persistConfig = async (patch: Partial<FactoryConfig>) => {
    const next = { contact_public: true, custom_hubs: customHubs, custom_categories: customCategories, ...patch }
    if (patch.custom_hubs) setCustomHubs(patch.custom_hubs)
    if (patch.custom_categories) setCustomCategories(patch.custom_categories)
    if (PREVIEW && !isAdmin) return
    const response = await fetch('/api/admin/factory/set-config', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body: JSON.stringify(patch) })
    if (!response.ok) throw new Error('自定义选项保存失败，请确认管理员身份')
    void next
  }

  const updateCustomHubs = async (items: string[]) => { try { await persistConfig({ custom_hubs: items }) } catch (e) { setError((e as Error).message) } }
  const updateCustomCategories = async (items: string[]) => { try { await persistConfig({ custom_categories: items }) } catch (e) { setError((e as Error).message) } }
  const canRemoveCategory = async (category: string) => {
    const related = factoryRecords.filter(record => record.categories.includes(category))
    if (related.length > 0 || categories.includes(category)) {
      const names = related.slice(0, 3).map(record => `「${record.name}」`).join('、')
      const suffix = related.length > 3 ? `等 ${related.length} 家供应链` : related.length ? `${related.length} 家供应链` : '当前正在编辑的供应链'
      window.alert(`无法删除“${category}”：${names || suffix}仍在使用该品类。请先调整相关供应链的主营品类。`)
      return false
    }
    return true
  }

  const removeCategory = async (category: string) => {
    if (FACTORY_CATEGORIES.includes(category as typeof FACTORY_CATEGORIES[number])) return
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
    if (!form.name.trim()) { setError('请填写供应链名称'); return }
    setSaving(true)
    try {
      const body = new FormData()
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)))
      body.append('categories', JSON.stringify(categories))
      body.append('supply_types', JSON.stringify(supplyTypes))
      images.forEach(image => body.append('files', image.file))
      qrFiles.forEach(file => body.append('qr_files', file))
      const response = await fetch('/api/admin/factory/create', { method: 'POST', headers: { 'x-admin-password': localStorage.getItem(ADMIN_PW_KEY) || '' }, body })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || '创建失败')
      window.location.href = `/factory/detail?id=${json.id}`
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }

  const availableHubs = [...FACTORY_HUBS, ...customHubs]
  const availableCategories = [...FACTORY_CATEGORIES, ...customCategories]

  return <div className="factory-page">
    <div className="factory-detail-topbar"><Link href="/factory" className="factory-back">‹ 返回供应链</Link><div className="factory-detail-title">新增供应链</div>{(PREVIEW || (adminLoaded && isAdmin)) && <button className="factory-new-save-top" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button>}</div>
    <main className="factory-new-main">
      {adminLoaded && !isAdmin && !PREVIEW ? <div className="factory-status">请先登录管理员身份再新增供应链，<Link href="/factory">返回列表</Link></div> : <>
        <div className="factory-form-card"><div className="factory-section-heading">基础信息</div><label>供应链名称*<input className="factory-form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="工厂名或品牌名" /></label><label>一句话定位<textarea className="factory-form-input" rows={2} value={form.one_line} onChange={e => set('one_line', e.target.value)} placeholder="如：东莞石排 · 专业潮玩盲盒代工" /></label><div className="factory-form-two"><div className="factory-field"><label>产业带<select className="factory-form-input" value={form.hub} onChange={e => set('hub', e.target.value)}><option value="">请选择</option>{availableHubs.map(item => <option key={item}>{item}</option>)}</select></label><CustomOptionManager label="产业带" items={customHubs} reserved={FACTORY_HUBS} onChange={updateCustomHubs} /></div><label>所在地<input className="factory-form-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="如：东莞石排" /></label></div></div>
        <div className="factory-form-card"><div className="factory-section-heading">主营品类</div><div className="factory-choice-grid factory-category-choice-grid">{availableCategories.map(item => <div className={`factory-category-option${categories.includes(item) ? ' selected' : ''}`} key={item}><button type="button" className="factory-category-option-toggle" onClick={() => toggleCategory(item)}>{item}</button>{!FACTORY_CATEGORIES.includes(item as typeof FACTORY_CATEGORIES[number]) && <button type="button" className="factory-category-option-delete" aria-label={`删除主营品类${item}`} onClick={() => removeCategory(item)}>×</button>}</div>)}</div><CustomOptionManager label="主营品类" items={customCategories} reserved={FACTORY_CATEGORIES} onChange={updateCustomCategories} canRemove={canRemoveCategory} /></div>
        <div className="factory-form-card"><div className="factory-section-heading">供应链属性</div><label className="factory-check-label">平台是否已验厂<input type="checkbox" checked={form.verified} onChange={e => set('verified', e.target.checked)} /><span>{form.verified ? '平台已验厂' : '未验厂'}</span></label><label className="factory-check-label">是否自有原创产品品牌<input type="checkbox" checked={form.own_brand} onChange={e => set('own_brand', e.target.checked)} /><span>{form.own_brand ? '是' : '否'}</span></label><div><div className="factory-meta-label">供应链性质（可多选）</div><div className="factory-choice-grid">{FACTORY_SUPPLY_TYPES.map(item => <button type="button" key={item} className={supplyTypes.includes(item) ? 'selected' : ''} onClick={() => toggleSupplyType(item)}>{item}</button>)}</div></div><label>合作过的原创 IP 项目数量<input className="factory-form-input" type="number" min="0" value={form.ip_project_count} onChange={e => set('ip_project_count', e.target.value)} /></label></div>
        <div className="factory-form-card"><div className="factory-section-heading">图片与联系</div><label className="factory-upload-btn">＋ 批量选择封面/工厂实拍图<input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={e => { addImages(Array.from(e.target.files || [])); e.target.value = '' }} /></label><div className="factory-file-count">{images.length ? `已选择 ${images.length} 张图片 · 第一张为封面` : '尚未选择图片'}</div>{images.length > 0 && <div className="factory-new-image-list"><div className="factory-image-sort-hint">拖动图片调整顺序，第一张将作为封面</div>{images.map((image, index) => <div className={`factory-new-image${dragIndex === index ? ' dragging' : ''}`} key={image.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={event => event.preventDefault()} onDrop={event => handleDrop(event, index)}><img src={image.preview} alt={`上传图片 ${index + 1}`} /><div className="factory-new-image-info"><strong>{index === 0 ? '封面' : `实拍图 ${index}`}</strong><span>拖动排序</span></div><div className="factory-new-image-actions"><button type="button" disabled={index === 0} onClick={() => moveImage(index, index - 1)}>↑</button><button type="button" disabled={index === images.length - 1} onClick={() => moveImage(index, index + 1)}>↓</button><button type="button" onClick={() => removeImage(index)}>删除</button></div></div>)}</div>}<label className="factory-upload-btn">＋ 选择联系二维码<input ref={qrRef} type="file" accept="image/*" multiple hidden onChange={e => { setQrFiles(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} /></label><div className="factory-file-count">{qrFiles.length ? `已选择 ${qrFiles.length} 张二维码` : '尚未选择二维码'}</div></div>
        {error && <div className="factory-form-error">{error}</div>}<div className="factory-new-footer"><button onClick={() => window.history.back()}>取消</button><button className="primary" onClick={save} disabled={saving}>{saving ? '创建中…' : '保存并查看'}</button></div>
      </>}
    </main>
  </div>
}
