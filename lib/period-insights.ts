// lib/period-insights.ts — 周报/月报增量洞察的数据库查询（A4）
//
// 类型与纯函数在 lib/period-utils.ts（可独立单测），这里只负责 SQL 聚合。
//
// 日报只需要「分类汇总 + 一段导语」，周报/月报还要回答三个问题：
//   1. 本期最值得看的是哪几件事？   → Top 10 热点事件（复用 A1 事件层与热度）
//   2. 本期数据长什么样？           → 数据快照（收录 N 条 / M 个源 / 入选率 / 分类冠军）
//   3. 对 IP 从业者具体有什么用？   → 活跃 IP Top 10、新增授权交易线索
//
// 全部走 SQL 聚合，零模型成本；只在生成报告时跑一次，结果落 daily_reports 缓存。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServiceClient } from './supabase'
import {
  EMPTY_SNAPSHOT,
  type ActiveIp,
  type HotEventBrief,
  type LicensingLead,
  type PeriodInsights,
  type PeriodKind,
  type PeriodSnapshot,
} from './period-utils'

export { previousPeriodStart, isPeriodKind, isValidDateKey } from './period-utils'
export type {
  ActiveIp,
  HotEventBrief,
  LicensingLead,
  PeriodInsights,
  PeriodKind,
  PeriodSnapshot,
} from './period-utils'


/** 本期入选文章里热度最高的事件（热度取 A1 的 heat_score，时间窗落在本期内） */
async function topEventsInPeriod(start: Date, end: Date, limit: number): Promise<HotEventBrief[]> {
  const { rows } = await createServiceClient().query<{
    id: string
    title_cn: string | null
    canonical_title: string
    summary_cn: string | null
    category: string | null
    source_count: number
    report_count: number
    heat: number
    top_tier: string | null
  }>(
    `select e.id, e.title_cn, e.canonical_title, e.summary_cn, e.category,
            e.source_count, e.report_count, e.heat_score::float8 as heat,
            (select s.tier from ip_event_reports r
               join articles a on a.id = r.article_id
               left join info_sources s on lower(s.name) = lower(coalesce(r.source_name, a.source))
              where r.event_id = e.id
              order by case s.tier when 'T1' then 0 when 'T1.5' then 1 else 2 end
              limit 1) as top_tier
     from ip_events e
     where e.last_seen_at >= $1 and e.last_seen_at <= $2
       and e.report_count >= 1
     order by e.heat_score desc, e.last_seen_at desc
     limit $3`,
    [start.toISOString(), end.toISOString(), limit],
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title_cn ?? r.canonical_title,
    summary: r.summary_cn,
    category: r.category,
    sourceCount: Number(r.source_count ?? 0),
    reportCount: Number(r.report_count ?? 0),
    heat: Number(r.heat ?? 0),
    topTier: r.top_tier,
  }))
}

/** 数据快照：收录量、来源数、分类冠军、平均分 */
async function periodSnapshot(start: Date, end: Date): Promise<PeriodSnapshot> {
  const { rows } = await createServiceClient().query<{
    article_count: number
    selected_count: number
    source_count: number
    avg_score: number | null
  }>(
    `select count(*)::int as article_count,
            count(*) filter (where is_selected)::int as selected_count,
            count(distinct source)::int as source_count,
            round(avg(relevance_score)::numeric, 1)::float8 as avg_score
     from articles
     where published_at >= $1 and published_at <= $2
       and category is not null
       and category not in ('待分类', '待人工复核', '已过滤')`,
    [start.toISOString(), end.toISOString()],
  )
  const r = rows[0]
  const { rows: catRows } = await createServiceClient().query<{ category: string; count: number }>(
    `select category, count(*)::int as count
     from articles
     where published_at >= $1 and published_at <= $2
       and category is not null
       and category not in ('待分类', '待人工复核', '已过滤')
     group by category order by count desc, category asc
     limit 1`,
    [start.toISOString(), end.toISOString()],
  )
  return {
    articleCount: Number(r?.article_count ?? 0),
    selectedCount: Number(r?.selected_count ?? 0),
    sourceCount: Number(r?.source_count ?? 0),
    avgScore: r?.avg_score == null ? null : Number(r.avg_score),
    categoryTop: catRows[0] ? { category: catRows[0].category, count: Number(catRows[0].count) } : null,
  }
}

// ─── 活跃 IP ──────────────────────────────────────────────────

type IpNameIndex = { names: string[]; map: Map<string, string> }

let ipIndexCache: IpNameIndex | null = null

/**
 * 读 IP 品牌库建立「别名 → 规范名」索引。
 * 品牌库是 2014 条静态 JSON（public/ipbrand/ips.json），随 release 部署。
 * 只取长度 >= 2 的名称，避免单字命中噪声。
 */
function loadIpNameIndex(): IpNameIndex {
  if (ipIndexCache) return ipIndexCache
  const names: string[] = []
  const map = new Map<string, string>()
  try {
    const path = join(process.cwd(), 'public', 'ipbrand', 'ips.json')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Array<{ name_cn?: string; name_en?: string }>
    for (const rec of raw) {
      const canonical = (rec.name_cn ?? rec.name_en ?? '').trim()
      if (!canonical) continue
      names.push(canonical)
      for (const alias of [rec.name_cn, rec.name_en]) {
        const key = (alias ?? '').trim()
        if (key.length >= 2 && !map.has(key)) map.set(key, canonical)
      }
    }
  } catch (e) {
    console.warn('[period-insights] IP 品牌库读取失败，活跃 IP 退化为仅事件主体:', e instanceof Error ? e.message : e)
  }
  names.sort((a, b) => b.length - a.length)
  ipIndexCache = { names, map }
  return ipIndexCache
}

/** 仅供测试 */
export function resetIpIndexCache(): void {
  ipIndexCache = null
}

/**
 * 活跃 IP Top N：两路合并
 *  1) 事件主体实体（ip_events.primary_entity）—— 已聚簇事件的天然主体
 *  2) IP 品牌库名称在标题中的字面命中 —— 覆盖还没聚簇的零散文章
 * 取并集按文章数排序，避免「只有聚簇才有热度、没聚簇就统计不到」的偏差。
 */
async function activeIps(start: Date, end: Date, limit: number): Promise<ActiveIp[]> {
  const supabase = createServiceClient()

  // 1) 事件主体
  const { rows: entityRows } = await supabase.query<{ entity: string; articles: number }>(
    `select e.primary_entity as entity, count(*)::int as articles
     from ip_events e
     where e.primary_entity is not null
       and e.last_seen_at >= $1 and e.last_seen_at <= $2
     group by e.primary_entity`,
    [start.toISOString(), end.toISOString()],
  )

  // 2) 品牌库字面命中（在 SQL 里用 ILIKE 逐名匹配，名字数量大时先按本期标题粗筛）
  const { names, map } = loadIpNameIndex()
  const { rows: titleRows } = await supabase.query<{ title: string; title_cn: string | null }>(
    `select title, title_cn from articles
     where published_at >= $1 and published_at <= $2
       and category is not null and category not in ('待分类', '待人工复核', '已过滤')
     limit 800`,
    [start.toISOString(), end.toISOString()],
  )

  const libHits = new Map<string, number>()
  for (const row of titleRows) {
    const text = `${row.title_cn ?? ''} ${row.title ?? ''}`
    if (!text.trim()) continue
    for (const name of names) {
      if (text.includes(name)) {
        const canonical = map.get(name) ?? name
        libHits.set(canonical, (libHits.get(canonical) ?? 0) + 1)
        break // 一篇只记一次，取最长匹配名
      }
    }
  }

  const merged = new Map<string, ActiveIp>()
  for (const r of entityRows) {
    if (!r.entity) continue
    const canonical = map.get(r.entity) ?? r.entity
    const existing = merged.get(canonical)
    const count = Number(r.articles ?? 0)
    if (existing) {
      existing.articleCount += count
      existing.eventCount += 1
    } else {
      merged.set(canonical, { name: canonical, articleCount: count, eventCount: 1, via: 'event_entity' })
    }
  }
  for (const [name, count] of libHits) {
    const existing = merged.get(name)
    if (existing) {
      // 两路都命中：取较大值（不是相加，同一篇会被两路各数一次）
      existing.articleCount = Math.max(existing.articleCount, count)
      existing.via = 'ip_library'
    } else {
      merged.set(name, { name, articleCount: count, eventCount: 0, via: 'ip_library' })
    }
  }

  return Array.from(merged.values())
    .filter((x) => x.articleCount > 0)
    .sort((a, b) => b.articleCount - a.articleCount || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/** 新增授权交易线索：授权/联名/版权类的高分文章（给公众号与社群直接当素材） */
async function licensingLeads(start: Date, end: Date, limit: number): Promise<LicensingLead[]> {
  const { rows } = await createServiceClient().query<LicensingLead>(
    `select title_cn as title, url, source, relevance_score as score,
            published_at::text as "publishedAt"
     from articles
     where published_at >= $1 and published_at <= $2
       and relevance_score is not null
       and relevance_score >= coalesce(selection_threshold, 6)
       and (
         category in ('IP/品牌/授权', '版权保护')
         or title_cn ~ '(授权|联名|签约|合作|版权|维权|诉讼|判决|授权交易)'
         or title ~ '(licens|collaborat|partner|sue|copyright)'
       )
     order by relevance_score desc, published_at desc
     limit $3`,
    [start.toISOString(), end.toISOString(), limit],
  )
  return rows
}

/** 一次性取全本期洞察。任一子查询失败不影响其它部分（缺哪块就少哪块）。 */
export async function getPeriodInsights(
  period: PeriodKind,
  start: Date,
  end: Date,
  opts?: { topN?: number; ipN?: number; leadN?: number },
): Promise<PeriodInsights> {
  const topN = opts?.topN ?? (period === 'daily' ? 5 : 10)
  const ipN = opts?.ipN ?? (period === 'monthly' ? 10 : 5)
  const leadN = opts?.leadN ?? (period === 'daily' ? 0 : period === 'weekly' ? 8 : 15)

  const [hotEvents, snapshot, ips, leads] = await Promise.all([
    topEventsInPeriod(start, end, topN).catch((e) => {
      console.warn('[period-insights] 热点事件查询失败:', e instanceof Error ? e.message : e)
      return []
    }),
    periodSnapshot(start, end).catch((e) => {
      console.warn('[period-insights] 数据快照失败:', e instanceof Error ? e.message : e)
      return EMPTY_SNAPSHOT
    }),
    activeIps(start, end, ipN).catch((e) => {
      console.warn('[period-insights] 活跃 IP 统计失败:', e instanceof Error ? e.message : e)
      return []
    }),
    leadN > 0
      ? licensingLeads(start, end, leadN).catch((e) => {
          console.warn('[period-insights] 授权交易线索失败:', e instanceof Error ? e.message : e)
          return []
        })
      : Promise.resolve([]),
  ])

  return { hotEvents, snapshot, activeIps: ips, licensingLeads: leads }
}
