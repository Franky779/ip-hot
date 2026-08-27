'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAdmin, ADMIN_PW_KEY } from '../../components/AdminToggle'
import { mergeIpRecords, dedupeIpNews, EMPTY_ADMIN, type IpBrandEdit, type IpBrandOptionField, type IpCustomCard, type IpNews, type IpRecord, type IpImage, type IpCase } from '@/lib/ipbrand-types'
import { licenseesByIp, mergeLicenseeRecords, type LicenseeAdminData, type LicenseeRecord } from '@/lib/licensee-types'

type FeedArticle = IpNews

const EMPTY_OPTIONS: Record<IpBrandOptionField, string[]> = {
  category: [],
  place_origin: [],
  ages: [],
  industries: [],
}

const OPTION_FIELD_LABEL: Record<IpBrandOptionField, string> = {
  category: '专业分类',
  place_origin: '出品国家/地区',
  ages: '受众',
  industries: '重点授权品类',
}

const ARRAY_OPTION_FIELDS = new Set<IpBrandOptionField>(['ages', 'industries'])

// 提取 IP 核心名用于快讯搜索：去掉冒号/括号后的副标题后缀，去掉书名号，避免完整名匹配不到快讯标题
function coreSearchName(name: string): string {
  const seg = name.split(/[：:·—–]|[（(【［]/)[0]
  return seg.replace(/[《》「」『』]/g, '').trim()
}

// 各固定卡片的默认标题（管理员可改，存到 section_titles）
const DEFAULT_TITLES: Record<string, string> = {
  ip_intro: 'IP 介绍',
  company_intro: '版权方介绍',
  gallery: '对外展示图',
  cases: '授权案例',
  news: '相关新闻',
  event_plan: 'IP快闪/美陈方案',
  manual: '品牌手册',
}

function secTitle(d: IpRecord | null | undefined, key: string): string {
  return d?.section_titles?.[key] || DEFAULT_TITLES[key] || key
}

export function IpDetailClient({ initialId }: { initialId: number }) {
  const [data, setData] = useState<IpRecord[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [linkedLicensees, setLinkedLicensees] = useState<LicenseeRecord[]>([])
  const [feedNews, setFeedNews] = useState<FeedArticle[]>([])
  const [newsBusy, setNewsBusy] = useState(false)
  const [newsError, setNewsError] = useState('')
  const [options, setOptions] = useState(EMPTY_OPTIONS)
  const [optionManager, setOptionManager] = useState<{ field: IpBrandOptionField } | null>(null)
  const [newOptionValue, setNewOptionValue] = useState('')
  const [renamingOption, setRenamingOption] = useState<{ field: IpBrandOptionField; from: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [openPicker, setOpenPicker] = useState<IpBrandOptionField | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<IpRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  const ipId = initialId
  const galleryRef = useRef<HTMLInputElement>(null)
  const caseImgRef = useRef<HTMLInputElement>(null)
  const manualRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/ipbrand/ips.json').then(r => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<IpRecord[]>
      }),
      fetch('/api/ipbrand/overrides').then(r => (r.ok ? r.json() : Promise.resolve(EMPTY_ADMIN))),
    ])
      .then(([records, admin]) => setData(mergeIpRecords(records, admin)))
      .catch(() => setLoadError(true))
  }, [])

  // 并行读取全站词库选项（失败用空数组，不阻止详情页展示）
  useEffect(() => {
    fetch('/api/ipbrand/options')
      .then(r => (r.ok ? r.json() : null))
      .then(res => {
        if (res && typeof res === 'object') setOptions({ ...EMPTY_OPTIONS, ...res })
      })
      .catch(() => {})
  }, [])

  // 反向联动：拉品牌方库，筛出授权案例里关联了当前 IP 的品牌方（失败则隐藏该区块）
  useEffect(() => {
    if (!ipId || ipId <= 0) return
    Promise.all([
      fetch('/licensee/licensees.json').then(r => (r.ok ? r.json() as Promise<LicenseeRecord[]> : [])),
      fetch('/api/licensee/overrides').then(r => (r.ok ? r.json() : Promise.resolve(null))),
    ])
      .then(([records, admin]) => {
        const merged = admin ? mergeLicenseeRecords(records, admin as LicenseeAdminData) : records
        setLinkedLicensees(licenseesByIp(merged, ipId))
      })
      .catch(() => setLinkedLicensees([]))
  }, [ipId])

  const d = data && ipId && ipId > 0 ? data.find(x => x.id === ipId) : undefined
  const title = d ? d.name_cn || d.name_en || '(未命名)' : 'IP 详情'

  useEffect(() => {
    if (d) document.title = `${title} · IP品牌库`
  }, [d, title])

  // 按名称与简介多关键词自动匹配快讯；成功返回匹配列表，失败返回 null
  const matchNews = async (source: IpRecord): Promise<FeedArticle[] | null> => {
    const keywords = [
      coreSearchName(source.name_cn || ''),
      coreSearchName(source.name_en || ''),
      source.one_line_intro,
      source.ip_intro,
    ]
      .map(kw => kw.trim())
      .filter(Boolean)
    const unique = [...new Set(keywords)].slice(0, 5)
    if (unique.length === 0) {
      setFeedNews([])
      return []
    }
    setNewsBusy(true)
    setNewsError('')
    try {
      const params = new URLSearchParams()
      unique.forEach(kw => params.append('q', kw))
      const res = await fetch(`/api/articles/search?${params.toString()}`)
      const data = res.ok ? await res.json() : { articles: [] }
      const articles = dedupeIpNews(data.articles || []) as FeedArticle[]
      setFeedNews(articles)
      return articles
    } catch {
      setNewsError('自动匹配失败，请重试')
      return null
    } finally {
      setNewsBusy(false)
    }
  }

  // 拉取全球快讯中该 IP 的相关资讯：管理员保存过则直接用，否则按名称/简介多关键词自动匹配
  // （微任务里触发，避免在 effect 内同步调用 setState 造成级联渲染）
  useEffect(() => {
    if (!d) return
    if (d.related_news !== undefined) {
      const saved = d.related_news || []
      queueMicrotask(() => setFeedNews(saved))
      return
    }
    queueMicrotask(() => { void matchNews(d) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  // 编辑态：用当前草稿重新自动匹配，并把结果作为覆盖保存进草稿（空结果也保存为空）
  const autoMatchNews = async () => {
    if (!draft) return
    const matches = await matchNews(draft)
    if (matches !== null) patch({ related_news: matches })
  }

  /* ---------- 编辑态操作 ---------- */

  const patch = (p: Partial<IpRecord>) => setDraft(prev => (prev ? { ...prev, ...p } : prev))
  const setSecTitle = (key: string, v: string) =>
    setDraft(prev => (prev ? { ...prev, section_titles: { ...(prev.section_titles || {}), [key]: v } } : prev))

  /* ---------- 全站词库操作 ---------- */

  // 统一调用管理员词库接口；成功后用返回的 options 刷新本地词库
  const mutateOption = async (action: 'add' | 'rename' | 'delete', field: IpBrandOptionField, value: string, newValue?: string) => {
    const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
    const res = await fetch('/api/admin/ipbrand/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
      body: JSON.stringify({ action, field, value, newValue }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `操作失败 (${res.status})`)
    setOptions({ ...EMPTY_OPTIONS, ...data })
    return data
  }

  // 新增选项：成功后自动把新值加入当前草稿对应字段
  const addOption = async (field: IpBrandOptionField) => {
    const value = newOptionValue.trim()
    if (!value) return
    try {
      await mutateOption('add', field, value)
      setDraft(prev => {
        if (!prev) return prev
        if (ARRAY_OPTION_FIELDS.has(field)) {
          const arr = prev[field] || []
          return arr.includes(value) ? prev : { ...prev, [field]: [...arr, value] }
        }
        return prev[field] ? prev : { ...prev, [field]: value }
      })
      setNewOptionValue('')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  // 改名选项：服务端同步所有关联记录后，把当前草稿里的旧值一并替换
  const renameOptionUi = async (field: IpBrandOptionField, from: string) => {
    const to = renameValue.trim()
    if (!to || to === from) return
    try {
      await mutateOption('rename', field, from, to)
      setDraft(prev => {
        if (!prev) return prev
        if (ARRAY_OPTION_FIELDS.has(field)) {
          const arr = Array.isArray(prev[field]) ? (prev[field] as string[]) : []
          return { ...prev, [field]: arr.map(v => (v === from ? to : v)) }
        }
        return prev[field] === from ? { ...prev, [field]: to } : prev
      })
      setRenamingOption(null)
      setRenameValue('')
    } catch (e) {
      alert((e as Error).message)
    }
  }

  // 删除选项：有关联时服务端返回 409 原文提示，仅关联清零才删除
  const deleteOption = async (field: IpBrandOptionField, value: string) => {
    const ok = window.confirm(`确定删除选项「${value}」吗？仍有关联时会阻止删除。`)
    if (!ok) return
    try {
      await mutateOption('delete', field, value)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  // 上传图片：gallery 追加展示图 / case 生成新案例条目 / cover 替换封面
  const uploadImages = async (files: File[], mode: 'gallery' | 'case' | 'cover') => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('id', String(d.id))
      fd.append('name_cn', d.name_cn || '')
      files.forEach(f => fd.append('files', f))
      const res = await fetch('/api/admin/ipbrand/upload-images', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '上传失败')
      if (mode === 'gallery') {
        const imgs: IpImage[] = j.files.map((f: { local: string }) => ({ type: 'gallery', local: f.local }))
        setDraft(prev => (prev ? { ...prev, images: [...(prev.images || []), ...imgs] } : prev))
      } else if (mode === 'case') {
        const cases: IpCase[] = j.files.map((f: { local: string }) => ({ title: '', date: '', image: `/ipbrand/${f.local}` }))
        setDraft(prev => (prev ? { ...prev, licensor_case_list: [...(prev.licensor_case_list || []), ...cases] } : prev))
      } else {
        patch({ cover: j.files[0].local })
      }
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 品牌手册：上传（即时生效）
  const uploadManual = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('id', String(d.id))
      files.forEach(f => fd.append('files', f))
      const res = await fetch('/api/admin/ipbrand/upload-manual', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '上传失败')
      const urls = j.files.map((f: { url: string }) => f.url)
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, brand_manual_images: [...(x.brand_manual_images || []), ...urls] } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 品牌手册：删除单张（即时生效）
  const delManual = async (url: string) => {
    if (!d) return
    const name = url.split('/').pop() || ''
    if (!name) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const res = await fetch('/api/admin/ipbrand/delete-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: d.id, name }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '删除失败')
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, brand_manual_images: (x.brand_manual_images || []).filter(u => u !== url) } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 品牌手册：替换单张（先传新图，成功后删旧图）
  const replaceManual = async (url: string, file: File) => {
    if (!d) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('id', String(d.id))
      fd.append('files', file)
      const res = await fetch('/api/admin/ipbrand/upload-manual', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '替换失败')
      const newUrl = j.files[0].url
      const name = url.split('/').pop() || ''
      await fetch('/api/admin/ipbrand/delete-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: d.id, name }),
      })
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, brand_manual_images: [...(x.brand_manual_images || []).filter(u => u !== url), newUrl] } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // IP快闪/美陈方案：上传（即时生效）
  const uploadEventPlan = async (files: File[]) => {
    if (!d || !files.length) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('id', String(d.id))
      files.forEach(f => fd.append('files', f))
      const res = await fetch('/api/admin/ipbrand/upload-event-plan', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '上传失败')
      const urls = j.files.map((f: { url: string }) => f.url)
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, ip_event_plan_images: [...(x.ip_event_plan_images || []), ...urls] } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // IP快闪/美陈方案：删除单张（即时生效）
  const delEventPlan = async (url: string) => {
    if (!d) return
    const name = url.split('/').pop() || ''
    if (!name) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const res = await fetch('/api/admin/ipbrand/delete-event-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: d.id, name }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '删除失败')
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, ip_event_plan_images: (x.ip_event_plan_images || []).filter(u => u !== url) } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // IP快闪/美陈方案：替换单张（先传新图，成功后删旧图）
  const replaceEventPlan = async (url: string, file: File) => {
    if (!d) return
    setBusy(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const fd = new FormData()
      fd.append('id', String(d.id))
      fd.append('files', file)
      const res = await fetch('/api/admin/ipbrand/upload-event-plan', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
        body: fd,
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '替换失败')
      const newUrl = j.files[0].url
      const name = url.split('/').pop() || ''
      await fetch('/api/admin/ipbrand/delete-event-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: d.id, name }),
      })
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, ip_event_plan_images: [...(x.ip_event_plan_images || []).filter(u => u !== url), newUrl] } : x)) : prev))
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // 保存所有卡片/文字/图片元数据
  const save = async () => {
    if (!d || !draft) return
    setSaving(true)
    try {
      const pw = localStorage.getItem(ADMIN_PW_KEY) || ''
      const edit: IpBrandEdit = {
        name_cn: draft.name_cn,
        name_en: draft.name_en,
        one_line_intro: draft.one_line_intro,
        ip_intro: draft.ip_intro,
        company_intro: draft.company_intro,
        category: draft.category,
        place_origin: draft.place_origin,
        company: draft.company,
        areas: draft.areas,
        ages: draft.ages,
        industries: draft.industries,
        listing_date: draft.listing_date,
        auth_start: draft.auth_start,
        auth_end: draft.auth_end,
        cover: draft.cover,
        images: draft.images,
        licensor_case_list: draft.licensor_case_list,
        custom_cards: draft.custom_cards || [],
        cards_order: (draft.custom_cards || []).map(c => c.id),
        section_titles: draft.section_titles || {},
        custom_meta: draft.custom_meta || [],
        related_news: draft.related_news,
      }
      const res = await fetch('/api/admin/ipbrand/save-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': pw },
        body: JSON.stringify({ id: d.id, edit }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error('保存失败')
      setData(prev => (prev ? prev.map(x => (x.id === d.id ? { ...x, ...edit, name_cn: j.name_cn ?? edit.name_cn, initial: j.initial ?? edit.initial } as IpRecord : x)) : prev))
      setEditing(false)
      setDraft(null)
    } catch {
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  /* ---------- 自定义卡片操作 ---------- */

  const addCard = () => {
    const id = 'c_' + Date.now().toString(36)
    setDraft(prev => (prev ? { ...prev, custom_cards: [...(prev.custom_cards || []), { id, title: '', body: '' }] } : prev))
  }
  const updCard = (id: string, p: Partial<IpCustomCard>) =>
    setDraft(prev => (prev ? { ...prev, custom_cards: (prev.custom_cards || []).map(c => (c.id === id ? { ...c, ...p } : c)) } : prev))
  const delCard = (id: string) =>
    setDraft(prev => (prev ? { ...prev, custom_cards: (prev.custom_cards || []).filter(c => c.id !== id) } : prev))
  const moveCard = (id: string, dir: -1 | 1) =>
    setDraft(prev => {
      if (!prev) return prev
      const arr = [...(prev.custom_cards || [])]
      const i = arr.findIndex(c => c.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= arr.length) return prev
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...prev, custom_cards: arr }
    })

  const updCase = (i: number, p: Partial<IpCase>) =>
    setDraft(prev => (prev ? { ...prev, licensor_case_list: (prev.licensor_case_list || []).map((c, idx) => (idx === i ? { ...c, ...p } : c)) } : prev))
  const delCase = (i: number) =>
    setDraft(prev => (prev ? { ...prev, licensor_case_list: (prev.licensor_case_list || []).filter((_, idx) => idx !== i) } : prev))
  const addCase = () =>
    setDraft(prev => (prev ? { ...prev, licensor_case_list: [...(prev.licensor_case_list || []), { title: '', date: '', image: '' }] } : prev))
  const delGalleryImg = (i: number) =>
    setDraft(prev => (prev ? { ...prev, images: (prev.images || []).filter((_, idx) => idx !== i) } : prev))

  /* ---------- 维度信息（meta）编辑 ---------- */
  type MetaArrKey = 'ages' | 'areas' | 'industries'
  const META_ARR_LABEL: Record<MetaArrKey, string> = { ages: '受众', areas: '可授权地区', industries: '重点授权品类' }
  const updMetaArr = (key: MetaArrKey, i: number, v: string) =>
    setDraft(prev => (prev ? { ...prev, [key]: (prev[key] || []).map((x, idx) => (idx === i ? v : x)) } : prev))
  const addMetaArr = (key: MetaArrKey) =>
    setDraft(prev => (prev ? { ...prev, [key]: [...(prev[key] || []), ''] } : prev))
  const delMetaArr = (key: MetaArrKey, i: number) =>
    setDraft(prev => (prev ? { ...prev, [key]: (prev[key] || []).filter((_, idx) => idx !== i) } : prev))
  const clearMetaArr = (key: MetaArrKey) => patch({ [key]: [] })
  const addMeta = () =>
    setDraft(prev => (prev ? { ...prev, custom_meta: [...(prev.custom_meta || []), { label: '', value: '' }] } : prev))
  const updMeta = (i: number, p: Partial<{ label: string; value: string }>) =>
    setDraft(prev => (prev ? { ...prev, custom_meta: (prev.custom_meta || []).map((m, idx) => (idx === i ? { ...m, ...p } : m)) } : prev))
  const delMeta = (i: number) =>
    setDraft(prev => (prev ? { ...prev, custom_meta: (prev.custom_meta || []).filter((_, idx) => idx !== i) } : prev))

  const cancelEdit = () => {
    setEditing(false)
    setDraft(null)
    setOptionManager(null)
    setRenamingOption(null)
    setOpenPicker(null)
    // 取消编辑后恢复展示态新闻（管理员保存过的列表，或重新动态匹配）
    if (d) {
      if (d.related_news !== undefined) {
        setFeedNews(d.related_news || [])
      } else {
        matchNews(d)
      }
    }
  }

  /* ---------- 渲染 ---------- */

  let body: React.ReactNode
  if (loadError) {
    body = <div className="ipd-status">数据加载失败，请刷新重试</div>
  } else if (ipId === -1) {
    body = <div className="ipd-status">缺少 IP 编号，<Link href="/ipbrand">返回列表</Link></div>
  } else if (!data) {
    body = <div className="ipd-status">加载中…</div>
  } else if (!d) {
    body = <div className="ipd-status">没有找到编号为 {ipId} 的 IP，<Link href="/ipbrand">返回列表</Link></div>
  } else if (editing && draft) {
    // ===== 编辑态 =====
    const galleryImgs = (draft.images || []).filter(i => i.type === 'gallery')
    const cases = draft.licensor_case_list || []
    const manuals = d.brand_manual_images || []
    const eventPlans = d.ip_event_plan_images || []
    const customCards = draft.custom_cards || []

    body = (
      <>
        <div className="ipd-hero">
          <div className="ipd-hero-cover">
            {draft.cover ? (
              <img src={`/ipbrand/${draft.cover}`} alt={title} />
            ) : (
              <div className="ipd-hero-placeholder">{title[0] || '?'}</div>
            )}
          </div>
          <div className="ipd-hero-info">
            <input className="ipd-edit-input ipd-edit-name" value={draft.name_cn || ''}
              onChange={e => patch({ name_cn: e.target.value })} placeholder="中文名" />
            <input className="ipd-edit-input ipd-edit-namen" value={draft.name_en || ''}
              onChange={e => patch({ name_en: e.target.value })} placeholder="英文名（可空）" />
            <div className="ipd-edit-hint">提示：封面在图廊里点「设封面」；文字与维度修改需点右下角「保存修改」；品牌手册操作即时生效。</div>

            {/* 维度信息编辑 */}
            <div className="ipd-meta-edit">
              <div className="ipd-meta-edit-title">维度信息（可增删改）</div>
              <div className="ipd-meta-edit-grid">
                <div className="ipd-meta-edit-item">
                  <div className="ipd-meta-edit-label">版权方</div>
                  <div className="ipd-meta-edit-ctrl">
                    <input className="ipd-edit-input" value={draft.company || ''} onChange={e => patch({ company: e.target.value })} placeholder="版权方" />
                    <button className="ipd-mini-btn" onClick={() => patch({ company: '' })} title="清空此维度">清除</button>
                  </div>
                </div>
                <div className="ipd-meta-edit-item">
                  <div className="ipd-meta-edit-label">专业分类</div>
                  <div className="ipd-meta-edit-ctrl">
                    <select
                      className="ipd-edit-input ipd-option-select"
                      value={draft.category || ''}
                      onChange={e => patch({ category: e.target.value })}
                    >
                      <option value="">未选择</option>
                      {options.category.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button className="ipd-mini-btn" onClick={() => setOptionManager({ field: 'category' })}>管理选项</button>
                  </div>
                </div>
                <div className="ipd-meta-edit-item">
                  <div className="ipd-meta-edit-label">出品国家/地区</div>
                  <div className="ipd-meta-edit-ctrl">
                    <select
                      className="ipd-edit-input ipd-option-select"
                      value={draft.place_origin || ''}
                      onChange={e => patch({ place_origin: e.target.value })}
                    >
                      <option value="">未选择</option>
                      {options.place_origin.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <button className="ipd-mini-btn" onClick={() => setOptionManager({ field: 'place_origin' })}>管理选项</button>
                  </div>
                </div>
                <div className="ipd-meta-edit-item">
                  <div className="ipd-meta-edit-label">IP 诞生年代</div>
                  <div className="ipd-meta-edit-ctrl">
                    <input className="ipd-edit-input" value={draft.listing_date || ''} onChange={e => patch({ listing_date: e.target.value })} placeholder="如：1969" />
                    <button className="ipd-mini-btn" onClick={() => patch({ listing_date: '' })}>清除</button>
                  </div>
                </div>
                <div className="ipd-meta-edit-item">
                  <div className="ipd-meta-edit-label">授权有效期</div>
                  <div className="ipd-meta-edit-ctrl">
                    <input className="ipd-edit-input" value={draft.auth_start || ''} onChange={e => patch({ auth_start: e.target.value })} placeholder="开始" />
                    <span className="ipd-meta-edit-sep">~</span>
                    <input className="ipd-edit-input" value={draft.auth_end || ''} onChange={e => patch({ auth_end: e.target.value })} placeholder="结束" />
                    <button className="ipd-mini-btn" onClick={() => { patch({ auth_start: '' }); patch({ auth_end: '' }) }}>清除</button>
                  </div>
                </div>

                {(['areas'] as MetaArrKey[]).map(k => (
                  <div key={k} className="ipd-meta-edit-item">
                    <div className="ipd-meta-edit-label">{META_ARR_LABEL[k]}</div>
                    <div className="ipd-meta-edit-ctrl col">
                      {(draft[k] || []).map((v, i) => (
                        <div key={i} className="ipd-meta-edit-multi">
                          <input className="ipd-edit-input" value={v} onChange={e => updMetaArr(k, i, e.target.value)} placeholder="填写一项" />
                          <button className="ipd-mini-btn" onClick={() => delMetaArr(k, i)}>删</button>
                        </div>
                      ))}
                      <div className="ipd-meta-edit-addrow">
                        <button className="ipd-upload-btn" onClick={() => addMetaArr(k)}>＋ 添加</button>
                        {(draft[k] || []).length > 0 && <button className="ipd-mini-btn" onClick={() => clearMetaArr(k)}>清空全部</button>}
                      </div>
                    </div>
                  </div>
                ))}

                {/* 受众 / 重点授权品类：全站词库标签多选 */}
                {(['ages', 'industries'] as IpBrandOptionField[]).map(field => (
                  <div key={field} className="ipd-meta-edit-item">
                    <div className="ipd-meta-edit-label">{OPTION_FIELD_LABEL[field]}</div>
                    <div className="ipd-meta-edit-ctrl col">
                      <div className="ipd-tag-list">
                        {(draft[field] as string[] | undefined || []).map(v => (
                          <span key={v} className="ipd-option-tag">
                            {v}
                            <button
                              type="button"
                              className="ipd-option-tag-remove"
                              onClick={() => {
                                const arr = Array.isArray(draft[field]) ? (draft[field] as string[]) : []
                                patch({ [field]: arr.filter(x => x !== v) } as Partial<IpRecord>)
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          className="ipd-option-picker-btn"
                          onClick={() => setOpenPicker(openPicker === field ? null : field)}
                        >
                          ＋ 添加
                        </button>
                      </div>
                      {openPicker === field && (
                        <div className="ipd-option-picker">
                          {options[field].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              className="ipd-option-pick"
                              disabled={(draft[field] as string[] | undefined || []).includes(opt)}
                              onClick={() => {
                                const arr = Array.isArray(draft[field]) ? (draft[field] as string[]) : []
                                if (!arr.includes(opt)) patch({ [field]: [...arr, opt] } as Partial<IpRecord>)
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                          {options[field].length === 0 && (
                            <div className="ipd-option-picker-empty">暂无可选项，先点「管理选项」新增</div>
                          )}
                        </div>
                      )}
                      <div className="ipd-meta-edit-addrow">
                        <button className="ipd-upload-btn" onClick={() => setOptionManager({ field })}>管理选项</button>
                      </div>
                    </div>
                  </div>
                ))}

                {(draft.custom_meta || []).map((m, i) => (
                  <div key={i} className="ipd-meta-edit-item">
                    <div className="ipd-meta-edit-ctrl">
                      <input className="ipd-edit-input ipd-meta-edit-label-in" value={m.label} onChange={e => updMeta(i, { label: e.target.value })} placeholder="维度名，如：监修方" />
                      <input className="ipd-edit-input" value={m.value} onChange={e => updMeta(i, { value: e.target.value })} placeholder="内容" />
                      <button className="ipd-mini-btn danger" onClick={() => delMeta(i)}>删除</button>
                    </div>
                  </div>
                ))}
                <div className="ipd-meta-edit-addcard">
                  <button className="ipd-add-card-btn" onClick={addMeta}>＋ 新增维度</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* IP 介绍 */}
        <div className="ipd-section">
          <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'ip_intro')}
            onChange={e => setSecTitle('ip_intro', e.target.value)} placeholder="卡片标题" />
          <textarea className="ipd-edit-input ipd-edit-textarea" value={draft.ip_intro || ''} rows={6}
            onChange={e => patch({ ip_intro: e.target.value })} placeholder="IP 介绍正文" />
        </div>

        {/* 版权方介绍 */}
        <div className="ipd-section">
          <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'company_intro')}
            onChange={e => setSecTitle('company_intro', e.target.value)} placeholder="卡片标题" />
          <textarea className="ipd-edit-input ipd-edit-textarea" value={draft.company_intro || ''} rows={5}
            onChange={e => patch({ company_intro: e.target.value })} placeholder="版权方介绍正文" />
        </div>

        {/* 对外展示图 */}
        <div className="ipd-section">
          <div className="ipd-edit-sec-head">
            <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'gallery')}
              onChange={e => setSecTitle('gallery', e.target.value)} placeholder="卡片标题" />
            <label className="ipd-upload-btn">
              批量上传展示图
              <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={e => {
                const fs = Array.from(e.target.files || [])
                if (fs.length) uploadImages(fs, 'gallery')
                e.target.value = ''
              }} />
            </label>
          </div>
          {galleryImgs.length > 0 ? (
            <div className="ipd-gallery-row">
              {galleryImgs.map((img, i) => (
                <div key={i} className="ipd-gallery-item ipd-gallery-item-edit">
                  <img src={`/ipbrand/${img.local}`} alt="展示图" />
                  <div className="ipd-gallery-ops">
                    <button onClick={() => patch({ cover: img.local })} title="将此图设为封面">设封面</button>
                    <button className="danger" onClick={() => delGalleryImg(i)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无对外展示图，点「批量上传展示图」添加</div>
          )}
        </div>

        {/* 授权案例 */}
        <div className="ipd-section">
          <div className="ipd-edit-sec-head">
            <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'cases')}
              onChange={e => setSecTitle('cases', e.target.value)} placeholder="卡片标题" />
            <div className="ipd-edit-sec-actions">
              <label className="ipd-upload-btn">
                批量上传案例图
                <input ref={caseImgRef} type="file" accept="image/*" multiple hidden onChange={e => {
                  const fs = Array.from(e.target.files || [])
                  if (fs.length) uploadImages(fs, 'case')
                  e.target.value = ''
                }} />
              </label>
              <button className="ipd-upload-btn" onClick={addCase}>＋新增案例</button>
            </div>
          </div>
          {cases.length > 0 ? (
            <div className="ipd-edit-case-grid">
              {cases.map((c, i) => (
                <div key={i} className="ipd-edit-case">
                  {c.image && (
                    <div className="ipd-edit-case-img">
                      <img src={c.image} alt="" />
                      <button className="ipd-edit-case-delimg" onClick={() => updCase(i, { image: '' })}>移除图</button>
                    </div>
                  )}
                  <input className="ipd-edit-input" value={c.title || ''}
                    onChange={e => updCase(i, { title: e.target.value })} placeholder="案例名称" />
                  <input className="ipd-edit-input" value={c.date || ''}
                    onChange={e => updCase(i, { date: e.target.value })} placeholder="时间 / 授权方 / 行业" />
                  <button className="ipd-edit-delcase" onClick={() => delCase(i)}>删除此案例</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无授权案例，可「批量上传案例图」或「新增案例」</div>
          )}
        </div>

        {/* 自定义卡片（正文区，可排序） */}
        <div className="ipd-section">
          {customCards.map((c, i) => (
            <div key={c.id} className="ipd-custom-card">
              <div className="ipd-edit-sec-head">
                <input className="ipd-edit-input ipd-edit-sec-title" value={c.title || ''}
                  onChange={e => updCard(c.id, { title: e.target.value })} placeholder="自定义卡片标题" />
                <div className="ipd-edit-sec-actions">
                  <button className="ipd-mini-btn" disabled={i === 0} onClick={() => moveCard(c.id, -1)}>↑</button>
                  <button className="ipd-mini-btn" disabled={i === customCards.length - 1} onClick={() => moveCard(c.id, 1)}>↓</button>
                  <button className="ipd-mini-btn danger" onClick={() => delCard(c.id)}>删除卡片</button>
                </div>
              </div>
              <textarea className="ipd-edit-input ipd-edit-textarea" value={c.body || ''} rows={4}
                onChange={e => updCard(c.id, { body: e.target.value })} placeholder="卡片正文" />
            </div>
          ))}
          <button className="ipd-add-card-btn" onClick={addCard}>＋ 新增自定义卡片</button>
        </div>

        {/* 相关新闻（可自动匹配 / 手动删除 / 保存） */}
        <div className="ipd-section">
          <div className="ipd-edit-sec-head">
            <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'news')}
              onChange={e => setSecTitle('news', e.target.value)} placeholder="卡片标题" />
            <button className="ipd-news-match-btn" onClick={autoMatchNews} disabled={newsBusy}>
              {newsBusy ? '匹配中…' : '＋ 自动匹配'}
            </button>
          </div>
          <div className="ipd-edit-hint">相关新闻来自全球快讯自动匹配；匹配结果点「保存修改」后生效，空结果表示明确保存为空。</div>
          {newsError && <div className="ipd-news-error">{newsError}</div>}
          {feedNews.length > 0 ? (
            <div className="ipd-news-list">
              {feedNews.map((n, i) => (
                <div key={n.id || n.url || i} className="ipd-news-row">
                  <a className="ipd-news-item" href={n.url || '#'} target="_blank" rel="noopener noreferrer">
                    <span className="ipd-news-title">{n.title_cn || n.title || '(无标题)'}</span>
                    <span className="ipd-news-date">{(n.published_at || n.created_at || n.date || '').slice(0, 10)}</span>
                  </a>
                  <button
                    type="button"
                    className="ipd-news-delete"
                    onClick={() => {
                      const next = feedNews.filter(item => {
                        if (n.id && item.id) return item.id !== n.id
                        if (n.url && item.url) return item.url !== n.url
                        return item !== n
                      })
                      setFeedNews(next)
                      patch({ related_news: next } as Partial<IpRecord>)
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无相关新闻，点「＋ 自动匹配」从全球快讯匹配</div>
          )}
        </div>

        {/* IP快闪/美陈方案 */}
        <div className="ipd-section">
          <div className="ipd-edit-sec-head">
            <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'event_plan')}
              onChange={e => setSecTitle('event_plan', e.target.value)} placeholder="卡片标题" />
            <label className="ipd-upload-btn">
              批量上传方案图
              <input type="file" accept="image/*" multiple hidden onChange={e => {
                const fs = Array.from(e.target.files || [])
                if (fs.length) uploadEventPlan(fs)
                e.target.value = ''
              }} />
            </label>
          </div>
          <div className="ipd-edit-hint">IP快闪/美陈方案图片直接展示在本页面，用户不可下载；上传/替换/删除即时生效。</div>
          {eventPlans.length > 0 ? (
            <div className="ipd-manual-grid">
              {eventPlans.map((u, i) => (
                <div key={i} className="ipd-manual-item">
                  <img src={u} alt={`快闪/美陈方案 ${i + 1}`} loading="lazy" />
                  <div className="ipd-manual-ops">
                    <label className="ipd-manual-op">替换
                      <input type="file" accept="image/*" hidden onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) replaceEventPlan(u, f)
                        e.target.value = ''
                      }} />
                    </label>
                    <button className="ipd-manual-op danger" onClick={() => delEventPlan(u)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无IP快闪/美陈方案，点「批量上传方案图」添加</div>
          )}
        </div>

        {/* 品牌手册 */}
        <div className="ipd-section">
          <div className="ipd-edit-sec-head">
            <input className="ipd-edit-input ipd-edit-sec-title" value={secTitle(draft, 'manual')}
              onChange={e => setSecTitle('manual', e.target.value)} placeholder="卡片标题" />
            <label className="ipd-upload-btn">
              批量上传手册图
              <input ref={manualRef} type="file" accept="image/*" multiple hidden onChange={e => {
                const fs = Array.from(e.target.files || [])
                if (fs.length) uploadManual(fs)
                e.target.value = ''
              }} />
            </label>
          </div>
          <div className="ipd-edit-hint">品牌手册图片直接展示在本页面，用户不可下载；上传/替换/删除即时生效。</div>
          {manuals.length > 0 ? (
            <div className="ipd-manual-grid">
              {manuals.map((u, i) => (
                <div key={i} className="ipd-manual-item">
                  <img src={u} alt={`手册 ${i + 1}`} loading="lazy" />
                  <div className="ipd-manual-ops">
                    <label className="ipd-manual-op">替换
                      <input type="file" accept="image/*" hidden onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) replaceManual(u, f)
                        e.target.value = ''
                      }} />
                    </label>
                    <button className="ipd-manual-op danger" onClick={() => delManual(u)}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无品牌手册，点「批量上传手册图」添加（PDF 转图后上传）</div>
          )}
        </div>
      </>
    )
  } else {
    // ===== 展示态 =====
    const metas: Array<[string, string]> = [
      ['版权方', d.company],
      ['专业分类', d.category],
      ['出品国家/地区', d.place_origin],
      ['IP诞生年代', d.listing_date],
      ['授权有效期', d.auth_start && d.auth_end ? `${d.auth_start} ~ ${d.auth_end}` : (d.auth_start || d.auth_end || '')],
      ['授权案例', d.case_len ? `${d.case_len} 个` : ''],
      ['受众', d.ages && d.ages.length ? d.ages.join('，') : ''],
      ['可授权地区', d.areas && d.areas.length ? d.areas.join('，') : ''],
      ['重点授权品类', d.industries && d.industries.length ? d.industries.join('，') : ''],
      ...(d.custom_meta || []).filter(m => m.label.trim() && m.value.trim()).map(m => [m.label.trim(), m.value.trim()] as [string, string]),
    ]
    const galleryImgs = (d.images || []).filter(i => i.type === 'gallery')
    const cases = d.licensor_case_list || []
    const manuals = d.brand_manual_images || []
    const eventPlans = d.ip_event_plan_images || []
    const customCards = d.custom_cards || []

    body = (
      <>
        <div className="ipd-hero">
          <div className="ipd-hero-cover">
            {d.cover ? (
              <img src={`/ipbrand/${d.cover}`} alt={title} />
            ) : (
              <div className="ipd-hero-placeholder">{title[0] || '?'}</div>
            )}
          </div>
          <div className="ipd-hero-info">
            <h1>{title}</h1>
            {d.name_en && d.name_en !== d.name_cn && <div className="ipd-name-en">{d.name_en}</div>}
            <div className="ipd-meta-grid">
              {metas.filter(([, v]) => v).map(([label, value]) => (
                <div key={label} className="ipd-meta-item">
                  <div className="ipd-meta-label">{label}</div>
                  <div className="ipd-meta-value">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {d.ip_intro && (
          <div className="ipd-section">
            <div className="ipd-section-title">{secTitle(d, 'ip_intro')}</div>
            <div className="ipd-intro-text">{d.ip_intro}</div>
          </div>
        )}

        {d.company_intro && (
          <div className="ipd-section">
            <div className="ipd-section-title">{secTitle(d, 'company_intro')}</div>
            <div className="ipd-intro-text">{d.company_intro}</div>
          </div>
        )}

        {galleryImgs.length > 0 && (
          <div className="ipd-section">
            <div className="ipd-section-title">{secTitle(d, 'gallery')}</div>
            <div className="ipd-gallery-row">
              {galleryImgs.map((img, i) => (
                <div
                  key={i}
                  className="ipd-gallery-item"
                  onClick={() => window.open(`/ipbrand/${img.local}`, '_blank')}
                >
                  <img src={`/ipbrand/${img.local}`} alt="展示图" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ipd-section">
          <div className="ipd-section-title">{secTitle(d, 'cases')} ({cases.length || d.case_len || 0})</div>
          {cases.length > 0 ? (
            <div className="ipd-case-list">
              {cases.map((c, i) => (
                <div key={i} className="ipd-case-item">
                  {c.image && <img className="ipd-case-thumb" src={c.image} alt="" loading="lazy" />}
                  <div className="ipd-case-body">
                    <div className="ipd-case-title">{c.title || ''}</div>
                    {c.date && <div className="ipd-case-date">{c.date}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无授权案例记录</div>
          )}
        </div>

        {linkedLicensees.length > 0 && (
          <div className="ipd-section">
            <div className="ipd-section-title">授权该IP的品牌方 ({linkedLicensees.length})</div>
            <div className="lic-chip-row">
              {linkedLicensees.map(item => (
                <Link key={item.id} href={`/licensee/detail?id=${item.id}`} className="lic-chip lic-chip-ip">
                  {item.name}
                  <span>{(item.licensing_cases || []).filter(c => c.ip_id === ipId).map(c => c.category).filter(Boolean).join(' / ') || '品牌方档案'} »</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {customCards.map(c => (
          <div key={c.id} className="ipd-section">
            {c.title && <div className="ipd-section-title">{c.title}</div>}
            {c.body && <div className="ipd-intro-text">{c.body}</div>}
          </div>
        ))}

        <div className="ipd-section">
          <div className="ipd-section-head">
            <div className="ipd-section-title">{secTitle(d, 'news')}</div>
            {feedNews.length > 0 && (
              <a className="ipd-more-link" href={`/?q=${encodeURIComponent(coreSearchName(d.name_cn || d.name_en || ''))}`}>
                更多相关快讯 »
              </a>
            )}
          </div>
          {feedNews.length > 0 ? (
            <div className="ipd-news-list">
              {feedNews.map((n, i) => (
                <a key={n.id || n.url || i} className="ipd-news-item" href={n.url || '#'} target="_blank" rel="noopener noreferrer">
                  <span className="ipd-news-title">{n.title_cn || n.title || '(无标题)'}</span>
                  <span className="ipd-news-date">{(n.published_at || n.created_at || n.date || '').slice(0, 10)}</span>
                </a>
              ))}
            </div>
          ) : d.related_news !== undefined ? (
            // 管理员明确保存为空，不回退静态新闻
            <div className="ipd-empty-block">暂无相关新闻</div>
          ) : d.news_list && d.news_list.length > 0 ? (
            <div className="ipd-news-list">
              {d.news_list.map((n, i) => (
                <a key={i} className="ipd-news-item" href={n.url || '#'} target="_blank" rel="noopener noreferrer">
                  <span className="ipd-news-title">{n.title || ''}</span>
                  {n.date && <span className="ipd-news-date">{n.date}</span>}
                </a>
              ))}
            </div>
          ) : (
            <div className="ipd-empty-block">暂无相关新闻</div>
          )}
        </div>

        {eventPlans.length > 0 && (
          <div className="ipd-section">
            <div className="ipd-section-title">{secTitle(d, 'event_plan')}</div>
            <div className="ipd-manual-grid">
              {eventPlans.map((u, i) => (
                <img key={i} className="ipd-manual-img" src={u} alt={`快闪/美陈方案 ${i + 1}`} loading="lazy" />
              ))}
            </div>
          </div>
        )}

        {manuals.length > 0 && (
          <div className="ipd-section">
            <div className="ipd-section-title">{secTitle(d, 'manual')}</div>
            <div className="ipd-manual-grid">
              {manuals.map((u, i) => (
                <img key={i} className="ipd-manual-img" src={u} alt={`手册 ${i + 1}`} loading="lazy" />
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="ipb-page">
      <div className="ipd-topbar">
        <Link href="/ipbrand" className="ipd-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          返回列表
        </Link>
        <div className="ipd-topbar-title">{title}</div>
        {adminLoaded && isAdmin && d && (
          <button
            className={`ipd-edit-topbtn${editing ? ' active' : ''}`}
            onClick={editing ? cancelEdit : () => { setDraft(d); setEditing(true) }}
          >
            {editing ? '取消编辑' : '✎ 编辑'}
          </button>
        )}
        {d && d.source_url && !editing ? (
          <a className="ipd-source-link" href={d.source_url} target="_blank" rel="noopener noreferrer">
            来源页
          </a>
        ) : (
          <span />
        )}
      </div>
      <div className={`ipd-main${editing ? ' editing' : ''}`}>{body}</div>

      {editing && draft && (
        <div className="ipd-edit-bar">
          <div className="ipd-edit-bar-hint">
            {busy ? '上传/删除中…' : '品牌手册图操作即时生效，其余修改点「保存修改」'}
          </div>
          <button className="ipd-edit-cancel" onClick={cancelEdit} disabled={saving || busy}>取消</button>
          <button className="ipd-edit-save" onClick={save} disabled={saving || busy}>
            {saving ? '保存中…' : '保存修改'}
          </button>
        </div>
      )}

      {/* 全站词库管理弹窗（新增 / 改名 / 删除） */}
      {optionManager && (
        <div
          className="ipd-option-modal-mask"
          onClick={() => {
            setOptionManager(null)
            setRenamingOption(null)
            setNewOptionValue('')
            setRenameValue('')
          }}
        >
          <div className="ipd-option-modal" onClick={e => e.stopPropagation()}>
            <div className="ipd-option-modal-title">管理「{OPTION_FIELD_LABEL[optionManager.field]}」选项</div>
            <div className="ipd-option-modal-list">
              {options[optionManager.field].length > 0 ? options[optionManager.field].map(opt => (
                <div key={opt} className="ipd-option-modal-row">
                  <span className="ipd-option-modal-name">{opt}</span>
                  <div className="ipd-option-modal-actions">
                    <button
                      className="ipd-option-modal-btn"
                      onClick={() => {
                        setRenamingOption({ field: optionManager.field, from: opt })
                        setRenameValue(opt)
                      }}
                    >
                      改名
                    </button>
                    <button className="ipd-option-modal-btn danger" onClick={() => deleteOption(optionManager.field, opt)}>删除</button>
                  </div>
                </div>
              )) : (
                <div className="ipd-option-modal-empty">暂无选项，在下方新增</div>
              )}
            </div>
            {renamingOption && renamingOption.field === optionManager.field && (
              <div className="ipd-option-modal-rename">
                <div className="ipd-option-modal-label">将「{renamingOption.from}」改名为：</div>
                <input
                  className="ipd-edit-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameOptionUi(renamingOption.field, renamingOption.from) }}
                  placeholder="新名称"
                />
                <div className="ipd-option-modal-actions">
                  <button className="ipd-option-modal-btn" onClick={() => setRenamingOption(null)}>取消</button>
                  <button className="ipd-option-modal-btn primary" onClick={() => renameOptionUi(renamingOption.field, renamingOption.from)}>确认改名</button>
                </div>
              </div>
            )}
            <div className="ipd-option-modal-add">
              <input
                className="ipd-edit-input"
                value={newOptionValue}
                onChange={e => setNewOptionValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addOption(optionManager.field) }}
                placeholder="新选项名称，回车新增"
              />
              <button className="ipd-option-modal-btn primary" onClick={() => addOption(optionManager.field)}>新增</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
