import Link from 'next/link'
import { getAvailableDates, getDailyReport, getCachedReportHtml, type PeriodDate } from '@/lib/daily-report'

export const revalidate = 120

type ValidPeriod = 'daily' | 'weekly' | 'monthly'

function validPeriod(value: string | undefined): ValidPeriod {
  if (value === 'weekly' || value === 'monthly') return value
  return 'daily'
}

const PERIODS: { value: ValidPeriod; label: string }[] = [
  { value: 'daily', label: '日报' },
  { value: 'weekly', label: '周报' },
  { value: 'monthly', label: '月报' },
]

// ─── 演示数据 ─────────────────────────────────────────────────
const DEMO: Record<ValidPeriod, { dates: PeriodDate[]; report: any }> = {
  daily: {
    dates: [
      { value: '2026-08-06', label: '8月6日', sublabel: '2026年' },
      { value: '2026-08-05', label: '8月5日', sublabel: '2026年' },
      { value: '2026-08-04', label: '8月4日', sublabel: '2026年' },
      { value: '2026-08-03', label: '8月3日', sublabel: '2026年' },
      { value: '2026-08-02', label: '8月2日', sublabel: '2026年' },
      { value: '2026-08-01', label: '8月1日', sublabel: '2026年' },
      { value: '2026-07-31', label: '7月31日', sublabel: '2026年' },
    ],
    report: {
      period: 'daily', periodDate: '2026-08-06', periodLabel: '2026年8月6日',
      summary: `今日IP行业动态集中在潮玩新品发布和IP联名两条线上。泡泡玛特与三丽鸥的联名系列正式官宣，社交媒体热度迅速攀升，粉丝对"美乐蒂×MOLLY"的期待值拉满。与此同时，52TOYS 的"猛兽匣"系列新品发布也在核心玩家群引发讨论，设计语言从机械风转向生物质感，是个值得关注的信号。\n\n授权板块今天动静不大，但名创优品在财报电话会上特别提到"IP联名产品贡献了Q2 18%的营收增长"，这个数字比上季度又提了3个百分点。渠道端的IP化趋势已经不是新闻，但数据一直在强化这个判断。\n\n文创文旅方面，故宫与泡泡玛特联合推出的"宫廷瑞兽"系列今天上线预售，半小时内首批库存售罄。这不是泡泡玛特第一次做文化IP联名，但这次的设计语言明显更成熟——不再是简单贴图，而是把文物元素融入了潮玩的设计语法里。`,
      highlights: '• 泡泡玛特×三丽鸥联名官宣，社交媒体热度飙升\n• 名创优品Q2 IP联名产品营收占比达18%，连续三季度增长\n• 故宫"宫廷瑞兽"系列半小时售罄，文化IP×潮玩模式跑通',
      categoryCounts: { '潮玩谷子': 8, 'IP/品牌/授权': 6, '零售/渠道': 4, '创作/上新': 3, '文旅及商品': 3, '展会活动': 2, '游戏/体育': 1, '影视综艺': 1 },
      categoryGroups: [
        { category: '潮玩谷子', count: 8, articles: [
          { id: '1', title_cn: '泡泡玛特×三丽鸥联名系列正式官宣，首弹12款设计曝光', url: '#', category: '潮玩谷子' },
          { id: '2', title_cn: '52TOYS"猛兽匣"新品发布会：从机械风到生物质感的设计转型', url: '#', category: '潮玩谷子' },
          { id: '3', title_cn: '寻找独角兽发布Q2财报，营收同比增长42%，海外市场成新增长点', url: '#', category: '潮玩谷子' },
          { id: '4', title_cn: 'TOP TOY全国门店突破200家，下沉市场开店速度加快', url: '#', category: '潮玩谷子' },
          { id: '5', title_cn: '千岛App发布2026上半年潮玩交易数据报告：盲盒二级市场降温', url: '#', category: '潮玩谷子' },
          { id: '6', title_cn: '卡游"奥特曼"卡牌系列累计销量突破10亿张，创国内卡牌新纪录', url: '#', category: '潮玩谷子' },
          { id: '7', title_cn: '布鲁可积木×《流浪地球3》联名系列发布，预售首日破千万', url: '#', category: '潮玩谷子' },
          { id: '8', title_cn: 'TNT SPACE海外首店落地东京涩谷，中国潮玩品牌加速出海', url: '#', category: '潮玩谷子' },
        ]},
        { category: 'IP/品牌/授权', count: 6, articles: [
          { id: '9', title_cn: '三丽鸥2026年中国市场授权战略：从商品授权到体验授权升级', url: '#', category: 'IP/品牌/授权' },
          { id: '10', title_cn: '迪士尼中国与蜜雪冰城联名合作曝光，或推出限定IP饮品系列', url: '#', category: 'IP/品牌/授权' },
          { id: '11', title_cn: '腾讯动漫IP开放平台上线，中小品牌可一键申请IP授权合作', url: '#', category: 'IP/品牌/授权' },
          { id: '12', title_cn: '原仓数据发布《2026 Q2中国IP授权行业监测报告》', url: '#', category: 'IP/品牌/授权' },
          { id: '13', title_cn: 'LINE FRIENDS与九木杂物社达成独家合作，首批联名文具9月上架', url: '#', category: 'IP/品牌/授权' },
          { id: '14', title_cn: '日本动漫IP加速进入中国市场，《鬼灭之刃》授权项目达27个', url: '#', category: 'IP/品牌/授权' },
        ]},
        { category: '零售/渠道', count: 4, articles: [
          { id: '15', title_cn: '名创优品Q2财报：IP联名产品营收占比18%，毛利率提升至42%', url: '#', category: '零售/渠道' },
          { id: '16', title_cn: '酷乐潮玩完成C轮融资，估值超50亿，计划2027年港股上市', url: '#', category: '零售/渠道' },
          { id: '17', title_cn: '三福百货×《天官赐福》主题快闪落地全国50家门店', url: '#', category: '零售/渠道' },
          { id: '18', title_cn: '全家便利店推出"动漫IP专区"，首批覆盖江浙沪300家门店', url: '#', category: '零售/渠道' },
        ]},
        { category: '创作/上新', count: 3, articles: [
          { id: '19', title_cn: 'B站国创发布会：《时光代理人3》《雾山五行2》等20部新作公布', url: '#', category: '创作/上新' },
          { id: '20', title_cn: '独立动画人"王卯卯"新作《兔斯基大电影》定档2027年暑期', url: '#', category: '创作/上新' },
          { id: '21', title_cn: '小红书"原创IP扶持计划"启动，头部创作者最高获50万创作基金', url: '#', category: '创作/上新' },
        ]},
        { category: '文旅及商品', count: 3, articles: [
          { id: '22', title_cn: '故宫×泡泡玛特"宫廷瑞兽"系列上线预售，半小时首批售罄', url: '#', category: '文旅及商品' },
          { id: '23', title_cn: '敦煌博物馆数字文创平台上线，首批发行10款数字藏品', url: '#', category: '文旅及商品' },
          { id: '24', title_cn: '上海迪士尼乐园"疯狂动物城"主题区官宣2027年春季开放', url: '#', category: '文旅及商品' },
        ]},
        { category: '展会活动', count: 2, articles: [
          { id: '25', title_cn: 'ChinaJoy 2026今日开幕，潮玩展区面积同比扩大40%', url: '#', category: '展会活动' },
          { id: '26', title_cn: '杭州国际动漫节公布参展名单，日本动画协会首次组团参加', url: '#', category: '展会活动' },
        ]},
        { category: '游戏/体育', count: 1, articles: [
          { id: '27', title_cn: '《原神》×肯德基联动回归，限定周边被黄牛炒至500元', url: '#', category: '游戏/体育' },
        ]},
        { category: '影视综艺', count: 1, articles: [
          { id: '28', title_cn: '《哪吒之魔童闹海》续集官宣定档2027年春节，光线传媒股价大涨', url: '#', category: '影视综艺' },
        ]},
      ],
      totalCount: 28,
    },
  },
  weekly: {
    dates: [
      { value: '2026-08-03', label: '8月 - 第1周', sublabel: '2026年' },
      { value: '2026-07-27', label: '7月 - 第4周', sublabel: '2026年' },
      { value: '2026-07-20', label: '7月 - 第3周', sublabel: '2026年' },
      { value: '2026-07-13', label: '7月 - 第2周', sublabel: '2026年' },
      { value: '2026-07-06', label: '7月 - 第1周', sublabel: '2026年' },
    ],
    report: {
      period: 'weekly', periodDate: '2026-08-03', periodLabel: '2026年8月 - 第1周',
      summary: `本周IP行业最引人注目的变化发生在潮玩出海赛道。TNT SPACE东京涩谷店的开业标志着中国潮玩品牌从"产品出海"迈入"品牌出海"阶段。52TOYS的"猛兽匣"设计转型也在本周引发行业讨论，从机械风转向生物质感，背后是对女性消费者和轻度用户的市场判断。\n\n授权领域本周有两件事值得放在一起看：腾讯动漫IP开放平台上线，做了"一键授权"的标准化流程；原仓数据发布的Q2报告则显示中小品牌的IP授权需求增长了67%。供需两端都在加速，IP授权的"基础设施化"趋势在加速。`,
      highlights: '• TNT SPACE东京涩谷店开业，中国潮玩品牌出海进入2.0阶段\n• 腾讯动漫IP开放平台上线，中小品牌授权门槛大幅降低\n• ChinaJoy 2026本周开幕，潮玩展区面积同比扩大40%',
      categoryCounts: { '潮玩谷子': 45, 'IP/品牌/授权': 32, '零售/渠道': 18, '创作/上新': 15, '展会活动': 12 },
      categoryGroups: [
        { category: '潮玩谷子', count: 45, articles: [
          { id: 'w1', title_cn: '泡泡玛特×三丽鸥联名系列正式官宣，首弹12款设计曝光', url: '#', category: '潮玩谷子' },
          { id: 'w2', title_cn: 'TNT SPACE海外首店落地东京涩谷，开业当天排队超3小时', url: '#', category: '潮玩谷子' },
          { id: 'w3', title_cn: '52TOYS"猛兽匣"新品发布会：设计语言从机械风转向生物质感', url: '#', category: '潮玩谷子' },
          { id: 'w4', title_cn: '千岛App发布2026上半年潮玩交易数据：盲盒二级市场降温明显', url: '#', category: '潮玩谷子' },
          { id: 'w5', title_cn: '卡游"奥特曼"卡牌系列累计销量突破10亿张', url: '#', category: '潮玩谷子' },
        ]},
        { category: 'IP/品牌/授权', count: 32, articles: [
          { id: 'w6', title_cn: '腾讯动漫IP开放平台上线，中小品牌可一键申请IP授权合作', url: '#', category: 'IP/品牌/授权' },
          { id: 'w7', title_cn: '原仓数据发布《2026 Q2中国IP授权行业监测报告》', url: '#', category: 'IP/品牌/授权' },
          { id: 'w8', title_cn: '迪士尼中国与蜜雪冰城联名合作曝光，或推出限定IP饮品系列', url: '#', category: 'IP/品牌/授权' },
        ]},
        { category: '零售/渠道', count: 18, articles: [
          { id: 'w9', title_cn: '名创优品Q2财报：IP联名产品营收占比18%，毛利率提升至42%', url: '#', category: '零售/渠道' },
          { id: 'w10', title_cn: '酷乐潮玩完成C轮融资，估值超50亿，计划2027年港股上市', url: '#', category: '零售/渠道' },
        ]},
        { category: '创作/上新', count: 15, articles: [
          { id: 'w11', title_cn: 'B站国创发布会：《时光代理人3》《雾山五行2》等20部新作公布', url: '#', category: '创作/上新' },
        ]},
        { category: '展会活动', count: 12, articles: [
          { id: 'w12', title_cn: 'ChinaJoy 2026今日开幕，潮玩展区面积同比扩大40%', url: '#', category: '展会活动' },
        ]},
      ],
      totalCount: 142,
    },
  },
  monthly: {
    dates: [
      { value: '2026-08-01', label: '8月', sublabel: '2026年' },
      { value: '2026-07-01', label: '7月', sublabel: '2026年' },
      { value: '2026-06-01', label: '6月', sublabel: '2026年' },
      { value: '2026-05-01', label: '5月', sublabel: '2026年' },
      { value: '2026-04-01', label: '4月', sublabel: '2026年' },
      { value: '2026-03-01', label: '3月', sublabel: '2026年' },
    ],
    report: {
      period: 'monthly', periodDate: '2026-08-01', periodLabel: '2026年8月',
      summary: `8月是潮玩行业的传统旺季。ChinaJoy带来的话题热度、暑期档的消费高峰、以及各品牌为下半年密集筹备的新品发布，让这个月的资讯密度和行业信号浓度都明显高于前几个月。\n\n第一条线索是出海。TNT SPACE东京店不是孤立事件。泡泡玛特海外营收占比已超过25%，52TOYS、寻找独角兽、TOP TOY都在加速海外布局。中国潮玩的竞争力已经从"制造性价比"升级到"IP+设计+渠道"的完整输出。第二条是IP授权的平台化。腾讯动漫开放平台、原仓数据报告、多个中小品牌的授权需求激增——IP授权正在从大品牌的特权变成中小品牌的常规操作。第三条是文化IP×潮玩的模式跑通。故宫×泡泡玛特的"宫廷瑞兽"半小时售罄，证明了文物IP在潮玩品类中的爆发力。`,
      highlights: '• 中国潮玩品牌出海进入2.0阶段，TNT SPACE、泡泡玛特、52TOYS三箭齐发\n• IP授权平台化：腾讯动漫开放平台上线，中小品牌授权需求增长67%\n• 文化IP×潮玩模式验证：故宫联名半小时售罄，敦煌数字藏品紧随其后',
      categoryCounts: { '潮玩谷子': 186, 'IP/品牌/授权': 124, '零售/渠道': 72, '创作/上新': 58, '展会活动': 45, '文旅及商品': 38 },
      categoryGroups: [
        { category: '潮玩谷子', count: 186, articles: [
          { id: 'm1', title_cn: '泡泡玛特×三丽鸥联名系列正式官宣，首弹12款设计曝光', url: '#', category: '潮玩谷子' },
          { id: 'm2', title_cn: 'TNT SPACE海外首店落地东京涩谷，中国潮玩品牌加速出海', url: '#', category: '潮玩谷子' },
          { id: 'm3', title_cn: '52TOYS"猛兽匣"新品发布会：设计语言从机械风转向生物质感', url: '#', category: '潮玩谷子' },
          { id: 'm4', title_cn: '寻找独角兽Q2财报：营收同比增长42%，海外市场成新增长点', url: '#', category: '潮玩谷子' },
          { id: 'm5', title_cn: '千岛App发布2026上半年潮玩交易数据报告', url: '#', category: '潮玩谷子' },
        ]},
        { category: 'IP/品牌/授权', count: 124, articles: [
          { id: 'm6', title_cn: '腾讯动漫IP开放平台上线，中小品牌可一键申请IP授权合作', url: '#', category: 'IP/品牌/授权' },
          { id: 'm7', title_cn: '原仓数据发布《2026 Q2中国IP授权行业监测报告》', url: '#', category: 'IP/品牌/授权' },
          { id: 'm8', title_cn: '迪士尼中国与蜜雪冰城联名合作曝光，或推出限定IP饮品系列', url: '#', category: 'IP/品牌/授权' },
        ]},
        { category: '零售/渠道', count: 72, articles: [
          { id: 'm9', title_cn: '名创优品Q2财报：IP联名产品营收占比18%，毛利率提升至42%', url: '#', category: '零售/渠道' },
          { id: 'm10', title_cn: '酷乐潮玩完成C轮融资，估值超50亿', url: '#', category: '零售/渠道' },
        ]},
        { category: '文旅及商品', count: 38, articles: [
          { id: 'm11', title_cn: '故宫×泡泡玛特"宫廷瑞兽"系列上线预售，半小时首批售罄', url: '#', category: '文旅及商品' },
          { id: 'm12', title_cn: '敦煌博物馆数字文创平台上线，首批发行10款数字藏品', url: '#', category: '文旅及商品' },
        ]},
      ],
      totalCount: 619,
    },
  },
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>
}) {
  const params = await searchParams
  const period = validPeriod(params.period)

  let availableDates: PeriodDate[] = []
  let useDemo = false
  try {
    availableDates = await getAvailableDates(period)
  } catch (e) {
    console.error('[DailyPage] 获取日期列表失败:', (e as Error).message)
  }
  if (availableDates.length === 0) {
    useDemo = true
    availableDates = DEMO[period].dates
  }

  const selectedDate = params.date || (availableDates.length > 0 ? availableDates[0].value : '')
  const hasSelection = !!selectedDate

  // 优先读预渲染的静态HTML（秒开路径）
  let cachedHtml: string | null = null
  let report: any = null
  if (hasSelection) {
    if (useDemo) {
      report = DEMO[period].report
    } else {
      try { cachedHtml = await getCachedReportHtml(period, selectedDate) } catch { /* 忽略 */ }
      if (!cachedHtml) {
        try { report = await getDailyReport(period, selectedDate) } catch (e) {
          console.error('[DailyPage] 加载报告失败:', (e as Error).message)
        }
      }
    }
  }

  return (
    <div className="daily-layout">
      {/* ─── 左侧栏：标题 + tab + 时间列表 + 底端填充 ─── */}
      <aside className="daily-sidebar">
        <div className="daily-sidebar-top">
          <h1 className="daily-sidebar-title">IP日报</h1>
          {useDemo && <span className="daily-demo-badge">演示</span>}
          <div className="daily-tabs" role="tablist" aria-label="日报周期切换">
            {PERIODS.map(p => {
              const href = p.value === 'daily' ? '/daily' : `/daily?period=${p.value}`
              return (
                <Link
                  key={p.value}
                  href={href}
                  className={`daily-tab${period === p.value ? ' active' : ''}`}
                  role="tab"
                  aria-selected={period === p.value}
                >
                  {p.label}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="daily-sidebar-divider" />

        <nav className="daily-date-nav">
          {availableDates.map(d => {
            const href = period === 'daily'
              ? `/daily?date=${d.value}`
              : `/daily?period=${period}&date=${d.value}`
            const isActive = d.value === selectedDate
            return (
              <Link
                key={d.value}
                href={href}
                className={`daily-date-item${isActive ? ' active' : ''}`}
              >
                <span className="daily-date-label">{d.label}</span>
                {d.sublabel && <span className="daily-date-sub">{d.sublabel}</span>}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* ─── 右侧内容区 ─── */}
      <section className="daily-content">
        {!hasSelection ? (
          <p className="empty-state">请从左侧选择一个日期。</p>
        ) : cachedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: cachedHtml }} />
        ) : report && report.totalCount === 0 ? (
          <p className="empty-state">该周期暂无资讯。</p>
        ) : report ? (
          <>
            {/* 1. 本期看点（置顶） */}
            {report.highlights && (
              <div className="daily-highlights">
                <h3 className="daily-highlights-title">本期看点</h3>
                <ul className="daily-highlights-list">
                  {report.highlights.split('\n').filter(Boolean).map((h: string, i: number) => (
                    <li key={i}>{h.replace(/^[•\-\s]+/, '')}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2. 分类速览 */}
            <div className="daily-stats-bar">
              <span className="daily-stats-total">共 <strong>{report.totalCount}</strong> 条</span>
              <span className="daily-stats-divider" />
              <span className="daily-stats-tags">
                {report.categoryGroups.map((g: any) => (
                  <span key={g.category} className="daily-stats-tag">
                    {g.category} <strong>{g.count}</strong>
                  </span>
                ))}
              </span>
            </div>

            {/* 3. 资讯分析 */}
            <div className="daily-summary">
              <h2 className="daily-summary-title">{report.periodLabel}资讯汇总</h2>
              {report.summary ? (
                <div className="daily-summary-text">
                  {report.summary.split('\n').filter(Boolean).map((p: string, i: number) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : (
                <p className="daily-summary-text text-muted">
                  共收录 {report.totalCount} 条IP行业资讯，覆盖 {report.categoryGroups.length} 个分类领域。
                </p>
              )}
            </div>

            {/* 4. 分类详情 */}
            <div className="daily-category-links">
              {report.categoryGroups.map((g: any) => (
                <div key={g.category} className="daily-category-block">
                  <h3 className="daily-category-name">
                    {g.category}
                    <span className="daily-category-badge">{g.count}</span>
                  </h3>
                  <ul className="daily-article-list">
                    {g.articles.map((a: any) => (
                      <li key={a.id}>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="daily-article-link">
                          {a.title_cn || '(无标题)'}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="empty-state">数据加载失败，请稍后重试。</p>
        )}
      </section>
    </div>
  )
}
