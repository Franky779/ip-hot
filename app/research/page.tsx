'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'
import { RESEARCH_CATEGORIES, renderResearchMarkdown, researchTags, type ResearchCategory, type ResearchReport } from '@/lib/research'

function password() { return localStorage.getItem(ADMIN_PW_KEY) || '' }

export default function ResearchPage() {
  const [category, setCategory] = useState<ResearchCategory>('品类研究')
  const [reports, setReports] = useState<ResearchReport[]>(() => { try { return JSON.parse(sessionStorage.getItem('ip-hot-research-reports') || '[]') } catch { return [] } })
  const [loaded, setLoaded] = useState(() => reports.length > 0)
  const [showUpload, setShowUpload] = useState(false)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  useEffect(() => {
    fetch('/api/research', { cache: 'no-store' }).then((response) => response.json()).then((result) => { const next = result.reports || []; setReports(next); setLoaded(true); sessionStorage.setItem('ip-hot-research-reports', JSON.stringify(next)) }).catch(() => setLoaded(true))
  }, [])
  const items = useMemo(() => reports.filter((item) => item.category === category), [category, reports])
  return <>
    <header className="page-header"><div className="home-header-top"><div><h1 className="page-title font-serif">深度研究</h1><p className="page-sub">从品类趋势、品牌/IP 到授权营销，沉淀可复用的行业观察。</p></div>{adminLoaded && isAdmin && <button className="admin-action-btn research-upload-btn" onClick={() => setShowUpload(true)}>＋ 上传研究报告</button>}</div><div className="research-tabs" role="tablist" aria-label="深度研究分类">{RESEARCH_CATEGORIES.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} role="tab" aria-selected={item === category}>{item}</button>)}</div></header>
    <section className="research-page article-section"><div className="research-grid">{!loaded ? <p className="empty-state">正在加载报告…</p> : items.length === 0 ? <p className="empty-state">该分类暂无报告。</p> : items.map((item) => <Link href={`/research/${item.slug}`} className="research-card" key={item.id}><div className="research-card-meta"><span>{item.category}</span><time dateTime={item.published_at}>{item.published_at}</time></div><h2>{item.title}</h2><div className="research-card-tags">{researchTags(item).map((tag) => <span className="research-tag" key={tag}>#{tag}</span>)}</div>{adminLoaded && isAdmin && <div className={`research-backup-status ${item.github_backup_status}`}><span>{item.github_backup_status === 'backed_up' ? 'GitHub 已备份' : item.github_backup_status === 'failed' ? 'GitHub 备份失败' : 'GitHub 待备份'}</span>{item.github_backup_status === 'failed' && <button className="research-retry" onClick={async (event) => { event.preventDefault(); event.stopPropagation(); const response = await fetch(`/api/research/${item.id}/backup`, { method: 'POST', headers: { 'x-admin-password': password() } }); if (response.ok) setReports((value) => value.map((report) => report.id === item.id ? { ...report, github_backup_status: 'backed_up' } : report)) }}>重试</button>}</div>}</Link>)}</div></section>
    {showUpload && <ResearchUploadDialog onClose={() => setShowUpload(false)} onCreated={(report) => { setReports((value) => [report, ...value]); setCategory(report.category); setShowUpload(false) }} />}
  </>
}

function ResearchUploadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (report: ResearchReport) => void }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ResearchCategory>('品类研究')
  const [markdown, setMarkdown] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => { setSaving(true); setNotice('发布中…'); const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': password() }, body: JSON.stringify({ title, category, markdown_content: markdown }) }); const result = await response.json(); if (!response.ok) { setNotice(result.error || '发布失败'); setSaving(false); return } onCreated(result.report); setNotice(result.warning || '') }
  return <div className="admin-modal-overlay"><div className="admin-modal research-upload-modal"><div className="research-upload-heading"><div><h3>上传研究报告</h3><p>发布日期将自动记录为上传当天。</p></div><button className="research-upload-close" onClick={onClose} disabled={saving} aria-label="关闭">×</button></div><div className="research-upload-fields"><label>报告标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：潮玩行业深度研究报告" /></label><label>报告分类<select value={category} onChange={(event) => setCategory(event.target.value as ResearchCategory)}>{RESEARCH_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label></div><div className="research-markdown-columns"><label>Markdown 内容<textarea className="research-markdown-input" value={markdown} onChange={(event) => setMarkdown(event.target.value)} placeholder="在这里粘贴 Markdown 文档" /></label><div className="research-markdown-preview"><span>实时预览</span><div className="research-report-content" dangerouslySetInnerHTML={{ __html: renderResearchMarkdown(markdown || '*粘贴 Markdown 后将在这里预览*') }} /></div></div>{notice && <p className="admin-notice">{notice}</p>}<div className="admin-modal-btns"><button onClick={onClose} disabled={saving}>取消</button><button className="admin-submit" onClick={submit} disabled={saving}>{saving ? '发布中…' : '发布报告'}</button></div></div></div>
}
