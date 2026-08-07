'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { CsvImportButton } from './CsvImportButton'

// ====== 数据结构 ======

interface Article { id: string; title: string; sourceUrl: string; publishedAt: string }
interface KnowledgeTerm { id: string; category: string; term: string; definition: string; example?: string }
interface PodcastItem { title: string; date: string; url: string }
interface CourseItem { title: string; duration: string; videoUrl: string }

interface TalksData {
  articles: Article[]
  knowledge: KnowledgeTerm[]
  podcast: PodcastItem[]
  courses: CourseItem[]
}

// ====== API helpers ======

async function fetchSection(section: string) {
  const res = await fetch(`/api/admin/talks?section=${section}`)
  if (!res.ok) throw new Error(`Failed to fetch ${section}`)
  return res.json()
}

async function saveSection(section: string, data: unknown) {
  const res = await fetch(`/api/admin/talks?section=${section}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to save ${section}`)
}

// ====== 主组件 ======

const ADMIN_TABS = [
  { key: 'articles', label: '公众号文章' },
  { key: 'knowledge', label: '行业知识' },
  { key: 'podcast', label: '播客/直播' },
  { key: 'courses', label: '线上课程' },
] as const

type AdminTabKey = (typeof ADMIN_TABS)[number]['key']

export function TalksAdminClient() {
  const [data, setData] = useState<TalksData | null>(null)
  const [active, setActive] = useState<AdminTabKey>('articles')
  const [editing, setEditing] = useState<Article | KnowledgeTerm | PodcastItem | CourseItem | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const [articles, knowledge, podcast, courses] = await Promise.all([
          fetchSection('articles'),
          fetchSection('knowledge'),
          fetchSection('podcast'),
          fetchSection('courses'),
        ])
        setData({ articles, knowledge, podcast, courses })
      } catch {
        setError('加载数据失败，请刷新页面重试')
      }
    })()
  }, [])

  const update = useCallback(async (newData: TalksData) => {
    setData(newData)
    try {
      await Promise.all([
        saveSection('articles', newData.articles),
        saveSection('knowledge', newData.knowledge),
        saveSection('podcast', newData.podcast),
        saveSection('courses', newData.courses),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch {
      setError('保存失败，请重试')
    }
  }, [])

  if (!data) return <section className="article-section"><p className="empty-state">加载中…</p></section>

  return (
    <section className="article-section">
      <div className="talks-admin-toolbar">
        <nav className="talks-tab-bar talks-admin-tab-bar" role="tablist">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.key}
              className={`talks-tab${active === tab.key ? ' active' : ''}`}
              role="tab" aria-selected={active === tab.key}
              onClick={() => { setActive(tab.key); setEditing(null) }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <span className={`talks-admin-saved${saved ? ' visible' : ''}`}>已保存</span>
        {error && <span className="talks-admin-error">{error}</span>}
      </div>

      <div className="talks-admin-content">
        {active === 'articles' && <ArticleEditor articles={data.articles} editing={editing as Article | null} update={(articles) => update({ ...data, articles })} />}
        {active === 'knowledge' && <KnowledgeEditor terms={data.knowledge} update={(knowledge) => update({ ...data, knowledge })} />}
        {active === 'podcast' && <PodcastEditor items={data.podcast} editing={editing as PodcastItem | null} update={(podcast) => update({ ...data, podcast })} />}
        {active === 'courses' && <CourseEditor items={data.courses} editing={editing as CourseItem | null} update={(courses) => update({ ...data, courses })} />}
      </div>
    </section>
  )
}

// ====== 公众号文章编辑器 ======

function ArticleEditor({ articles, editing: externalEditing, update }: { articles: Article[]; editing: Article | null; update: (a: Article[]) => void }) {
  const [editing, setEditing] = useState<Article | null>(externalEditing)
  useEffect(() => { setEditing(externalEditing) }, [externalEditing])

  const saveRef = (a: Article) => {
    const idx = articles.findIndex((x) => x.id === a.id)
    update(idx >= 0 ? articles.map((x, i) => (i === idx ? a : x)) : [...articles, a])
    setEditing(null)
  }

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <button className="talks-admin-add-btn" onClick={() => setEditing({ id: String(Date.now()), title: '', sourceUrl: '', publishedAt: new Date().toISOString().slice(0, 10) })}>+ 新增文章</button>
        <CsvImportButton
          columns={[{ key: 'title', label: '标题' }, { key: 'sourceUrl', label: '公众号链接' }]}
          sampleCsv={'title,sourceUrl\n文章标题一,https://mp.weixin.qq.com/s/xxxx\n文章标题二,https://mp.weixin.qq.com/s/yyyy'}
          onImport={(rows) => {
            const today = new Date().toISOString().slice(0, 10)
            const imported: Article[] = rows
              .filter((r) => r.title || r.sourceUrl)
              .map((r) => ({ id: String(Date.now()) + Math.random().toString(36).slice(2, 8), title: r.title, sourceUrl: r.sourceUrl, publishedAt: today }))
            update([...articles, ...imported])
          }}
        />
        {[...articles].sort((a, b) => Number(b.id) - Number(a.id)).map((a) => (
          <div className={`talks-admin-item${editing?.id === a.id ? ' active' : ''}`} key={a.id}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{a.title}</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(a)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => { if (confirm('确认删除？')) update(articles.filter((x) => x.id !== a.id)) }}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <ArticleForm item={editing} onSave={saveRef} onCancel={() => setEditing(null)} />}
    </div>
  )
}

function ArticleForm({ item, onSave, onCancel }: { item: Article; onSave: (a: Article) => void; onCancel: () => void }) {
  const [form, setForm] = useState(item)
  useEffect(() => { setForm(item) }, [item])
  return (
    <div className="talks-admin-form">
      <h3>{item.title ? '编辑文章' : '新增文章'}</h3>
      <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>公众号链接<input value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} placeholder="https://mp.weixin.qq.com/s/..." /></label>
      <div className="talks-admin-form-actions">
        <button className="talks-admin-save-btn" onClick={() => onSave(form)}>保存</button>
        <button className="talks-admin-cancel-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

// ====== 行业知识编辑器（百科词条） ======

function KnowledgeEditor({ terms, update }: { terms: KnowledgeTerm[]; update: (k: KnowledgeTerm[]) => void }) {
  const [editing, setEditing] = useState<KnowledgeTerm | null>(null)
  const [filterCat, setFilterCat] = useState('')

  const categories = useMemo(() => [...new Set(terms.map((t) => t.category))].sort(), [terms])
  const filtered = filterCat ? terms.filter((t) => t.category === filterCat) : terms

  const handleSave = (t: KnowledgeTerm) => {
    const idx = terms.findIndex((x) => x.id === t.id)
    update(idx >= 0 ? terms.map((x, i) => (i === idx ? t : x)) : [...terms, t])
    setEditing(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('确认删除这个词条？')) return
    update(terms.filter((t) => t.id !== id))
  }

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <select className="talks-admin-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">全部分类</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="talks-admin-add-btn" style={{ flex: 1, margin: 0 }} onClick={() => setEditing({ id: String(Date.now()), category: filterCat || categories[0] || '', term: '', definition: '' })}>+ 新增词条</button>
          <CsvImportButton
            columns={[{ key: 'category', label: '分类' }, { key: 'term', label: '词条名称' }, { key: 'definition', label: '名词解释' }, { key: 'example', label: '举例(选填)' }]}
            sampleCsv={'category,term,definition,example\n授权模式,保底授权,授权方与被授权方约定一个最低保证金...,\nIP分级,S级IP,指具有国民级知名度的顶级IP...,'}
            onImport={(rows) => {
              const imported: KnowledgeTerm[] = rows
                .filter((r) => r.category && r.term)
                .map((r) => ({ id: String(Date.now()) + Math.random().toString(36).slice(2, 8), category: r.category, term: r.term, definition: r.definition, example: r.example || undefined }))
              update([...terms, ...imported])
            }}
          />
        </div>
        {filtered.map((t) => (
          <div className={`talks-admin-item${editing?.id === t.id ? ' active' : ''}`} key={t.id}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{t.term}</span>
              <span className="talks-admin-item-meta">{t.category} · {t.definition.slice(0, 50)}…</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(t)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => handleDelete(t.id)}>删除</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty-state">该分类下暂无词条</p>}
      </div>
      {editing && (
        <div className="talks-admin-form">
          <h3>{terms.some((x) => x.id === editing.id) ? '编辑词条' : '新增词条'}</h3>
          <KnowledgeForm item={editing} categories={categories} onSave={handleSave} onCancel={() => setEditing(null)} />
        </div>
      )}
    </div>
  )
}

function KnowledgeForm({ item, categories, onSave, onCancel }: { item: KnowledgeTerm; categories: string[]; onSave: (t: KnowledgeTerm) => void; onCancel: () => void }) {
  const [form, setForm] = useState(item)
  useEffect(() => { setForm(item) }, [item])
  const [newCat, setNewCat] = useState('')

  const allCats = [...(newCat ? [...categories, newCat] : categories)]

  return (
    <>
      <label>词条名称<input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="如：保底授权" /></label>
      <label>分类
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem' }}>
          <select style={{ flex: 1, padding: '0.55rem 0.75rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: '0.875rem' }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
          <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="或输入新分类名称" style={{ flex: 1 }} />
        </div>
      </label>
      <label>名词解释<textarea value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} placeholder="这个词的含义、应用场景、行业内如何理解和使用…" style={{ display: 'block', width: '100%', marginTop: '0.3rem', padding: '0.55rem 0.75rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: '0.875rem', minHeight: '120px', resize: 'vertical' }} /></label>
      <label>举例（选填）<textarea value={form.example ?? ''} onChange={(e) => setForm({ ...form, example: e.target.value || undefined })} placeholder="具体的商业案例、数据或场景说明…" style={{ display: 'block', width: '100%', marginTop: '0.3rem', padding: '0.55rem 0.75rem', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', fontSize: '0.875rem', minHeight: '80px', resize: 'vertical' }} /></label>
      <div className="talks-admin-form-actions">
        <button className="talks-admin-save-btn" onClick={() => onSave({ ...form, category: newCat || form.category })}>保存</button>
        <button className="talks-admin-cancel-btn" onClick={onCancel}>取消</button>
      </div>
    </>
  )
}

// ====== 播客编辑器 ======

function PodcastEditor({ items, editing: externalEditing, update }: { items: PodcastItem[]; editing: PodcastItem | null; update: (p: PodcastItem[]) => void }) {
  const [editing, setEditing] = useState<PodcastItem | null>(externalEditing)
  useEffect(() => { setEditing(externalEditing) }, [externalEditing])

  const handleSave = (p: PodcastItem) => {
    const exists = items.some((x) => x.title === p.title)
    update(exists ? items.map((x) => (x.title === p.title ? p : x)) : [...items, p])
    setEditing(null)
  }

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <button className="talks-admin-add-btn" onClick={() => setEditing({ title: '', date: new Date().toISOString().slice(0, 10), url: '' })}>+ 新增播客</button>
        <CsvImportButton
          columns={[{ key: 'title', label: '标题' }, { key: 'date', label: '日期' }, { key: 'url', label: '链接' }]}
          sampleCsv={'title,date,url\nEP07｜标题,2026-08-07,https://www.ximalaya.com/...\nEP08｜另一个标题,2026-08-14,https://www.ximalaya.com/...'}
          onImport={(rows) => {
            const imported: PodcastItem[] = rows
              .filter((r) => r.title)
              .map((r) => ({ title: r.title, date: r.date || new Date().toISOString().slice(0, 10), url: r.url }))
            update([...items, ...imported])
          }}
        />
        {items.map((p) => (
          <div className={`talks-admin-item${editing?.title === p.title ? ' active' : ''}`} key={p.title}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{p.title}</span>
              <span className="talks-admin-item-meta">{p.date}</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(p)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => { if (confirm('确认删除？')) update(items.filter((x) => x.title !== p.title)) }}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <PodcastForm item={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
    </div>
  )
}

function PodcastForm({ item, onSave, onCancel }: { item: PodcastItem; onSave: (p: PodcastItem) => void; onCancel: () => void }) {
  const [form, setForm] = useState(item)
  useEffect(() => { setForm(item) }, [item])
  return (
    <div className="talks-admin-form">
      <h3>{item.title ? '编辑播客' : '新增播客'}</h3>
      <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>日期<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      <label>链接<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.ximalaya.com/..." /></label>
      <div className="talks-admin-form-actions">
        <button className="talks-admin-save-btn" onClick={() => onSave(form)}>保存</button>
        <button className="talks-admin-cancel-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

// ====== 课程编辑器 ======

function CourseEditor({ items, editing: externalEditing, update }: { items: CourseItem[]; editing: CourseItem | null; update: (c: CourseItem[]) => void }) {
  const [editing, setEditing] = useState<CourseItem | null>(externalEditing)
  useEffect(() => { setEditing(externalEditing) }, [externalEditing])

  const handleSave = (c: CourseItem) => {
    const exists = items.some((x) => x.title === c.title)
    update(exists ? items.map((x) => (x.title === c.title ? c : x)) : [...items, c])
    setEditing(null)
  }

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <button className="talks-admin-add-btn" onClick={() => setEditing({ title: '', duration: '', videoUrl: '' })}>+ 新增课程</button>
        {items.map((c) => (
          <div className={`talks-admin-item${editing?.title === c.title ? ' active' : ''}`} key={c.title}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{c.title}</span>
              <span className="talks-admin-item-meta">{c.duration}</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(c)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => { if (confirm('确认删除？')) update(items.filter((x) => x.title !== c.title)) }}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && <CourseForm item={editing} onSave={handleSave} onCancel={() => setEditing(null)} />}
    </div>
  )
}

function CourseForm({ item, onSave, onCancel }: { item: CourseItem; onSave: (c: CourseItem) => void; onCancel: () => void }) {
  const [form, setForm] = useState(item)
  useEffect(() => { setForm(item) }, [item])
  return (
    <div className="talks-admin-form">
      <h3>{item.title ? '编辑课程' : '新增课程'}</h3>
      <label>标题<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>时长<input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="如：48分钟" /></label>
      <label>视频链接<input value={form.videoUrl} onChange={(e) => setForm({ ...form, videoUrl: e.target.value })} placeholder="B站/腾讯视频链接" /></label>
      <div className="talks-admin-form-actions">
        <button className="talks-admin-save-btn" onClick={() => onSave(form)}>保存</button>
        <button className="talks-admin-cancel-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}
