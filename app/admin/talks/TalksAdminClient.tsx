'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

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

// ====== 默认数据 ======

const DEFAULT_ARTICLES: Article[] = [
  { id: '1', title: '【深度】30天，4万+字，我手搓了一份卡牌赛道深度报告，让我发现了7个行业真相和6个预判', sourceUrl: 'https://mp.weixin.qq.com/s/pt6ZZS62KScygA3Wf2dFvg', publishedAt: '2026-06-05' },
  { id: '2', title: 'Q1烧掉20亿，瑞幸KFC们的联名还卖得动吗？', sourceUrl: 'https://mp.weixin.qq.com/s/BmG6xWl54BpZRiDXZJ4UAA', publishedAt: '2026-05-18' },
  { id: '3', title: '当人人都能一键AI出图，IP行业最大的谎言被戳穿了', sourceUrl: 'https://mp.weixin.qq.com/s/V7SiPgaqkf8BpFm3YVstCw', publishedAt: '2026-05-15' },
  { id: '4', title: '别碰二次元，碰就是死！', sourceUrl: 'https://mp.weixin.qq.com/s/YCv7oSVyU94J8W8agSHb8A', publishedAt: '2026-05-07' },
  { id: '5', title: '满大街都是"类似Labubu"和"类似娃三岁"，你们到底在恶心谁？', sourceUrl: 'https://mp.weixin.qq.com/s/lr1kbxn6ldMSKYg7gwZ1AA', publishedAt: '2026-05-06' },
  { id: '6', title: '【盘点】五一期间上新的IP授权案例', sourceUrl: 'https://mp.weixin.qq.com/s/xvVBZ8MS97gxRYeHmFm9Fw', publishedAt: '2026-05-01' },
  { id: '7', title: '【深度盘点分析】哆啦A梦2026年IP授权联名案例。这世上根本就没有"新IP红利"！', sourceUrl: 'https://mp.weixin.qq.com/s/4ldB2hyuWNgx2WAp6RiI6g', publishedAt: '2026-04-28' },
  { id: '8', title: '笑死！那个拿下哪吒1亿订单的工厂，现在要倒闭了……真相远比你想的残酷', sourceUrl: 'https://mp.weixin.qq.com/s/qaS1yz2OTUxx0JgaUGyRsA', publishedAt: '2026-04-19' },
]

const DEFAULT_KNOWLEDGE: KnowledgeTerm[] = [
  { id: 'k1', category: '授权模式', term: '保底授权', definition: '授权方与被授权方约定一个最低保证金（Minimum Guarantee），被授权方无论实际销售收入如何，都必须支付这笔保底金额。超出保底部分按约定的版税率分成。这是最常见的IP授权合作模式，对IP方来说是风险最低的方式。' },
  { id: 'k2', category: '授权模式', term: '分成授权', definition: '不设最低保证金，被授权方按实际销售额的一定比例（通常3%-10%）向IP方支付版税。适合初期测试市场反应的中小品牌，IP方承担的风险更大，但被授权方的资金压力较小。' },
  { id: 'k3', category: '授权模式', term: '买断授权', definition: '被授权方一次性支付固定费用，在约定时间和区域内独家使用IP。买断金额通常远高于保底授权，适合对市场有充分信心的大品牌或核心品类合作伙伴。' },
  { id: 'k4', category: '授权模式', term: '独家授权', definition: '在特定品类、区域和时间内，IP方只授权给唯一一家被授权商。独家授权通常需要更高的保证金和版税率，但在该品类内排除了竞争者，适合核心品类深度合作。' },
  { id: 'k5', category: '授权模式', term: '非独家授权', definition: '同一品类和区域可以同时授权给多家被授权商。适合周边衍生品等非核心品类，可以快速铺开市场覆盖，但可能导致同品类内价格战。' },
  { id: 'k6', category: 'IP分级', term: 'S级IP', definition: '指具有国民级知名度、全年龄段渗透率、持续商业变现能力的顶级IP。典型特征：单一IP年授权收入过亿、社交媒体话题量百亿级、衍生品销售额十亿级。如迪士尼、宝可梦、三丽鸥等。' },
  { id: 'k7', category: 'IP分级', term: 'A级IP', definition: '在特定人群或区域有极高的影响力和忠诚度，年授权收入千万级。通常是头部国漫、热门游戏IP或一线潮玩IP。商业变现能力强但受众面较S级窄。' },
  { id: 'k8', category: 'IP分级', term: '长青IP', definition: '持续运营超过10年、保持稳定商业收入的IP。核心特征是"跨代际"——不同年龄段的消费者都认识并愿意为之消费。如哆啦A梦、龙珠、Hello Kitty等。' },
  { id: 'k9', category: '衍生品类型', term: '盲盒', definition: '将玩偶/手办装在密封不透明的盒子中销售，消费者购买时不知道具体款式。核心机制是"随机性+系列收集"，利用不确定性的心理驱动复购。泡泡玛特是盲盒模式的标杆企业。通常售价49-99元/个，毛利率可达60-70%。' },
  { id: 'k10', category: '衍生品类型', term: '吧唧/徽章', definition: '日语音译"バッジ"（Badge），即金属徽章。因生产成本低（单片成本1-3元）、溢价空间大（售价15-50元）、便于收藏展示，已成为二次元IP衍生品中销量最大的品类。通常在漫展和线下谷子店销售。' },
  { id: 'k11', category: '衍生品类型', term: '谷子', definition: '日语"グッズ"（Goods）的音译，泛指二次元IP的周边商品。常见的谷子类型包括吧唧、立牌、色纸、挂件、亚克力制品等。"吃谷"指购买周边，"出谷"指转让周边，是二次元圈层的核心消费行为。' },
  { id: 'k12', category: '产业链角色', term: 'IP方/版权方', definition: '拥有IP知识产权的权利主体，可以是个人创作者、动画制作公司、游戏开发商或品牌管理公司。IP方通过授权将IP的使用权授予被授权商，收取版税或保证金作为收入来源。' },
  { id: 'k13', category: '产业链角色', term: '授权代理', definition: '受IP方委托，负责IP在特定区域或品类内的授权业务拓展。核心工作包括招商、谈判、合同管理、监修和版税结算。通常收取版税收入的15%-30%作为佣金。国内头部授权代理包括阿里鱼、艺洲人等。' },
  { id: 'k14', category: '产业链角色', term: '被授权商/品牌方', definition: '获得IP使用权开发联名产品或衍生品的企业。需要向IP方支付版税，同时承担产品开发、生产和销售的全部成本与风险。选择IP的核心考量：粉丝重合度、品类匹配度、投入产出比。' },
  { id: 'k15', category: '营销术语', term: '联名/Co-branding', definition: '两个或多个品牌/IP联合推出产品，共享品牌资产和粉丝群体。IP联名的本质是"借流量"——品牌方借IP的粉丝认知度快速获得关注，IP方获得版税收入和曝光。成功联名的核心公式：匹配度×创意×执行力。' },
  { id: 'k16', category: '营销术语', term: '快闪店/Pop-up', definition: '在商场、街区等人流密集区域临时搭建的品牌体验空间，运营时间通常为1-3个月。IP快闪的核心价值是"沉浸式体验+社交传播+即时转化"。选址决定流量的50%以上，视觉冲击力决定停留率。' },
  { id: 'k17', category: '营销术语', term: '美陈', definition: '"美术陈列"的简称，指商场、展厅等商业空间中的主题装置艺术布置。IP美陈是用IP形象打造的大型立体装置，通常包括雕塑、灯光、互动装置，用于吸引人流、制造社交传播素材。单个项目造价从几万到上百万不等。' },
  { id: 'k18', category: '合同条款', term: '最低保证金/MG', definition: 'Minimum Guarantee。被授权方在合同期内必须支付给IP方的最低金额，无论实际销售情况如何。MG是IP方转移风险的核心工具——即使产品滞销，IP方也能获得基础收入。MG金额与IP等级、品类、区域和期限直接相关。' },
  { id: 'k19', category: '合同条款', term: '版税率/Royalty Rate', definition: '被授权方按批发销售额（Wholesale Revenue）支付给IP方的分成比例。国内IP授权版税率通常在3%-10%之间：头部IP可达8%-12%，腰部IP为5%-8%，新兴IP为3%-6%。通常与MG搭配使用，取二者中较高者支付。' },
  { id: 'k20', category: '营销术语', term: 'KOL种草', definition: '通过关键意见领袖（Key Opinion Leader）在社交媒体上发布产品体验内容，利用其粉丝信任度驱动购买决策。IP衍生品种草的核心阵地是小红书、抖音和B站。KOL筛选标准：粉丝画像匹配度>粉丝数量。' },
]

const DEFAULT_PODCAST: PodcastItem[] = [
  { title: 'EP06｜拆解LABUBU全球爆火：从丑萌到百亿潮玩帝国的底层逻辑', date: '2026-07-28', url: 'https://www.ximalaya.com/album/12345678/001' },
  { title: 'EP05｜IP联名下半场：瑞幸们烧完20亿后，品牌方学到的5条血泪教训', date: '2026-07-15', url: 'https://www.ximalaya.com/album/12345678/002' },
  { title: 'EP04｜谷子经济为什么突然火了？一个千亿级赛道的冷启动密码', date: '2026-07-02', url: 'https://www.ximalaya.com/album/12345678/003' },
  { title: 'EP03｜对话TOPTOY创始人：线下零售的IP选品逻辑和坪效密码', date: '2026-06-18', url: 'https://www.ximalaya.com/album/12345678/004' },
  { title: 'EP02｜AI绘画冲击波：当人人都能一键出图，设计师和画师怎么办', date: '2026-06-05', url: 'https://www.ximalaya.com/album/12345678/005' },
  { title: 'EP01｜开播特辑：我为什么要在IP行业做一个深度内容账号', date: '2026-05-22', url: 'https://www.ximalaya.com/album/12345678/006' },
]

const DEFAULT_COURSES: CourseItem[] = [
  { title: '第一课：IP授权商业模式全景图', duration: '48分钟', videoUrl: '#' },
  { title: '第二课：如何评估一个IP的商业价值', duration: '52分钟', videoUrl: '#' },
  { title: '第三课：授权合同核心条款拆解与谈判技巧', duration: '63分钟', videoUrl: '#' },
  { title: '第四课：从0到1打造IP联名产品', duration: '45分钟', videoUrl: '#' },
  { title: '第五课：潮玩盲盒的产品设计与定价策略', duration: '55分钟', videoUrl: '#' },
  { title: '第六课：商场快闪店的选址、搭建与运营SOP', duration: '58分钟', videoUrl: '#' },
]

const LS_KEY = 'ip-hot-talks-data'

function loadData(): TalksData {
  if (typeof window === 'undefined') return { articles: DEFAULT_ARTICLES, knowledge: DEFAULT_KNOWLEDGE, podcast: DEFAULT_PODCAST, courses: DEFAULT_COURSES }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // migration: if knowledge is old format (category+items), convert to new format
      if (parsed.knowledge && Array.isArray(parsed.knowledge) && parsed.knowledge.length > 0 && 'items' in parsed.knowledge[0]) {
        const migrated: KnowledgeTerm[] = []
        for (const g of parsed.knowledge) {
          for (const item of g.items) {
            migrated.push({ id: String(Date.now()) + Math.random(), category: g.category, term: item, definition: '' })
          }
        }
        parsed.knowledge = migrated
      }
      return parsed
    }
  } catch { /* ignore */ }
  return { articles: DEFAULT_ARTICLES, knowledge: DEFAULT_KNOWLEDGE, podcast: DEFAULT_PODCAST, courses: DEFAULT_COURSES }
}

function saveData(data: TalksData) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, JSON.stringify(data))
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

  useEffect(() => { setData(loadData()) }, [])

  const update = useCallback((newData: TalksData) => {
    setData(newData)
    saveData(newData)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
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
