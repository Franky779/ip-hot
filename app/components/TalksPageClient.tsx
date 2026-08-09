'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAdmin } from './AdminToggle'
import { CsvImportButton } from './CsvImportButton'

interface Article { id: string; title: string; sourceUrl: string; publishedAt: string }
interface KnowledgeTerm { id: string; category: string; term: string; definition: string; example?: string }
interface PodcastItem { title: string; date: string; url: string }
interface CourseItem { title: string; duration: string; videoUrl: string }

// 展示用词条名：剥掉尾部英文括号注释，防止长文本撑破卡片（数据里仍保留完整名称）
function displayTerm(term: string) {
  return term.replace(/\s*[（(][A-Za-z0-9][^）)]*[）)]\s*$/, '').trim()
}

const TABS = [
  { key: 'articles', label: '公众号文章' },
  { key: 'knowledge', label: '专业用语' },
  { key: 'podcast', label: '播客/直播' },
  { key: 'courses', label: '线上课程' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface TalksPageClientProps {
  articles: Article[]
  knowledge: KnowledgeTerm[]
  podcast: PodcastItem[]
  courses: CourseItem[]
}

// ====== API helpers ======

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {} as Record<string, string>
  const pw = localStorage.getItem('ip-hot-admin-pw')
  if (!pw) return {} as Record<string, string>
  return { 'x-admin-password': pw }
}

async function saveSection(section: string, data: unknown) {
  const res = await fetch(`/api/admin/talks?section=${section}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`Failed to save ${section}`)
}

// PUT 是全量覆盖：导入前先拉服务器最新数据再合并，避免用打开页面时的旧状态覆盖掉期间的改动
async function loadSection<T>(section: string): Promise<T[]> {
  const res = await fetch(`/api/admin/talks?section=${section}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('读取服务器最新数据失败')
  return res.json()
}

// ====== 主组件 ======

export function TalksPageClient({ articles: initArticles, knowledge: initKnowledge, podcast: initPodcast, courses: initCourses }: TalksPageClientProps) {
  const [active, setActive] = useState<TabKey>('articles')
  const { isAdmin } = useAdmin()

  const [articles, setArticles] = useState(initArticles)
  const [knowledge, setKnowledge] = useState(initKnowledge)
  const [podcast, setPodcast] = useState(initPodcast)
  const [courses, setCourses] = useState(initCourses)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  function showSaved() {
    setSaveMsg('已保存')
    setTimeout(() => setSaveMsg(''), 1500)
  }

  return (
    <>
      <header className="page-header">
        <div className="talks-header-row">
          <h1 className="page-title font-serif">专业知识</h1>
          <p className="page-sub">IP 行业专业用语、观察思考与经验沉淀</p>
        </div>
        <nav className="talks-tab-bar" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`talks-tab${active === tab.key ? ' active' : ''}`}
              role="tab"
              aria-selected={active === tab.key}
              onClick={() => setActive(tab.key)}
            >
              {tab.label}
            </button>
          ))}
          {isAdmin && saveMsg && <span className="talks-admin-saved visible">{saveMsg}</span>}
        </nav>
      </header>

      <section className="article-section">
        {active === 'articles' && <ArticleView articles={articles} setArticles={setArticles} isAdmin={isAdmin} showSaved={showSaved} />}
        {active === 'knowledge' && <KnowledgeView terms={knowledge} setTerms={setKnowledge} isAdmin={isAdmin} showSaved={showSaved} />}
        {active === 'podcast' && <PodcastView items={podcast} setItems={setPodcast} isAdmin={isAdmin} showSaved={showSaved} />}
        {active === 'courses' && <CourseView items={courses} setItems={setCourses} isAdmin={isAdmin} showSaved={showSaved} />}
      </section>
    </>
  )
}

// ====== 公众号文章 ======

function ArticleView({ articles, setArticles, isAdmin, showSaved }: {
  articles: Article[]; setArticles: (a: Article[]) => void; isAdmin: boolean; showSaved: () => void
}) {
  const [editing, setEditing] = useState<Article | null>(null)

  if (!isAdmin) {
    return (
      <div className="talks-list">
        {articles.length === 0 && <p className="empty-state">暂无文章</p>}
        {[...articles].sort((a, b) => Number(b.id) - Number(a.id)).map((item) => (
          <a className="talk-card talk-card-link" key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer">
            <h2>{item.title}</h2>
          </a>
        ))}
      </div>
    )
  }

  async function doSave(a: Article) {
    const idx = articles.findIndex((x) => x.id === a.id)
    const updated = idx >= 0 ? articles.map((x, i) => (i === idx ? a : x)) : [...articles, a]
    setArticles(updated)
    setEditing(null)
    await saveSection('articles', updated)
    showSaved()
  }

  async function doDelete(id: string) {
    if (!confirm('确认删除？')) return
    const updated = articles.filter((x) => x.id !== id)
    setArticles(updated)
    await saveSection('articles', updated)
    showSaved()
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button className="talks-admin-add-btn" style={{ flex: 1, margin: 0 }} onClick={() => setEditing({ id: String(Date.now()), title: '', sourceUrl: '', publishedAt: today })}>+ 新增文章</button>
          <CsvImportButton
            columns={[{ key: 'title', label: '标题', aliases: ['文章标题', '名称'] }, { key: 'sourceUrl', label: '公众号链接', aliases: ['链接', '原文地址', 'URL', 'url'] }]}
            sampleCsv={'title,sourceUrl\n文章标题一,https://mp.weixin.qq.com/s/xxxx\n文章标题二,https://mp.weixin.qq.com/s/yyyy'}
            onImport={async (rows) => {
              const imported: Article[] = rows
                .filter((r) => r.title || r.sourceUrl)
                .map((r) => ({ id: String(Date.now()) + Math.random().toString(36).slice(2, 8), title: r.title, sourceUrl: r.sourceUrl, publishedAt: today }))
              if (imported.length === 0) throw new Error('没有识别到有效数据行，请检查CSV第一行表头是否为：title,sourceUrl（或：标题,公众号链接）')
              const fresh = await loadSection<Article>('articles')
              const updated = [...fresh, ...imported]
              setArticles(updated)
              await saveSection('articles', updated)
              showSaved()
              return imported.length
            }}
          />
        </div>
        {[...articles].sort((a, b) => Number(b.id) - Number(a.id)).map((a) => (
          <div className={`talks-admin-item${editing?.id === a.id ? ' active' : ''}`} key={a.id}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{a.title}</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(a)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => doDelete(a.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="talks-admin-form">
          <h3>{editing.title ? '编辑文章' : '新增文章'}</h3>
          <label>标题<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label>公众号链接<input value={editing.sourceUrl} onChange={(e) => setEditing({ ...editing, sourceUrl: e.target.value })} placeholder="https://mp.weixin.qq.com/s/..." /></label>
          <div className="talks-admin-form-actions">
            <button className="talks-admin-save-btn" onClick={() => doSave(editing)}>保存</button>
            <button className="talks-admin-cancel-btn" onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== 专业用语 ======

function KnowledgeView({ terms, setTerms, isAdmin, showSaved }: {
  terms: KnowledgeTerm[]; setTerms: (k: KnowledgeTerm[]) => void; isAdmin: boolean; showSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<KnowledgeTerm | null>(null)
  const [editing, setEditing] = useState<KnowledgeTerm | null>(null)
  const [filterCat, setFilterCat] = useState('')
  const [extraCats, setExtraCats] = useState<string[]>([])
  const [dropCat, setDropCat] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const categories = useMemo(() => [...new Set([...terms.map((t) => t.category), ...extraCats])].sort(), [terms, extraCats])
  const filtered = useMemo(() => {
    let list = terms
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    }
    if (filterCat) list = list.filter((t) => t.category === filterCat)
    return list
  }, [search, filterCat, terms])

  const groupedByCat = useMemo(() => {
    const cats = new Map<string, KnowledgeTerm[]>()
    if (isAdmin && !search) for (const c of extraCats) cats.set(c, [])
    for (const t of filtered) {
      const list = cats.get(t.category) ?? []
      list.push(t)
      cats.set(t.category, list)
    }
    // 卡内按词条拼音首字母排序
    for (const [k, list] of cats) {
      cats.set(k, list.slice().sort((a, b) => displayTerm(a.term).localeCompare(displayTerm(b.term), 'zh-Hans-CN')))
    }
    return [...cats.entries()]
  }, [filtered, extraCats, isAdmin, search])

  const relatedTerms = useMemo(() => {
    if (!selected) return []
    return terms.filter((t) => t.category === selected.category && t.id !== selected.id).slice(0, 5)
  }, [selected, terms])

  async function doSave(t: KnowledgeTerm) {
    const idx = terms.findIndex((x) => x.id === t.id)
    const updated = idx >= 0 ? terms.map((x, i) => (i === idx ? t : x)) : [...terms, t]
    setTerms(updated)
    setEditing(null)
    await saveSection('knowledge', updated)
    showSaved()
  }

  async function doDelete(id: string) {
    if (!confirm('确认删除这个词条？')) return
    const updated = terms.filter((t) => t.id !== id)
    setTerms(updated)
    await saveSection('knowledge', updated)
    showSaved()
  }

  // 拖拽换分类
  async function moveTerm(id: string, newCat: string) {
    const t = terms.find((x) => x.id === id)
    if (!t || t.category === newCat) return
    const fresh = await loadSection<KnowledgeTerm>('knowledge')
    const updated = fresh.map((x) => (x.id === id ? { ...x, category: newCat } : x))
    setTerms(updated)
    await saveSection('knowledge', updated)
    showSaved()
  }

  // 重命名分类：批量更新该分类下所有词条
  async function renameCategory(oldName: string) {
    const name = prompt('重命名分类', oldName)?.trim()
    if (!name || name === oldName) return
    const fresh = await loadSection<KnowledgeTerm>('knowledge')
    const updated = fresh.map((x) => (x.category === oldName ? { ...x, category: name } : x))
    setTerms(updated)
    setExtraCats(extraCats.filter((c) => c !== oldName))
    if (filterCat === oldName) setFilterCat(name)
    await saveSection('knowledge', updated)
    showSaved()
  }

  // 删除分类：只允许删空分类，防止误删词条
  function deleteCategory(cat: string, termCount: number) {
    if (termCount > 0) {
      alert(`「${cat}」下还有 ${termCount} 个词条，请先把词条拖到其他分类或逐个删除`)
      return
    }
    setExtraCats(extraCats.filter((c) => c !== cat))
    if (filterCat === cat) setFilterCat('')
  }

  function addCategory() {
    const name = prompt('新分类名称')?.trim()
    if (!name) return
    if (categories.includes(name)) { alert('该分类已存在'); return }
    setExtraCats([...extraCats, name])
  }

  if (terms.length === 0 && !isAdmin) return <p className="empty-state">暂无知识词条</p>

  return (
    <div className={`knowledge-view${selected ? ' has-detail' : ''}${editing ? ' has-detail' : ''}`}>
      {(selected || editing) && (
        <>
          <div className="knowledge-detail-overlay" onClick={() => { setSelected(null); setEditing(null) }} />
          {selected && !editing && (
            <aside className="knowledge-detail-panel">
              <div className="knowledge-detail-accent" />
              <button className="knowledge-detail-back" onClick={() => setSelected(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                返回词条目录
              </button>
              <span className="knowledge-detail-cat">{selected.category}</span>
              <h2 className="knowledge-detail-title">{selected.term}</h2>
              <div className="knowledge-detail-body">
                <div className="knowledge-detail-section">
                  <h3 className="knowledge-section-heading">名词解释</h3>
                  <p>{selected.definition}</p>
                </div>
                {selected.example && (
                  <div className="knowledge-detail-section">
                    <h3 className="knowledge-section-heading">举例</h3>
                    <p>{selected.example}</p>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div style={{ marginTop: '1rem' }}>
                  <button className="talks-admin-action-btn" onClick={() => setEditing(selected)}>编辑</button>
                  <button className="talks-admin-action-btn danger" onClick={() => doDelete(selected.id)}>删除</button>
                </div>
              )}
              {relatedTerms.length > 0 && (
                <div className="knowledge-detail-related">
                  <h4 className="knowledge-detail-related-title">同分类其他词条</h4>
                  <div className="knowledge-detail-related-pills">
                    {relatedTerms.map((t) => (
                      <button key={t.id} className="knowledge-pill" onClick={() => setSelected(t)}>{t.term}</button>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
          {editing && (
            <aside className="knowledge-detail-panel">
              <div className="knowledge-detail-accent" />
              <button className="knowledge-detail-back" onClick={() => setEditing(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                返回
              </button>
              <h3 style={{ marginBottom: '1rem' }}>{terms.some((x) => x.id === editing.id) ? '编辑词条' : '新增词条'}</h3>
              <KnowledgeForm item={editing} categories={categories} onSave={doSave} onCancel={() => setEditing(null)} />
            </aside>
          )}
        </>
      )}

      <div className="knowledge-main">
        <div className="knowledge-search-wrap">
          <div className="knowledge-search-box">
            <svg className="knowledge-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className="knowledge-search-input" value={search} onChange={(e) => { setSearch(e.target.value); setSelected(null) }} placeholder="搜索 IP 行业术语…" />
          </div>
          <span className="knowledge-search-count">{search ? `${filtered.length} 个结果` : `${terms.length} 个词条`}</span>
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="talks-admin-filter" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
              <option value="">全部分类</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="talks-admin-add-btn" style={{ margin: 0 }} onClick={() => setEditing({ id: String(Date.now()), category: filterCat || categories[0] || '', term: '', definition: '' })}>+ 新增词条</button>
            <button className="talks-admin-action-btn" style={{ whiteSpace: 'nowrap' }} onClick={addCategory} title="创建一个空分类，之后可以把词条拖进来">+ 新增分类</button>
            <CsvImportButton
              columns={[
                { key: 'category', label: '分类', aliases: ['类别', '所属分类'] },
                { key: 'term', label: '词条名称', aliases: ['术语', '词条', '名词', '名称'] },
                { key: 'definition', label: '名词解释', aliases: ['定义', '解释', '释义', '含义'] },
                { key: 'example', label: '举例(选填)', aliases: ['举例', '案例/说明', '案例', '说明', '示例'] },
              ]}
              sampleCsv={'category,term,definition,example\n授权模式,保底授权,授权方与被授权方约定一个最低保证金...,\nIP分级,S级IP,指具有国民级知名度的顶级IP...,'}
              onImport={async (rows) => {
                const imported: KnowledgeTerm[] = rows
                  .filter((r) => r.category && r.term)
                  .map((r) => ({ id: String(Date.now()) + Math.random().toString(36).slice(2, 8), category: r.category, term: r.term, definition: r.definition, example: r.example || undefined }))
                if (imported.length === 0) throw new Error('没有识别到有效数据行。支持的表头：分类/类别 + 术语/词条名称/名词 + 定义/名词解释 + 案例/说明/举例')
                const fresh = await loadSection<KnowledgeTerm>('knowledge')
                const updated = [...fresh, ...imported]
                setTerms(updated)
                await saveSection('knowledge', updated)
                showSaved()
                return imported.length
              }}
            />
          </div>
        )}

        {groupedByCat.length === 0 && <p className="empty-state">未找到匹配词条，试试其他关键词</p>}
        <div className="knowledge-grid">
          {groupedByCat.map(([cat, items]) => (
            <div
              className={`knowledge-group-card${dropCat === cat ? ' drop-target' : ''}`}
              key={cat}
              onDragOver={isAdmin ? (e) => { e.preventDefault(); setDropCat(cat) } : undefined}
              onDragLeave={isAdmin ? () => setDropCat((c) => (c === cat ? null : c)) : undefined}
              onDrop={isAdmin ? (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDropCat(null); setDragId(null); if (id) moveTerm(id, cat) } : undefined}
            >
              <h3 className="knowledge-group-name">
                {cat}<span className="knowledge-group-badge">{items.length}</span>
                {isAdmin && (
                  <span style={{ display: 'inline-flex', gap: '0.2rem', marginLeft: 'auto' }}>
                    <button className="talks-admin-action-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }} onClick={() => renameCategory(cat)} title="重命名分类">✎</button>
                    <button className="talks-admin-action-btn danger" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }} onClick={() => deleteCategory(cat, items.length)} title="删除分类（仅限空分类）">✕</button>
                  </span>
                )}
              </h3>
              <div className="knowledge-pills">
                {items.map((t) => (
                  <div key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', maxWidth: '100%' }}>
                    <button
                      className={`knowledge-pill${selected?.id === t.id ? ' active' : ''}${dragId === t.id ? ' dragging' : ''}`}
                      onClick={() => setSelected(selected?.id === t.id ? null : t)}
                      draggable={isAdmin}
                      onDragStart={isAdmin ? (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id) } : undefined}
                      onDragEnd={isAdmin ? () => { setDragId(null); setDropCat(null) } : undefined}
                      title={isAdmin ? `${t.term}（可拖到其他分类）` : t.term}
                    >
                      {displayTerm(t.term)}
                    </button>
                    {isAdmin && (
                      <>
                        <button className="talks-admin-action-btn" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }} onClick={(e) => { e.stopPropagation(); setEditing(t) }} title="编辑">✎</button>
                        <button className="talks-admin-action-btn danger" style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }} onClick={(e) => { e.stopPropagation(); doDelete(t.id) }} title="删除">✕</button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
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

// ====== 播客/直播 ======

function PodcastView({ items, setItems, isAdmin, showSaved }: {
  items: PodcastItem[]; setItems: (p: PodcastItem[]) => void; isAdmin: boolean; showSaved: () => void
}) {
  const [editing, setEditing] = useState<PodcastItem | null>(null)

  if (!isAdmin) {
    return (
      <div className="talks-list">
        {items.length === 0 && <p className="empty-state">暂无播客</p>}
        {items.map((item) => (
          <article className="talk-card" key={item.title}>
            <h2>{item.title}</h2>
            <time className="talk-card-meta" dateTime={item.date}>{item.date}</time>
          </article>
        ))}
      </div>
    )
  }

  async function doSave(p: PodcastItem) {
    const exists = items.some((x) => x.title === p.title)
    const updated = exists ? items.map((x) => (x.title === p.title ? p : x)) : [...items, p]
    setItems(updated)
    setEditing(null)
    await saveSection('podcast', updated)
    showSaved()
  }

  async function doDelete(title: string) {
    if (!confirm('确认删除？')) return
    const updated = items.filter((x) => x.title !== title)
    setItems(updated)
    await saveSection('podcast', updated)
    showSaved()
  }

  return (
    <div className="talks-admin-split">
      <div className="talks-admin-list">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <button className="talks-admin-add-btn" style={{ flex: 1, margin: 0 }} onClick={() => setEditing({ title: '', date: new Date().toISOString().slice(0, 10), url: '' })}>+ 新增播客</button>
          <CsvImportButton
            columns={[{ key: 'title', label: '标题', aliases: ['名称', '节目标题'] }, { key: 'date', label: '日期', aliases: ['发布时间', '更新日期'] }, { key: 'url', label: '链接', aliases: ['URL', '地址', '播放链接'] }]}
            sampleCsv={'title,date,url\nEP07｜标题,2026-08-07,https://www.ximalaya.com/...\nEP08｜另一个标题,2026-08-14,https://www.ximalaya.com/...'}
            onImport={async (rows) => {
              const imported: PodcastItem[] = rows.filter((r) => r.title).map((r) => ({ title: r.title, date: r.date || new Date().toISOString().slice(0, 10), url: r.url }))
              if (imported.length === 0) throw new Error('没有识别到有效数据行，请检查CSV第一行表头是否为：title,date,url（或：标题,日期,链接）')
              const fresh = await loadSection<PodcastItem>('podcast')
              const updated = [...fresh, ...imported]
              setItems(updated)
              await saveSection('podcast', updated)
              showSaved()
              return imported.length
            }}
          />
        </div>
        {items.map((p) => (
          <div className={`talks-admin-item${editing?.title === p.title ? ' active' : ''}`} key={p.title}>
            <div className="talks-admin-item-main">
              <span className="talks-admin-item-title">{p.title}</span>
              <span className="talks-admin-item-meta">{p.date}</span>
            </div>
            <div className="talks-admin-item-actions">
              <button className="talks-admin-action-btn" onClick={() => setEditing(p)}>编辑</button>
              <button className="talks-admin-action-btn danger" onClick={() => doDelete(p.title)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="talks-admin-form">
          <h3>{editing.title ? '编辑播客' : '新增播客'}</h3>
          <label>标题<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label>日期<input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label>
          <label>链接<input value={editing.url} onChange={(e) => setEditing({ ...editing, url: e.target.value })} placeholder="https://www.ximalaya.com/..." /></label>
          <div className="talks-admin-form-actions">
            <button className="talks-admin-save-btn" onClick={() => doSave(editing)}>保存</button>
            <button className="talks-admin-cancel-btn" onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ====== 线上课程 ======

function CourseView({ items, setItems, isAdmin, showSaved }: {
  items: CourseItem[]; setItems: (c: CourseItem[]) => void; isAdmin: boolean; showSaved: () => void
}) {
  const [editing, setEditing] = useState<CourseItem | null>(null)

  if (!isAdmin) {
    return (
      <div className="talks-list">
        {items.length === 0 && <p className="empty-state">暂无课程</p>}
        {items.map((item) => (
          <article className="talk-card" key={item.title}>
            <h2>{item.title}</h2>
            <span className="talk-card-meta">{item.duration}</span>
          </article>
        ))}
      </div>
    )
  }

  async function doSave(c: CourseItem) {
    const exists = items.some((x) => x.title === c.title)
    const updated = exists ? items.map((x) => (x.title === c.title ? c : x)) : [...items, c]
    setItems(updated)
    setEditing(null)
    await saveSection('courses', updated)
    showSaved()
  }

  async function doDelete(title: string) {
    if (!confirm('确认删除？')) return
    const updated = items.filter((x) => x.title !== title)
    setItems(updated)
    await saveSection('courses', updated)
    showSaved()
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
              <button className="talks-admin-action-btn danger" onClick={() => doDelete(c.title)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <div className="talks-admin-form">
          <h3>{editing.title ? '编辑课程' : '新增课程'}</h3>
          <label>标题<input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
          <label>时长<input value={editing.duration} onChange={(e) => setEditing({ ...editing, duration: e.target.value })} placeholder="如：48分钟" /></label>
          <label>视频链接<input value={editing.videoUrl} onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value })} placeholder="B站/腾讯视频链接" /></label>
          <div className="talks-admin-form-actions">
            <button className="talks-admin-save-btn" onClick={() => doSave(editing)}>保存</button>
            <button className="talks-admin-cancel-btn" onClick={() => setEditing(null)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}
