// lib/daily-report.ts — 日报 / 周报 / 月报数据查询 + LLM 摘要生成
//
// 三个周期共用一套生成逻辑（A4）：周期差异只体现在
//   1) 时间窗（getPeriodRange）
//   2) 增量洞察的条数（Top N 事件 / 活跃 IP / 授权线索，见 lib/period-insights.ts）
//   3) 给 LLM 的周期提示（日报写当日，周报月报写整体判断）

import { getSupabase } from './supabase'
import { callLlmJson } from './llm'
import { getPrompt, promptVersion } from './prompts'
import { getPeriodInsights } from './period-insights'
import { normalizeInsights, type ActiveIp, type HotEventBrief, type LicensingLead, type PeriodInsights } from './period-utils'
export { normalizeInsights } from './period-utils'

const PUBLIC_CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道',
  '影视综艺', '游戏/体育', 'AI/新技术', '展会活动',
  '文旅及商品', '艺术/亚文化', '政策规则', '版权保护',
]

type ArticleLink = {
  id: string
  title_cn: string
  url: string
  category: string
}

export type CategoryGroup = {
  category: string
  count: number
  articles: ArticleLink[]
}

export type DailyReport = {
  period: 'daily' | 'weekly' | 'monthly'
  periodDate: string
  periodLabel: string
  summary: string | null
  highlights: string | null
  categoryCounts: Record<string, number>
  categoryGroups: CategoryGroup[]
  totalCount: number
  /** A4：周期洞察。日报也会带 Top5 事件与精简快照，周报月报更全。 */
  insights?: PeriodInsights
}

export type PeriodLabel = '日报' | '周报' | '月报'

export type PeriodDate = {
  value: string        // ISO date key (YYYY-MM-DD of period start)
  label: string        // display text: "8月6日" / "8月3日-8月9日" / "2026年8月"
  sublabel?: string    // day of week or other secondary info
}

export const PERIOD_CONFIG: Record<'daily' | 'weekly' | 'monthly', { label: PeriodLabel; summaryTitle: string }> = {
  daily: { label: '日报', summaryTitle: '今日资讯汇总' },
  weekly: { label: '周报', summaryTitle: '本周资讯汇总' },
  monthly: { label: '月报', summaryTitle: '本月资讯汇总' },
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function toPeriodDate(period: 'daily' | 'weekly' | 'monthly', d: Date): string {
  const date = new Date(d)
  if (period === 'daily') return date.toISOString().slice(0, 10)
  if (period === 'weekly') {
    const day = date.getDay()
    const diff = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diff)
    return date.toISOString().slice(0, 10)
  }
  date.setDate(1)
  return date.toISOString().slice(0, 10)
}

function getPeriodRange(period: 'daily' | 'weekly' | 'monthly', dateStr: string) {
  const start = new Date(dateStr + 'T00:00:00')
  const end = new Date(dateStr + 'T00:00:00')
  if (period === 'daily') {
    end.setHours(23, 59, 59, 999)
  } else if (period === 'weekly') {
    end.setDate(end.getDate() + 6)
    end.setHours(23, 59, 59, 999)
  } else {
    end.setMonth(end.getMonth() + 1)
    end.setDate(0)
    end.setHours(23, 59, 59, 999)
  }
  return { start, end }
}

function weekOfMonth(d: Date): number {
  return Math.ceil(d.getDate() / 7)
}

function formatPeriodLabel(period: 'daily' | 'weekly' | 'monthly', dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (period === 'daily') return `${y}年${m}月${d.getDate()}日`
  if (period === 'weekly') return `${y}年${m}月 - 第${weekOfMonth(d)}周`
  return `${y}年${m}月`
}

function formatDateLabel(period: 'daily' | 'weekly' | 'monthly', dateStr: string): { label: string; sublabel?: string } {
  const d = new Date(dateStr + 'T00:00:00')
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (period === 'daily') return { label: `${m}月${d.getDate()}日`, sublabel: `${y}年` }
  if (period === 'weekly') return { label: `${m}月 - 第${weekOfMonth(d)}周`, sublabel: `${y}年` }
  return { label: `${m}月`, sublabel: `${y}年` }
}

function buildCategoryGroups(articles: ArticleLink[]): CategoryGroup[] {
  const map: Record<string, ArticleLink[]> = {}
  for (const a of articles) {
    const cat = a.category || '其他'
    if (!map[cat]) map[cat] = []
    map[cat].push(a)
  }
  return PUBLIC_CATEGORIES
    .filter(c => map[c] && map[c].length > 0)
    .map(c => ({ category: c, count: map[c].length, articles: map[c] }))
}

// ─── LLM ─────────────────────────────────────────────────────

/**
 * 周期报告导语生成。
 * 走 lib/llm.ts 的 callLlmJson：与文章评分共用「回执复用 → 预算熔断 → 记账 → 结算」四步，
 * 同一份报告重复生成不再重复花钱（改提示词除外——版本进了 input_hash）。
 * 提示词正文在 prompts/period-report.md。
 */
async function callDailyLLM(prompt: string, period: 'daily' | 'weekly' | 'monthly'): Promise<{ summary: string; highlights: string } | null> {
  const periodKind = period === 'daily' ? '日报' : period === 'weekly' ? '周报' : '月报'
  const outcome = await callLlmJson(
    'summarize',
    getPrompt('period-report').text,
    `${prompt}\n\n（本次产出的是${periodKind}，写作时请体现「${periodKind}」的整体判断而非单日流水。）`,
    'period-report',
  )
  if (!outcome.ok) {
    console.warn(`[DailyReport LLM] 调用失败: ${outcome.error}`)
    return null
  }
  return {
    summary: String(outcome.parsed.summary ?? ''),
    highlights: String(outcome.parsed.highlights ?? ''),
  }
}

function buildDailyPrompt(
  period: 'daily' | 'weekly' | 'monthly',
  categoryGroups: CategoryGroup[],
  dateLabel: string,
  insights?: PeriodInsights,
): string {
  const lines: string[] = []
  const periodName = period === 'daily' ? '日报' : period === 'weekly' ? '周报' : '月报'

  // A4：把聚合好的统计与热点事件直接喂给模型，避免它从标题列表里自己数数（数不准还费 token）
  if (insights) {
    const { snapshot, hotEvents, activeIps, licensingLeads } = insights
    lines.push(`【本期数据快照】`)
    lines.push(
      `收录 ${snapshot.articleCount} 条，来自 ${snapshot.sourceCount} 个信源，入选 ${snapshot.selectedCount} 条` +
      (snapshot.avgScore != null ? `，平均分 ${snapshot.avgScore}` : '') +
      (snapshot.categoryTop ? `，最热分类「${snapshot.categoryTop.category}」${snapshot.categoryTop.count} 条` : ''),
    )
    lines.push('')

    if (hotEvents.length > 0) {
      lines.push(`【本期热点事件（按独立信源数与信源分级加权排序）】`)
      for (const [i, ev] of hotEvents.entries()) {
        lines.push(
          `${i + 1}. ${ev.title}（${ev.sourceCount} 家信源报道 / ${ev.reportCount} 篇${ev.topTier === 'T1' ? ' / 含官方一手' : ''}）` +
          (ev.summary ? `\n   ${ev.summary}` : ''),
        )
      }
      lines.push('')
    }

    if (activeIps.length > 0) {
      lines.push(`【本期活跃 IP】${activeIps.map((x) => `${x.name}(${x.articleCount})`).join('、')}`)
      lines.push('')
    }

    if (licensingLeads.length > 0) {
      lines.push(`【本期授权/版权相关高分条目】`)
      for (const lead of licensingLeads) {
        lines.push(`- ${lead.title}（${lead.source}${lead.score != null ? ` / ${lead.score}分` : ''}）`)
      }
      lines.push('')
    }
  }

  lines.push(`以下是${dateLabel}IP行业资讯的分类汇总：`)
  lines.push('')
  for (const g of categoryGroups) {
    lines.push(`【${g.category}】（${g.count}条）`)
    for (const a of g.articles) lines.push(`  - ${a.title_cn}`)
    lines.push('')
  }
  lines.push(`请基于以上资讯，撰写${dateLabel}IP行业动态分析。`)
  if (period !== 'daily') {
    lines.push(`这是${periodName}，请在导语里体现「本期整体趋势判断」，而不是逐条复述。`)
  }
  return lines.join('\n')
}

// ─── 主入口 ──────────────────────────────────────────────────

/** 获取指定周期的可用日期列表（最新在前）—— 用 SQL DISTINCT，不走 JS 去重 */
export async function getAvailableDates(period: 'daily' | 'weekly' | 'monthly'): Promise<PeriodDate[]> {
  const db = getSupabase()

  // 按天去重取 published_at，数据库层完成，不拉5000行
  const trunc = period === 'monthly'
    ? "DATE_TRUNC('month', published_at)"
    : period === 'weekly'
      ? "DATE_TRUNC('week', published_at)"
      : "DATE(published_at)"

  const { rows } = await db.query(
    `SELECT DISTINCT ${trunc} AS d FROM articles
     WHERE published_at IS NOT NULL
       AND category IS NOT NULL
       AND category NOT IN ('待分类', '待人工复核', '已过滤')
     ORDER BY d DESC
     LIMIT 200`
  )

  if (rows.length === 0) return []

  const result: PeriodDate[] = []
  for (const row of rows) {
    const d = new Date(row.d as string)
    // 周报需要调整为周一（DATE_TRUNC('week') 返回周一）
    const key = period === 'monthly'
      ? d.toISOString().slice(0, 7) + '-01'
      : d.toISOString().slice(0, 10)
    const dl = formatDateLabel(period, key)
    result.push({ value: key, label: dl.label, sublabel: dl.sublabel })
  }
  return result
}

/** 获取指定周期+日期的日报数据。opts.skipLLM 跳过 LLM 摘要生成（页面秒开用），后台 backfill 再补生成。 */
export async function getDailyReport(
  period: 'daily' | 'weekly' | 'monthly',
  targetDate: string,
  opts?: { skipLLM?: boolean },
): Promise<DailyReport> {
  const { start, end } = getPeriodRange(period, targetDate)
  const periodLabel = formatPeriodLabel(period, targetDate)
  const db = getSupabase()

  // 1. 查缓存
  let cached: any = null
  try {
    const result = await db.from('daily_reports')
      .select('*').eq('period', period).eq('period_date', targetDate).maybeSingle()
    cached = result.data
  } catch (e) {
    console.warn('[DailyReport] 缓存读取失败，跳过:', (e as Error).message?.slice(0, 120))
  }

  if (cached && cached.summary) {
    const articleData: ArticleLink[] = safeJsonParse(cached.article_data, [])
    const categoryGroups = buildCategoryGroups(articleData)
    const categoryCounts = cached.category_counts || {}
    const insights = normalizeInsights(cached.insights)
    // 如果缓存没有预渲染HTML，补生成（向前兼容旧缓存）
    if (!cached.content_html) {
      const html = renderReportHtml({
        period, periodLabel, summary: cached.summary, highlights: cached.highlights,
        categoryCounts, categoryGroups, totalCount: cached.total_count || 0, insights,
      })
      try {
        await db.from('daily_reports').update({ content_html: html })
          .eq('period', period).eq('period_date', targetDate)
      } catch { /* 忽略 */ }
    }
    return {
      period, periodDate: targetDate, periodLabel,
      summary: cached.summary, highlights: cached.highlights,
      categoryCounts, categoryGroups, totalCount: cached.total_count || 0,
      insights,
    }
  }

  // 2. 查文章
  const { data: articles } = await db
    .from('articles')
    .select('id, title_cn, url, category')
    .not('title_cn', 'is', null)
    .not('category', 'is', null)
    .neq('category', '待分类')
    .neq('category', '待人工复核')
    .neq('category', '已过滤')
    .gte('published_at', start.toISOString())
    .lte('published_at', end.toISOString())
    .order('published_at', { ascending: false })
    .limit(500)

  if (!articles || articles.length === 0) {
    return {
      period, periodDate: targetDate, periodLabel,
      summary: null, highlights: null,
      categoryCounts: {}, categoryGroups: [], totalCount: 0,
    }
  }

  const categoryGroups = buildCategoryGroups(articles as ArticleLink[])
  const categoryCounts: Record<string, number> = {}
  for (const g of categoryGroups) categoryCounts[g.category] = g.count

  // 3. 周期洞察（A4）：Top 热点事件 / 数据快照 / 活跃 IP / 授权线索
  //    零模型成本，纯 SQL 聚合；失败已在内部逐项兜底
  const insights = await getPeriodInsights(period, start, end)

  // 4. LLM（skipLLM 时跳过，直接返回文章列表，秒开）
  let summary: string | null = null
  let highlights: string | null = null

  if (!opts?.skipLLM) {
    const prompt = buildDailyPrompt(period, categoryGroups, periodLabel, insights)
    const llmResult = await callDailyLLM(prompt, period)
    summary = llmResult?.summary ?? null
    highlights = llmResult?.highlights ?? null
  }

  // 5. 渲染HTML + 写缓存（skipLLM 时不写缓存，留给 backfill 补生成）
  if (!opts?.skipLLM) {
    const contentHtml = summary ? renderReportHtml({
      period, periodLabel, summary, highlights, categoryCounts, categoryGroups,
      totalCount: articles.length, insights,
    }) : null

    try {
      await db.from('daily_reports').upsert({
        period, period_date: targetDate, summary, highlights,
        category_counts: categoryCounts, article_data: JSON.stringify(articles),
        total_count: articles.length, content_html: contentHtml,
        insights: JSON.stringify(insights),
        prompt_version: promptVersion('period-report'),
        created_at: new Date().toISOString(),
      }, { onConflict: 'period, period_date' })
    } catch (e) {
      console.error('[DailyReport] 缓存写入失败:', (e as Error).message)
    }
  }

  return {
    period, periodDate: targetDate, periodLabel, summary, highlights,
    categoryCounts, categoryGroups, totalCount: articles.length, insights,
  }
}

/** 读取预渲染的静态HTML（秒开路径） */
export async function getCachedReportHtml(period: string, dateStr: string): Promise<string | null> {
  const db = getSupabase()
  try {
    const result = await db.from('daily_reports')
      .select('content_html').eq('period', period).eq('period_date', dateStr).maybeSingle()
    return result.data?.content_html || null
  } catch { return null }
}

// ─── HTML 渲染（服务端生成，存DB，前端直接注入） ───────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderReportHtml(report: {
  periodLabel: string
  summary: string | null
  highlights: string | null
  categoryCounts: Record<string, number>
  categoryGroups: CategoryGroup[]
  totalCount: number
  period: 'daily' | 'weekly' | 'monthly'
  insights?: PeriodInsights
}): string {
  const parts: string[] = []
  const period = report.period
  const snapshot = report.insights?.snapshot

  // 0. 数据快照条（A4）：日报一行，周报月报四项
  if (snapshot && snapshot.articleCount > 0) {
    parts.push('<div class="daily-snapshot">')
    const cells: string[] = [
      `<span class="daily-snapshot-item">收录 <strong>${snapshot.articleCount}</strong> 条</span>`,
      `<span class="daily-snapshot-item">信源 <strong>${snapshot.sourceCount}</strong> 个</span>`,
    ]
    if (period !== 'daily') {
      cells.push(`<span class="daily-snapshot-item">入选 <strong>${snapshot.selectedCount}</strong> 条</span>`)
      if (snapshot.avgScore != null) {
        cells.push(`<span class="daily-snapshot-item">平均分 <strong>${snapshot.avgScore}</strong></span>`)
      }
    }
    if (snapshot.categoryTop) {
      cells.push(
        `<span class="daily-snapshot-item">最热分类 <strong>${esc(snapshot.categoryTop.category)}</strong>（${snapshot.categoryTop.count}）</span>`,
      )
    }
    parts.push(cells.join(''))
    parts.push('</div>')
  }

  // 1. 本期看点（置顶）
  if (report.highlights) {
    parts.push('<div class="daily-highlights">')
    parts.push('<h3 class="daily-highlights-title">本期看点</h3>')
    parts.push('<ul class="daily-highlights-list">')
    for (const h of report.highlights.split('\n').filter(Boolean)) {
      parts.push(`<li>${esc(h.replace(/^[•\-\s]+/, ''))}</li>`)
    }
    parts.push('</ul></div>')
  }

  // 2. 分类速览
  parts.push('<div class="daily-stats-bar">')
  parts.push(`<span class="daily-stats-total">共 <strong>${report.totalCount}</strong> 条</span>`)
  parts.push('<span class="daily-stats-divider"></span>')
  parts.push('<span class="daily-stats-tags">')
  for (const g of report.categoryGroups) {
    parts.push(`<span class="daily-stats-tag">${esc(g.category)} <strong>${g.count}</strong></span>`)
  }
  parts.push('</span></div>')

  // 3. 资讯分析
  parts.push('<div class="daily-summary">')
  parts.push(`<h2 class="daily-summary-title">${esc(report.periodLabel)}资讯汇总</h2>`)
  if (report.summary) {
    parts.push('<div class="daily-summary-text">')
    for (const p of report.summary.split('\n').filter(Boolean)) {
      parts.push(`<p>${esc(p)}</p>`)
    }
    parts.push('</div>')
  } else {
    parts.push(`<p class="daily-summary-text text-muted">共收录 ${report.totalCount} 条IP行业资讯，覆盖 ${report.categoryGroups.length} 个分类领域。</p>`)
  }
  parts.push('</div>')

  // 4. 本期热点事件（A4，复用 A1 事件层）
  parts.push(renderHotEvents(report.insights?.hotEvents ?? [], period))

  // 5. 活跃 IP + 授权交易线索（A4，周报月报专属加分项）
  parts.push(renderActiveIps(report.insights?.activeIps ?? [], period))
  parts.push(renderLicensingLeads(report.insights?.licensingLeads ?? [], period))

  // 6. 分类详情
  parts.push('<div class="daily-category-links">')
  for (const g of report.categoryGroups) {
    parts.push('<div class="daily-category-block">')
    parts.push(`<h3 class="daily-category-name">${esc(g.category)}<span class="daily-category-badge">${g.count}</span></h3>`)
    parts.push('<ul class="daily-article-list">')
    for (const a of g.articles) {
      parts.push(`<li><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" class="daily-article-link">${esc(a.title_cn || '(无标题)')}</a></li>`)
    }
    parts.push('</ul></div>')
  }
  parts.push('</div>')

  return parts.join('')
}

/** 本期热点事件：热度按独立信源数 × 信源分级权重，链接到事件详情页 */
function renderHotEvents(events: HotEventBrief[], period: 'daily' | 'weekly' | 'monthly'): string {
  if (events.length === 0) return ''
  const title = period === 'daily' ? '今日热点事件' : '本期热点事件'
  const parts: string[] = ['<div class="daily-hot-events">']
  parts.push(`<h3 class="daily-section-title">${title}<span class="daily-section-badge">${events.length}</span></h3>`)
  parts.push('<ol class="daily-hot-list">')
  for (const [i, ev] of events.entries()) {
    const meta: string[] = [`${ev.sourceCount} 家信源`]
    if (ev.reportCount > 1) meta.push(`${ev.reportCount} 篇报道`)
    if (ev.topTier === 'T1') meta.push('含官方一手')
    if (ev.category) meta.push(ev.category)
    parts.push(
      `<li class="daily-hot-item">` +
      `<a class="daily-hot-link" href="/hot/${esc(ev.id)}">${esc(ev.title)}</a>` +
      `<span class="daily-hot-meta">${esc(meta.join(' · '))}</span>` +
      (ev.summary ? `<p class="daily-hot-summary">${esc(ev.summary)}</p>` : '') +
      `</li>`,
    )
    void i
  }
  parts.push('</ol>')
  if (events.length >= 10) {
    parts.push('<p class="daily-section-more"><a href="/hot">查看完整热点榜 →</a></p>')
  }
  parts.push('</div>')
  return parts.join('')
}

/** 活跃 IP Top N：给从业者直接可用的「本期谁在动」清单 */
function renderActiveIps(ips: ActiveIp[], period: 'daily' | 'weekly' | 'monthly'): string {
  if (ips.length === 0) return ''
  const parts: string[] = ['<div class="daily-active-ips">']
  parts.push(
    `<h3 class="daily-section-title">本期活跃 IP<span class="daily-section-badge">${ips.length}</span></h3>`,
  )
  parts.push('<div class="daily-ip-grid">')
  for (const ip of ips) {
    const via = ip.via === 'ip_library' ? '品牌库命中' : '事件主体'
    parts.push(
      `<a class="daily-ip-chip" href="/ipbrand?query=${encodeURIComponent(ip.name)}">` +
      `<span class="daily-ip-name">${esc(ip.name)}</span>` +
      `<span class="daily-ip-count">${ip.articleCount} 条</span>` +
      `<span class="daily-ip-via">${via}</span>` +
      `</a>`,
    )
  }
  parts.push('</div></div>')
  return parts.join('')
}

/** 授权交易线索：周报月报直接当公众号/社群素材 */
function renderLicensingLeads(leads: LicensingLead[], period: 'daily' | 'weekly' | 'monthly'): string {
  if (leads.length === 0) return ''
  const parts: string[] = ['<div class="daily-licensing-leads">']
  parts.push(
    `<h3 class="daily-section-title">本期授权交易与版权动态<span class="daily-section-badge">${leads.length}</span></h3>`,
  )
  parts.push('<ul class="daily-lead-list">')
  for (const lead of leads) {
    parts.push(
      `<li><a href="${esc(lead.url)}" target="_blank" rel="noopener noreferrer" class="daily-lead-link">${esc(lead.title)}</a>` +
      `<span class="daily-lead-meta">${esc(lead.source)}${lead.score != null ? ` · ${lead.score}分` : ''}</span></li>`,
    )
  }
  parts.push('</ul></div>')
  return parts.join('')
}

function safeJsonParse(raw: unknown, fallback: any): any {
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return fallback } }
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw
  return fallback
}
