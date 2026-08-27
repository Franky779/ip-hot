'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { pinyinInitial } from '@/lib/pinyin-initial'
import type { IpCase } from '@/lib/ipbrand-types'

const LETTERS = ['#', 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <div className="ipn-label">
      {children}
      {required && <span className="ipn-req">*</span>}
    </div>
  )
}

export function IpNewClient() {
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [galleryFiles, setGalleryFiles] = useState<File[]>([])
  const coverRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const [f, setF] = useState({
    name_cn: '',
    name_en: '',
    initial: '#',
    one_line_intro: '',
    category: '',
    place_origin: '',
    company: '',
    listing_date: '',
    auth_start: '',
    auth_end: '',
  })
  const [ipIntro, setIpIntro] = useState('')
  const [companyIntro, setCompanyIntro] = useState('')
  const [ages, setAges] = useState<string[]>([''])
  const [areas, setAreas] = useState<string[]>([''])
  const [industries, setIndustries] = useState<string[]>([''])
  const [cases, setCases] = useState<IpCase[]>([])

  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }))

  const setNameCn = (v: string) => {
    setF(prev => ({ ...prev, name_cn: v, initial: pinyinInitial(v) }))
  }

  const setArr = (setter: (v: string[]) => void, i: number, v: string, arr: string[]) => {
    const next = arr.slice()
    next[i] = v
    setter(next)
  }
  const addArr = (setter: (v: string[]) => void, arr: string[]) => setter([...arr, ''])
  const delArr = (setter: (v: string[]) => void, i: number, arr: string[]) => setter(arr.filter((_, idx) => idx !== i))

  const onCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setCoverFile(file)
    e.target.value = ''
  }
  const onGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) setGalleryFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  const addCase = () => setCases(prev => [...prev, { title: '', date: '' }])
  const updCase = (i: number, p: Partial<IpCase>) => setCases(prev => prev.map((c, idx) => (idx === i ? { ...c, ...p } : c)))
  const delCase = (i: number) => setCases(prev => prev.filter((_, idx) => idx !== i))

  const save = async () => {
    setError('')
    if (!f.name_cn.trim()) {
      setError('请填写 IP 中文名')
      return
    }
    setSaving(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('name_cn', f.name_cn.trim())
      fd.append('name_en', f.name_en.trim())
      fd.append('initial', f.initial)
      fd.append('one_line_intro', f.one_line_intro.trim())
      fd.append('category', f.category.trim())
      fd.append('place_origin', f.place_origin.trim())
      fd.append('company', f.company.trim())
      fd.append('listing_date', f.listing_date.trim())
      fd.append('auth_start', f.auth_start.trim())
      fd.append('auth_end', f.auth_end.trim())
      fd.append('ip_intro', ipIntro)
      fd.append('company_intro', companyIntro)
      fd.append('ages', JSON.stringify(ages.map(s => s.trim()).filter(Boolean)))
      fd.append('areas', JSON.stringify(areas.map(s => s.trim()).filter(Boolean)))
      fd.append('industries', JSON.stringify(industries.map(s => s.trim()).filter(Boolean)))
      fd.append('cases', JSON.stringify(cases.filter(c => c.title?.trim() || c.date?.trim()).map(c => ({ title: c.title, date: c.date }))))
      if (coverFile) fd.append('cover', coverFile)
      galleryFiles.forEach(fil => fd.append('files', fil))

      const res = await fetch('/api/admin/ipbrand/create', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '创建失败')
      window.location.href = `/ipbrand/detail?id=${j.id}`
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'ipn-input'
  const textareaCls = 'ipn-input ipn-textarea'

  return (
    <div className="ipb-page">
      <div className="ipd-topbar">
        <Link href="/ipbrand" className="ipd-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回列表
        </Link>
        <div className="ipd-topbar-title">新增 IP</div>
        {adminLoaded && !isAdmin ? (
          <span className="ipd-edit-hint">需要管理员身份</span>
        ) : (
          <button className="ipn-save-topbtn" onClick={save} disabled={saving}>
            {saving ? '创建中…' : '保存并查看'}
          </button>
        )}
      </div>

      <div className="ipn-main">
        {error && <div className="ipn-error">{error}</div>}
        {adminLoaded && !isAdmin ? (
          <div className="ipd-status">请先登录管理员身份再新增 IP，<Link href="/ipbrand">返回列表</Link></div>
        ) : (
          <>
            {/* 基本信息 */}
            <div className="ipn-card">
              <div className="ipn-card-title">基本信息</div>
              <div className="ipn-row">
                <div className="ipn-field">
                  <Label required>中文名</Label>
                  <input className={inputCls} value={f.name_cn} onChange={e => setNameCn(e.target.value)} placeholder="如：哆啦A梦" />
                </div>
                <div className="ipn-field">
                  <Label>英文名</Label>
                  <input className={inputCls} value={f.name_en} onChange={e => set('name_en', e.target.value)} placeholder="如：Doraemon" />
                </div>
              </div>
              <div className="ipn-row">
                <div className="ipn-field">
                  <Label>首字母（自动归类）</Label>
                  <select className={inputCls} value={f.initial} disabled title="按中文名/英文名自动归类，无需手动选择">
                    {LETTERS.map(l => <option key={l} value={l}>{l === '#' ? '# 数字/中文' : l}</option>)}
                  </select>
                </div>
                <div className="ipn-field">
                  <Label>一句话简介</Label>
                  <input className={inputCls} value={f.one_line_intro} onChange={e => set('one_line_intro', e.target.value)} placeholder="列表卡片下方的简短描述" />
                </div>
              </div>
              <div className="ipn-row">
                <div className="ipn-field">
                  <Label>封面图</Label>
                  <label className="ipn-upload">
                    {coverFile ? coverFile.name : '点击上传封面'}
                    <input ref={coverRef} type="file" accept="image/*" hidden onChange={onCover} />
                  </label>
                  {coverFile && <button className="ipn-upload-remove" onClick={() => setCoverFile(null)}>移除封面</button>}
                </div>
                <div className="ipn-field">
                  <Label>对外展示图（可多选）</Label>
                  <label className="ipn-upload">
                    {galleryFiles.length ? `已选 ${galleryFiles.length} 张` : '点击批量选择展示图'}
                    <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onGallery} />
                  </label>
                  {galleryFiles.length > 0 && (
                    <button className="ipn-upload-remove" onClick={() => setGalleryFiles([])}>清空已选</button>
                  )}
                </div>
              </div>
            </div>

            {/* 正文 */}
            <div className="ipn-card">
              <div className="ipn-card-title">介绍正文</div>
              <div className="ipn-field">
                <Label>IP 介绍</Label>
                <textarea className={textareaCls} rows={5} value={ipIntro} onChange={e => setIpIntro(e.target.value)} placeholder="IP 的详细介绍，可分多段" />
              </div>
              <div className="ipn-field">
                <Label>版权方</Label>
                <input className={inputCls} value={f.company} onChange={e => set('company', e.target.value)} placeholder="版权方公司名" />
              </div>
              <div className="ipn-field">
                <Label>版权方介绍</Label>
                <textarea className={textareaCls} rows={4} value={companyIntro} onChange={e => setCompanyIntro(e.target.value)} placeholder="版权方公司介绍" />
              </div>
            </div>

            {/* 维度信息 */}
            <div className="ipn-card">
              <div className="ipn-card-title">维度信息</div>
              <div className="ipn-row">
                <div className="ipn-field">
                  <Label>专业分类</Label>
                  <input className={inputCls} value={f.category} onChange={e => set('category', e.target.value)} placeholder="如：卡通动漫" />
                </div>
                <div className="ipn-field">
                  <Label>出品国家/地区</Label>
                  <input className={inputCls} value={f.place_origin} onChange={e => set('place_origin', e.target.value)} placeholder="如：日本" />
                </div>
              </div>
              <div className="ipn-row">
                <div className="ipn-field">
                  <Label>IP 诞生年代</Label>
                  <input className={inputCls} value={f.listing_date} onChange={e => set('listing_date', e.target.value)} placeholder="如：1969" />
                </div>
                <div className="ipn-field">
                  <Label>授权有效期</Label>
                  <div className="ipn-range">
                    <input className={inputCls} value={f.auth_start} onChange={e => set('auth_start', e.target.value)} placeholder="开始（如 2020）" />
                    <span className="ipn-range-sep">~</span>
                    <input className={inputCls} value={f.auth_end} onChange={e => set('auth_end', e.target.value)} placeholder="结束" />
                  </div>
                </div>
              </div>

              <div className="ipn-field">
                <Label>受众年龄（可多条）</Label>
                {ages.map((v, i) => (
                  <div key={i} className="ipn-multi">
                    <input className={inputCls} value={v} onChange={e => setArr(setAges, i, e.target.value, ages)} placeholder="如：3-6岁" />
                    {ages.length > 1 && <button className="ipn-mini-btn" onClick={() => delArr(setAges, i, ages)}>删除</button>}
                  </div>
                ))}
                <button className="ipn-add-btn" onClick={() => addArr(setAges, ages)}>＋ 添加受众</button>
              </div>

              <div className="ipn-field">
                <Label>可授权地区（可多条）</Label>
                {areas.map((v, i) => (
                  <div key={i} className="ipn-multi">
                    <input className={inputCls} value={v} onChange={e => setArr(setAreas, i, e.target.value, areas)} placeholder="如：中国大陆" />
                    {areas.length > 1 && <button className="ipn-mini-btn" onClick={() => delArr(setAreas, i, areas)}>删除</button>}
                  </div>
                ))}
                <button className="ipn-add-btn" onClick={() => addArr(setAreas, areas)}>＋ 添加地区</button>
              </div>

              <div className="ipn-field">
                <Label>重点授权品类（可多条）</Label>
                {industries.map((v, i) => (
                  <div key={i} className="ipn-multi">
                    <input className={inputCls} value={v} onChange={e => setArr(setIndustries, i, e.target.value, industries)} placeholder="如：服装鞋帽" />
                    {industries.length > 1 && <button className="ipn-mini-btn" onClick={() => delArr(setIndustries, i, industries)}>删除</button>}
                  </div>
                ))}
                <button className="ipn-add-btn" onClick={() => addArr(setIndustries, industries)}>＋ 添加品类</button>
              </div>
            </div>

            {/* 授权案例 */}
            <div className="ipn-card">
              <div className="ipn-card-title">
                授权案例
                <button className="ipn-add-btn" onClick={addCase}>＋ 新增案例</button>
              </div>
              {cases.length === 0 && <div className="ipn-empty">暂无案例，点「新增案例」添加（创建后可在详情页编辑态补充案例图）</div>}
              {cases.map((c, i) => (
                <div key={i} className="ipn-case">
                  <input className={inputCls} value={c.title || ''} onChange={e => updCase(i, { title: e.target.value })} placeholder="案例名称" />
                  <input className={inputCls} value={c.date || ''} onChange={e => updCase(i, { date: e.target.value })} placeholder="时间 / 授权方 / 行业" />
                  <button className="ipn-mini-btn danger" onClick={() => delCase(i)}>删除</button>
                </div>
              ))}
            </div>

            <div className="ipn-footer">
              <button className="ipd-edit-cancel" onClick={() => window.history.back()} disabled={saving}>取消</button>
              <button className="ipd-edit-save" onClick={save} disabled={saving}>
                {saving ? '创建中…' : '保存并查看'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
