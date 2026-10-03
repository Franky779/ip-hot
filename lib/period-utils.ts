// lib/period-utils.ts — 周期计算的纯函数（A4）
//
// 独立成文件的原因：这两个函数不碰数据库，必须能在 node --test 下直接跑。
// 放在 period-insights.ts 里会连带 import supabase，测试环境解析不了。

export type PeriodKind = 'daily' | 'weekly' | 'monthly'

export const PERIOD_KINDS: readonly PeriodKind[] = ['daily', 'weekly', 'monthly'] as const

export function isPeriodKind(value: unknown): value is PeriodKind {
  return typeof value === 'string' && (PERIOD_KINDS as readonly string[]).includes(value)
}

/**
 * 推算「上一周期」的起始日（报告永远生成已结束的周期，不生成进行中的）。
 *   日报：昨天
 *   周报：上一自然周的周一（ISO 周，周一为一周之首）
 *   月报：上一个月的 1 日
 * 返回 undefined 表示计算失败，由调用方报错，而不是悄悄生成一份空报告。
 */
export function previousPeriodStart(period: PeriodKind, now: Date = new Date()): string | undefined {
  const d = new Date(now)
  if (Number.isNaN(d.getTime())) return undefined

  if (period === 'daily') {
    d.setDate(d.getDate() - 1)
  } else if (period === 'weekly') {
    // 先回到本周一（周日视为上一周的周日，退 6 天），再退 7 天 = 上一自然周的周一。
    // 注意不能「先退一天再对齐」：周三那样算会落到本周一，生成一份没跑完的周报。
    const day = d.getDay() // 0=周日
    d.setDate(d.getDate() - ((day === 0 ? 7 : day) - 1))
    d.setDate(d.getDate() - 7)
  } else {
    d.setDate(1) // 本月 1 日
    d.setMonth(d.getMonth() - 1) // 上月 1 日
  }
  return toDateKey(d)
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00`)
  return !Number.isNaN(d.getTime()) && toDateKey(d) === value
}

// ─── 洞察缓存结构（A4：daily_reports.insights 列） ─────────────

export type HotEventBrief = {
  id: string
  title: string
  summary: string | null
  category: string | null
  sourceCount: number
  reportCount: number
  heat: number
  topTier: string | null
}

export type ActiveIp = {
  name: string
  articleCount: number
  eventCount: number
  via: 'ip_library' | 'event_entity'
}

export type LicensingLead = {
  title: string
  url: string
  source: string
  score: number | null
  publishedAt: string | null
}

export type PeriodSnapshot = {
  articleCount: number
  selectedCount: number
  sourceCount: number
  categoryTop: { category: string; count: number } | null
  avgScore: number | null
}

export type PeriodInsights = {
  hotEvents: HotEventBrief[]
  snapshot: PeriodSnapshot
  activeIps: ActiveIp[]
  licensingLeads: LicensingLead[]
}

export const EMPTY_SNAPSHOT: PeriodSnapshot = {
  articleCount: 0,
  selectedCount: 0,
  sourceCount: 0,
  categoryTop: null,
  avgScore: null,
}

/**
 * 从 daily_reports.insights（jsonb 或 text 都可能）还原洞察结构。
 * 旧行没有这一列、或数据损坏时返回 undefined——调用方据此跳过渲染，
 * 而不是渲染出一堆 0 值让读者以为「本期真的什么都没发生」。
 */
export function normalizeInsights(raw: unknown): PeriodInsights | undefined {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined

  const snapshot = (parsed as { snapshot?: PeriodSnapshot }).snapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return undefined

  const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

  return {
    hotEvents: asArray<HotEventBrief>((parsed as { hotEvents?: unknown }).hotEvents),
    snapshot,
    activeIps: asArray<ActiveIp>((parsed as { activeIps?: unknown }).activeIps),
    licensingLeads: asArray<LicensingLead>((parsed as { licensingLeads?: unknown }).licensingLeads),
  }
}
