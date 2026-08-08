// lib/daily-report.ts — IP日报数据查询 + LLM摘要生成

import { getSupabase } from './supabase'

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

type LlmProvider = {
  name: string; baseUrl: string; apiKey: string; model: string; attempts: number
}

const LLM_PROVIDERS: LlmProvider[] = [
  { name: 'DeepSeek', baseUrl: process.env.LLM_BASE_URL || '', apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || 'deepseek-v4-flash', attempts: 3 },
  { name: 'Kimi', baseUrl: process.env.LLM_BACKUP_URL || '', apiKey: process.env.LLM_BACKUP_KEY || '', model: process.env.LLM_BACKUP_MODEL || 'kimi-k2.6', attempts: 2 },
  { name: 'Kimi Coding', baseUrl: process.env.LLM_BACKUP2_URL || '', apiKey: process.env.LLM_BACKUP2_KEY || '', model: process.env.LLM_BACKUP2_MODEL || 'kimi-for-coding', attempts: 2 },
]

async function callDailyLLM(prompt: string): Promise<{ summary: string; highlights: string } | null> {
  const providers = LLM_PROVIDERS.filter(p => p.baseUrl && p.apiKey && p.model)
  if (!providers.length) return null

  const systemPrompt = `你是一位资深IP行业分析师，负责撰写每日/每周/每月的IP行业资讯汇总。你的写作风格：犀利、有洞察、口语化，像一位懂行的朋友在聊天。避免套话、官腔、AI味。

请严格按以下JSON格式返回，不要添加任何其他文字：
{"summary":"2-3段分析文字(每段不超过200字)，总结该周期IP行业动态趋势、值得关注的变化、以及背后的行业信号","highlights":"2-3条本期最值得关注的资讯要点，每条以"• "开头，每条不超过60字，用换行分隔"}`

  for (const provider of providers) {
    for (let i = 0; i < provider.attempts; i++) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 90_000)
        const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
        let res: Response
        try {
          res = await fetch(endpoint, {
            signal: controller.signal, method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
            body: JSON.stringify({
              model: provider.model,
              messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
              temperature: 0.5, max_tokens: 2000,
            }),
          })
        } finally { clearTimeout(timeout) }

        if (!res.ok) { const text = await res.text(); throw new Error(`API ${res.status}: ${text.slice(0, 200)}`) }
        const data = await res.json()
        const raw: string = data.choices?.[0]?.message?.content ?? ''
        if (!raw) throw new Error('Empty response')
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error(`No JSON in: ${raw.slice(0, 120)}`)
        const parsed = JSON.parse(jsonMatch[0])
        return { summary: String(parsed.summary || ''), highlights: String(parsed.highlights || '') }
      } catch (e) {
        console.warn(`[DailyReport LLM] ${provider.name} 第${i + 1}次失败:`, (e as Error).message?.slice(0, 160))
      }
      if (i < provider.attempts - 1) await new Promise(r => setTimeout(r, 2000))
    }
  }
  return null
}

function buildDailyPrompt(period: 'daily' | 'weekly' | 'monthly', categoryGroups: CategoryGroup[], dateLabel: string): string {
  const lines: string[] = []
  lines.push(`以下是${dateLabel}IP行业资讯的分类汇总：`)
  lines.push('')
  for (const g of categoryGroups) {
    lines.push(`【${g.category}】（${g.count}条）`)
    for (const a of g.articles) lines.push(`  - ${a.title_cn}`)
    lines.push('')
  }
  lines.push(`请基于以上资讯，撰写${dateLabel}IP行业动态分析。`)
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
       AND category NOT IN ('待分类', '待人工复核')
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
    // 如果缓存没有预渲染HTML，补生成（向前兼容旧缓存）
    if (!cached.content_html) {
      const html = renderReportHtml({
        periodLabel, summary: cached.summary, highlights: cached.highlights,
        categoryCounts, categoryGroups, totalCount: cached.total_count || 0,
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

  // 3. LLM（skipLLM 时跳过，直接返回文章列表，秒开）
  let summary: string | null = null
  let highlights: string | null = null

  if (!opts?.skipLLM) {
    const prompt = buildDailyPrompt(period, categoryGroups, periodLabel)
    const llmResult = await callDailyLLM(prompt)
    summary = llmResult?.summary ?? null
    highlights = llmResult?.highlights ?? null
  }

  // 4. 渲染HTML + 写缓存（skipLLM 时不写缓存，留给 backfill 补生成）
  if (!opts?.skipLLM) {
    const contentHtml = summary ? renderReportHtml({
      periodLabel, summary, highlights, categoryCounts, categoryGroups, totalCount: articles.length,
    }) : null

    try {
      await db.from('daily_reports').upsert({
        period, period_date: targetDate, summary, highlights,
        category_counts: categoryCounts, article_data: JSON.stringify(articles),
        total_count: articles.length, content_html: contentHtml,
        created_at: new Date().toISOString(),
      }, { onConflict: 'period, period_date' })
    } catch (e) {
      console.error('[DailyReport] 缓存写入失败:', (e as Error).message)
    }
  }

  return { period, periodDate: targetDate, periodLabel, summary, highlights, categoryCounts, categoryGroups, totalCount: articles.length }
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
}): string {
  const parts: string[] = []

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

  // 4. 分类详情
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

function safeJsonParse(raw: unknown, fallback: any): any {
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return fallback } }
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) return raw
  return fallback
}
