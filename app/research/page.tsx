'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ADMIN_PW_KEY, useAdmin } from '../components/AdminToggle'
import { normalizeResearchCategory, RESEARCH_CATEGORIES, renderResearchMarkdown, researchTags, type ResearchCategory, type ResearchReport } from '@/lib/research'

function password() { return localStorage.getItem(ADMIN_PW_KEY) || '' }
let researchMemoryCache: ResearchReport[] = []

function readResearchCache(): ResearchReport[] {
  if (researchMemoryCache.length > 0) return researchMemoryCache
  try {
    const cached = JSON.parse(sessionStorage.getItem('ip-hot-research-reports') || '[]')
    if (!Array.isArray(cached)) return []
    researchMemoryCache = cached.map((report) => ({ ...report, category: normalizeResearchCategory(String(report.category || '')) }))
    return researchMemoryCache
  } catch {
    return []
  }
}

export default function ResearchPage() {
  const [category, setCategory] = useState<ResearchCategory>('品类研究')
  const [reports, setReports] = useState<ResearchReport[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { isAdmin, loaded: adminLoaded } = useAdmin()
  useEffect(() => {
    const requestedCategory = new URLSearchParams(window.location.search).get('category')
    const cached = readResearchCache()
    const initialFrame = requestAnimationFrame(() => {
      if (requestedCategory) setCategory(normalizeResearchCategory(requestedCategory))
      if (cached.length > 0) { setReports(cached); setLoaded(true) }
    })
    let cancelled = false
    const loadingTimeout = window.setTimeout(() => { if (!cancelled) setLoaded(true) }, 12_000)
    fetch('/api/research', { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error('报告加载失败')
      return response.json()
    }).then((result) => {
      if (cancelled) return
      const next = (result.reports || []).map((report: ResearchReport) => ({ ...report, category: normalizeResearchCategory(report.category) }))
      researchMemoryCache = next
      setReports(next)
      setLoaded(true)
      try { sessionStorage.setItem('ip-hot-research-reports', JSON.stringify(next)) } catch { /* storage may be unavailable */ }
    }).catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true; cancelAnimationFrame(initialFrame); clearTimeout(loadingTimeout) }
  }, [])
  const items = useMemo(() => reports.filter((item) => item.category === category), [category, reports])
  const handleDelete = async (item: ResearchReport) => {
    if (deletingId) return
    if (!confirm(`确定删除「${item.title}」？删除后不可恢复。`)) return
    setDeletingId(item.id)
    try {
      const response = await fetch(`/api/research/${item.id}`, { method: 'DELETE', headers: { 'x-admin-password': password() } })
      if (!response.ok) throw new Error('删除失败')
      setReports((value) => {
        const next = value.filter((report) => report.id !== item.id)
        researchMemoryCache = next
        try { sessionStorage.setItem('ip-hot-research-reports', JSON.stringify(next)) } catch { /* storage may be unavailable */ }
        return next
      })
    } catch {
      alert('删除失败')
    } finally {
      setDeletingId(null)
    }
  }
  return <>
    <header className="page-header"><div className="home-header-top"><div><h1 className="page-title font-serif">深度研究</h1><p className="page-sub">从品类趋势、品牌/IP 到授权营销，沉淀可复用的行业观察。</p></div>{adminLoaded && isAdmin && <button className="admin-action-btn research-upload-btn" onClick={() => setShowUpload(true)}>＋ 上传研究报告</button>}</div><div className="research-tabs" role="tablist" aria-label="深度研究分类">{RESEARCH_CATEGORIES.map((item) => <button key={item} className={item === category ? 'active' : ''} onClick={() => setCategory(item)} role="tab" aria-selected={item === category}>{item}</button>)}</div></header>
    <section className="research-page article-section"><div className="research-grid">{!loaded ? <p className="empty-state">正在加载报告…</p> : items.length === 0 ? <p className="empty-state">该分类暂无报告。</p> : items.map((item) => <Link href={`/research/${item.slug}`} className="research-card" key={item.id}><div className="research-card-meta"><span>{item.category}</span><time dateTime={item.published_at}>{item.published_at}</time>{adminLoaded && isAdmin && <button className="research-delete-btn" aria-label="删除报告" disabled={deletingId === item.id} onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleDelete(item) }}>{deletingId === item.id ? '删除中…' : '删除'}</button>}</div><h2>{item.title}</h2><div className="research-card-tags">{researchTags(item).map((tag) => <span className="research-tag" key={tag}>#{tag}</span>)}</div>{adminLoaded && isAdmin && <div className={`research-backup-status ${item.github_backup_status}`}><span>{item.github_backup_status === 'backed_up' ? 'GitHub 已备份' : item.github_backup_status === 'failed' ? 'GitHub 备份失败' : 'GitHub 待备份'}</span>{item.github_backup_status === 'failed' && <button className="research-retry" onClick={async (event) => { event.preventDefault(); event.stopPropagation(); const response = await fetch(`/api/research/${item.id}/backup`, { method: 'POST', headers: { 'x-admin-password': password() } }); if (response.ok) setReports((value) => value.map((report) => report.id === item.id ? { ...report, github_backup_status: 'backed_up' } : report)) }}>重试</button>}</div>}</Link>)}</div></section>
    {showUpload && <ResearchUploadDialog onClose={() => setShowUpload(false)} onCreated={(report) => { setReports((value) => { const next = [report, ...value]; researchMemoryCache = next; try { sessionStorage.setItem('ip-hot-research-reports', JSON.stringify(next)) } catch {} return next }); setCategory(report.category); setShowUpload(false) }} />}
  </>
}

function ResearchUploadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (report: ResearchReport) => void }) {
  const [mode, setMode] = useState<'markdown' | 'pdf'>('markdown')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ResearchCategory>('品类研究')
  // Markdown mode
  const [markdown, setMarkdown] = useState('')
  // PDF mode
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfProgress, setPdfProgress] = useState('')
  const [pdfProgressPct, setPdfProgressPct] = useState(0)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<{ doc: any }>({ doc: null })

  // Markdown submit
  const submitMarkdown = async () => {
    setSaving(true); setNotice('发布中…')
    const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-password': password() }, body: JSON.stringify({ title, category, markdown_content: markdown }) })
    const result = await response.json()
    if (!response.ok) { setNotice(result.error || '发布失败'); setSaving(false); return }
    onCreated(result.report); setNotice(result.warning || '')
  }

  // PDF processing & upload
  const submitPdf = async () => {
    if (!pdfFile) { setNotice('请先选择 PDF 文件'); return }
    if (pdfFile.size > 50 * 1024 * 1024) { setNotice('PDF 文件不能超过 50 MB'); return }
    setSaving(true); setNotice('')
    try {
      // Dynamic imports — pdfjs-dist uses DOM APIs, can't be SSR'd
      const [pdfjsLib, JSZipModule] = await Promise.all([import('pdfjs-dist'), import('jszip')])
      const JSZip = JSZipModule.default
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      // Step 1: Load PDF
      setPdfProgress('正在加载 PDF…'); setPdfProgressPct(2)
      const data = new Uint8Array(await pdfFile.arrayBuffer())
      const doc = await pdfjsLib.getDocument({ data }).promise
      pdfRef.current.doc = doc
      const total = doc.numPages
      // Step 2: Render each page to WebP (scale 1.5 = 108 DPI, good balance of quality vs memory)
      const zip = new JSZip()
      let retried = 0
      for (let i = 1; i <= total; i++) {
        setPdfProgress(`正在处理 ${i}/${total} 页…`)
        setPdfProgressPct(5 + Math.round((i / total) * 80))
        const page = await doc.getPage(i)
        const viewport = page.getViewport({ scale: 1.5 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvas, viewport }).promise
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error('WebP 编码失败')), 'image/webp', 0.85)
        })
        // Validate blob — if suspiciously small, retry once with scale 1.0
        if (blob.size < 5000) {
          canvas.width = 0; canvas.height = 0
          const rViewport = page.getViewport({ scale: 1.0 })
          canvas.width = rViewport.width; canvas.height = rViewport.height
          await page.render({ canvas, viewport: rViewport }).promise
          const retryBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => b ? resolve(b) : reject(new Error('WebP 重试失败')), 'image/webp', 0.85)
          })
          zip.file(`page-${String(i).padStart(2, '0')}.webp`, retryBlob)
          retried++
        } else {
          zip.file(`page-${String(i).padStart(2, '0')}.webp`, blob)
        }
        // Aggressive cleanup — release canvas, null context, let GC breathe
        canvas.width = 0; canvas.height = 0
        canvas.remove()
        if (ctx) { ctx.reset?.() }
        // Yield to browser between pages to prevent memory fragmentation
        await new Promise(r => setTimeout(r, 10))
      }
      if (retried > 0) setNotice(`注意：${retried} 页因内存压力降低了分辨率`)
      // Step 3: Build ZIP and upload
      setPdfProgress('正在打包上传…'); setPdfProgressPct(90)
      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      const formData = new FormData()
      formData.append('title', title || pdfFile.name.replace(/\.pdf$/i, ''))
      formData.append('category', category)
      formData.append('password', password())
      formData.append('file', zipBlob, 'images.zip')
      const response = await fetch('/api/admin/upload-research-images', { method: 'POST', body: formData })
      const ct = response.headers.get('content-type') || ''
      const body = ct.includes('json') ? await response.json() : await response.text()
      if (!response.ok) { setNotice(typeof body === 'string' ? `服务器错误 (${response.status}): ${body.slice(0, 200)}` : (body.error || '上传失败')); setSaving(false); setPdfProgress(''); setPdfProgressPct(0); return }
      onCreated(body.report)
      setNotice(body.warning || '')
    } catch (err) {
      setNotice(`处理失败：${err instanceof Error ? err.message : '未知错误'}`)
      setSaving(false); setPdfProgress(''); setPdfProgressPct(0)
    }
  }

  return <div className="admin-modal-overlay"><div className="admin-modal research-upload-modal">
    <div className="research-upload-heading">
      <div><h3>上传研究报告</h3><p>发布日期将自动记录为上传当天。</p></div>
      <button className="research-upload-close" onClick={onClose} disabled={saving} aria-label="关闭">×</button>
    </div>
    <div className="research-upload-tabs">
      <button className={mode === 'markdown' ? 'active' : ''} onClick={() => { setMode('markdown'); setNotice('') }}>粘贴 Markdown</button>
      <button className={mode === 'pdf' ? 'active' : ''} onClick={() => { setMode('pdf'); setNotice('') }}>上传 PDF</button>
    </div>
    <div className="research-upload-fields">
      <label>报告标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：潮玩行业深度研究报告" /></label>
      <label>报告分类<select value={category} onChange={(event) => setCategory(event.target.value as ResearchCategory)}>{RESEARCH_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    </div>
    {mode === 'markdown' ? (
      <div className="research-markdown-columns">
        <label>Markdown 内容<textarea className="research-markdown-input" value={markdown} onChange={(event) => setMarkdown(event.target.value)} placeholder="在这里粘贴 Markdown 文档" /></label>
        <div className="research-markdown-preview"><span>实时预览</span><div className="research-report-content" dangerouslySetInnerHTML={{ __html: renderResearchMarkdown(markdown || '*粘贴 Markdown 后将在这里预览*') }} /></div>
      </div>
    ) : (
      <div className="research-pdf-upload-area">
        <label className="research-pdf-file-label">
          <input type="file" accept=".pdf" disabled={saving} onChange={(event) => { const f = event.target.files?.[0]; if (f) { setPdfFile(f); if (!title) setTitle(f.name.replace(/\.pdf$/i, '')) } }} />
          {pdfFile ? <span>📄 {pdfFile.name}（{(pdfFile.size / 1024 / 1024).toFixed(1)} MB）</span> : <span>点击选择 PDF 文件，或将文件拖拽到此处</span>}
        </label>
        {pdfProgress && <div className="research-pdf-progress"><div className="research-pdf-progress-bar" style={{ width: `${pdfProgressPct}%` }} /><span>{pdfProgress}</span></div>}
      </div>
    )}
    {notice && <p className="admin-notice">{notice}</p>}
    <div className="admin-modal-btns">
      <button onClick={onClose} disabled={saving}>取消</button>
      <button className="admin-submit" onClick={mode === 'markdown' ? submitMarkdown : submitPdf} disabled={saving || (mode === 'pdf' && !pdfFile)}>
        {saving ? (mode === 'pdf' ? '处理中…' : '发布中…') : '发布报告'}
      </button>
    </div>
  </div></div>
}
