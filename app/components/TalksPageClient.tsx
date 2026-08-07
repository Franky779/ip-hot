'use client'

import { useState, useEffect, useMemo } from 'react'
import { LAOJIA_TALKS } from '@/lib/migrated-content'
import { IndustryPractices } from '@/app/components/IndustryPractices'
import { getAllKnowledgeTerms, searchKnowledgeTerms, type KnowledgeTerm } from '@/lib/knowledge'

const TABS = [
  { key: 'articles', label: '公众号文章' },
  { key: 'knowledge', label: '行业知识' },
  { key: 'practices', label: '行业实操' },
  { key: 'podcast', label: '播客/直播' },
  { key: 'courses', label: '线上课程' },
] as const

type TabKey = (typeof TABS)[number]['key']

const LS_KEY = 'ip-hot-talks-data'

interface TalksData {
  articles: { id: string; title: string; sourceUrl: string; publishedAt: string }[]
  podcast: { title: string; date: string; url: string }[]
  courses: { title: string; duration: string; videoUrl: string }[]
}

function loadTalksData(): TalksData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

/** @deprecated — migrated to data/knowledge-terms.json; kept for admin backward compat */
const _DEFAULT_KNOWLEDGE: KnowledgeTerm[] = [
  { id: 'k1', category: '授权模式', term: '保底授权', definition: '授权方与被授权方约定一个最低保证金（Minimum Guarantee），被授权方无论实际销售收入如何，都必须支付这笔保底金额。超出保底部分按约定的版税率分成。这是最常见的IP授权合作模式，对IP方来说是风险最低的方式。', example: '泡泡玛特与迪士尼的合作即采用保底授权模式：泡泡玛特先支付一笔保底金给迪士尼，获得米奇、公主系列等IP的盲盒开发权。每卖出一个盲盒，超出保底部分的销售额按8%版税率分成给迪士尼。如果盲盒滞销，迪士尼至少拿到了保底金，风险由泡泡玛特承担。' },
  { id: 'k2', category: '授权模式', term: '分成授权', definition: '不设最低保证金，被授权方按实际销售额的一定比例（通常3%-10%）向IP方支付版税。适合初期测试市场反应的中小品牌，IP方承担的风险更大，但被授权方的资金压力较小。' },
  { id: 'k3', category: '授权模式', term: '买断授权', definition: '被授权方一次性支付固定费用，在约定时间和区域内独家使用IP。买断金额通常远高于保底授权，适合对市场有充分信心的大品牌或核心品类合作伙伴。', example: '名创优品2024年以买断方式获得某个日本动漫IP的中国区独家使用权，一次性支付2000万元。之后名创优品独立开发了50+款SKU，所有销售收入归名创优品，无需再向IP方支付版税。' },
  { id: 'k4', category: '授权模式', term: '独家授权', definition: '在特定品类、区域和时间内，IP方只授权给唯一一家被授权商。独家授权通常需要更高的保证金和版税率，但在该品类内排除了竞争者，适合核心品类深度合作。' },
  { id: 'k5', category: '授权模式', term: '非独家授权', definition: '同一品类和区域可以同时授权给多家被授权商。适合周边衍生品等非核心品类，可以快速铺开市场覆盖，但可能导致同品类内价格战。' },
  { id: 'k6', category: 'IP分级', term: 'S级IP', definition: '指具有国民级知名度、全年龄段渗透率、持续商业变现能力的顶级IP。典型特征：单一IP年授权收入过亿、社交媒体话题量百亿级、衍生品销售额十亿级。如迪士尼、宝可梦、三丽鸥等。' },
  { id: 'k7', category: 'IP分级', term: 'A级IP', definition: '在特定人群或区域有极高的影响力和忠诚度，年授权收入千万级。通常是头部国漫、热门游戏IP或一线潮玩IP。商业变现能力强但受众面较S级窄。' },
  { id: 'k8', category: 'IP分级', term: '长青IP', definition: '持续运营超过10年、保持稳定商业收入的IP。核心特征是"跨代际"——不同年龄段的消费者都认识并愿意为之消费。如哆啦A梦、龙珠、Hello Kitty等。' },
  { id: 'k9', category: '衍生品类型', term: '盲盒', definition: '将玩偶/手办装在密封不透明的盒子中销售，消费者购买时不知道具体款式。核心机制是"随机性+系列收集"，利用不确定性的心理驱动复购。泡泡玛特是盲盒模式的标杆企业。通常售价49-99元/个，毛利率可达60-70%。', example: '泡泡玛特LABUBU "The Monsters"系列：每个盲盒售价69元，全系列12款（含1款隐藏款，概率1/144）。隐藏款二手市场价可达2000元以上。消费者为集齐全套或抽中隐藏款会反复购买，系列复购率通常超过40%。' },
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

const PODCAST_ITEMS = [
  { title: 'EP06｜拆解LABUBU全球爆火：从丑萌到百亿潮玩帝国的底层逻辑', date: '2026-07-28', url: 'https://www.ximalaya.com/album/12345678/001' },
  { title: 'EP05｜IP联名下半场：瑞幸们烧完20亿后，品牌方学到的5条血泪教训', date: '2026-07-15', url: 'https://www.ximalaya.com/album/12345678/002' },
  { title: 'EP04｜谷子经济为什么突然火了？一个千亿级赛道的冷启动密码', date: '2026-07-02', url: 'https://www.ximalaya.com/album/12345678/003' },
  { title: 'EP03｜对话TOPTOY创始人：线下零售的IP选品逻辑和坪效密码', date: '2026-06-18', url: 'https://www.ximalaya.com/album/12345678/004' },
  { title: 'EP02｜AI绘画冲击波：当人人都能一键出图，设计师和画师怎么办', date: '2026-06-05', url: 'https://www.ximalaya.com/album/12345678/005' },
  { title: 'EP01｜开播特辑：我为什么要在IP行业做一个深度内容账号', date: '2026-05-22', url: 'https://www.ximalaya.com/album/12345678/006' },
]

const COURSE_ITEMS = [
  { title: '第一课：IP授权商业模式全景图', duration: '48分钟', videoUrl: '#' },
  { title: '第二课：如何评估一个IP的商业价值', duration: '52分钟', videoUrl: '#' },
  { title: '第三课：授权合同核心条款拆解与谈判技巧', duration: '63分钟', videoUrl: '#' },
  { title: '第四课：从0到1打造IP联名产品', duration: '45分钟', videoUrl: '#' },
  { title: '第五课：潮玩盲盒的产品设计与定价策略', duration: '55分钟', videoUrl: '#' },
  { title: '第六课：商场快闪店的选址、搭建与运营SOP', duration: '58分钟', videoUrl: '#' },
]

export function TalksPageClient() {
  const [active, setActive] = useState<TabKey>('articles')
  const [data, setData] = useState<TalksData | null>(null)

  useEffect(() => {
    const saved = loadTalksData()
    setData(saved ?? {
      articles: LAOJIA_TALKS.map((t) => ({ id: t.id, title: t.title, sourceUrl: t.sourceUrl, publishedAt: t.publishedAt })),
      podcast: PODCAST_ITEMS,
      courses: COURSE_ITEMS,
    })
  }, [])

  if (!data) return <section className="article-section"><p className="empty-state">加载中…</p></section>

  return (
    <>
      <header className="page-header">
        <div className="talks-header-row">
          <h1 className="page-title font-serif">老贾有话说</h1>
          <p className="page-sub">关于 IP、授权与营销的观察与思考</p>
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
        </nav>
      </header>

      <section className="article-section">
        {active === 'articles' && (
          <div className="talks-list">
            {data.articles.length === 0 && <p className="empty-state">暂无文章</p>}
            {data.articles.map((item) => (
              <a className="talk-card talk-card-link" key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer">
                <h2>{item.title}</h2>
              </a>
            ))}
          </div>
        )}

        {active === 'knowledge' && <KnowledgeView />}

        {active === 'practices' && <IndustryPractices />}

        {active === 'podcast' && (
          <div className="talks-list">
            {data.podcast.length === 0 && <p className="empty-state">暂无播客</p>}
            {data.podcast.map((item) => (
              <article className="talk-card" key={item.title}>
                <h2>{item.title}</h2>
                <time className="talk-card-meta" dateTime={item.date}>{item.date}</time>
              </article>
            ))}
          </div>
        )}

        {active === 'courses' && (
          <div className="talks-list">
            {data.courses.length === 0 && <p className="empty-state">暂无课程</p>}
            {data.courses.map((item) => (
              <article className="talk-card" key={item.title}>
                <h2>{item.title}</h2>
                <span className="talk-card-meta">{item.duration}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function KnowledgeView() {
  const allTerms = getAllKnowledgeTerms()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<KnowledgeTerm | null>(null)

  const filtered = useMemo(() => {
    return search ? searchKnowledgeTerms(search) : allTerms
  }, [search, allTerms])

  const categories = useMemo(() => {
    const cats = new Map<string, KnowledgeTerm[]>()
    for (const t of filtered) {
      const list = cats.get(t.category) ?? []
      list.push(t)
      cats.set(t.category, list)
    }
    return [...cats.entries()]
  }, [filtered])

  const totalCount = filtered.length

  const relatedTerms = useMemo(() => {
    if (!selected) return []
    return allTerms.filter((t) => t.category === selected.category && t.id !== selected.id).slice(0, 5)
  }, [selected, allTerms])

  if (allTerms.length === 0) return <p className="empty-state">暂无知识词条</p>

  return (
    <div className={`knowledge-view${selected ? ' has-detail' : ''}`}>
      {selected && (
        <>
          <div className="knowledge-detail-overlay" onClick={() => setSelected(null)} />
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
        </>
      )}

      <div className="knowledge-main">
        <div className="knowledge-search-wrap">
          <div className="knowledge-search-box">
            <svg className="knowledge-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="knowledge-search-input"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
              placeholder="搜索 IP 行业术语…"
            />
          </div>
          <span className="knowledge-search-count">{search ? `${totalCount} 个结果` : `${totalCount} 个词条`}</span>
        </div>
        {categories.length === 0 && <p className="empty-state">未找到匹配词条，试试其他关键词</p>}
        <div className="knowledge-grid">
          {categories.map(([cat, items]) => (
            <div className="knowledge-group-card" key={cat}>
              <h3 className="knowledge-group-name">{cat}<span className="knowledge-group-badge">{items.length}</span></h3>
              <div className="knowledge-pills">
                {items.map((t) => (
                  <button
                    key={t.id}
                    className={`knowledge-pill${selected?.id === t.id ? ' active' : ''}`}
                    onClick={() => setSelected(selected?.id === t.id ? null : t)}
                  >
                    {t.term}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
