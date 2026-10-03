// lib/events/hot.ts — A2 热度计算与衰减 + 孤儿清理
// heat = Σ 独立信源(48h 内) tier_weight × 0.5^(age_hours/24)
// 每 15 分钟由 group-events cron 刷新一次，热榜直接读 heat_score。

import { createServiceClient } from '@/lib/supabase'

/** 刷新所有事件的热度与计数；清理孤儿报道与空事件 */
export async function refreshHeat(): Promise<{ events: number; orphansDeleted: number }> {
  const supabase = createServiceClient()

  // 1) 清孤儿：文章已删的报道行；报道清空的事件一并删掉
  const { rows: orphanRows } = await supabase.query<{ cnt: string }>(
    `with deleted as (
       delete from ip_event_reports r
       where not exists (select 1 from articles a where a.id = r.article_id)
       returning 1
     ) select count(*) as cnt from deleted`,
  )
  await supabase.query(
    `delete from ip_events e where not exists (select 1 from ip_event_reports r where r.event_id = e.id)`,
  )

  // 2) 计数刷新（全量事件）
  await supabase.query(
    `update ip_events e set
       report_count = agg.report_count,
       source_count = agg.source_count,
       first_party_article_id = agg.first_party,
       first_seen_at = agg.first_seen,
       last_seen_at = agg.last_seen
     from (
       select r.event_id,
              count(*) as report_count,
              count(distinct r.source_name) as source_count,
              (array_agg(r.article_id order by (not r.is_first_party), coalesce(a.published_at, r.created_at)))[1] as first_party,
              min(coalesce(a.published_at, r.created_at)) as first_seen,
              max(coalesce(a.published_at, r.created_at)) as last_seen
       from ip_event_reports r
       left join articles a on a.id = r.article_id
       group by r.event_id
     ) agg
     where e.id = agg.event_id`,
  )

  // 3) 热度：独立信源（48h 窗口、每源按首次出现时间衰减）× 分级权重
  //    heat_prev 每 6 小时快照一次，用于「上升」标记
  await supabase.query(
    `with recent as (
       select r.event_id, r.source_name,
              min(coalesce(a.published_at, r.created_at)) as first_seen
       from ip_event_reports r
       join articles a on a.id = r.article_id
       where coalesce(a.published_at, r.created_at) > now() - interval '48 hours'
       group by r.event_id, r.source_name
     ),
     weighted as (
       select rec.event_id,
              sum(case s.tier when 'T1' then 1.5 when 'T1.5' then 1.2 else 1.0 end
                  * power(0.5, extract(epoch from (now() - rec.first_seen)) / 86400.0)) as heat
       from recent rec
       left join info_sources s on lower(s.name) = lower(rec.source_name)
       group by rec.event_id
     )
     update ip_events e set
       heat_score = round(coalesce(w.heat, 0)::numeric, 4),
       heat_prev = case
         when e.heat_prev_at is null or e.heat_prev_at < now() - interval '6 hours'
         then e.heat_score else e.heat_prev end,
       heat_prev_at = case
         when e.heat_prev_at is null or e.heat_prev_at < now() - interval '6 hours'
         then now() else e.heat_prev_at end,
       updated_at = now()
     from weighted w
     where e.id = w.event_id`,
  )
  // 没有近 48h 报道的事件热度归零
  await supabase.query(
    `update ip_events e set heat_score = 0
     where not exists (
       select 1 from ip_event_reports r join articles a on a.id = r.article_id
       where r.event_id = e.id and coalesce(a.published_at, r.created_at) > now() - interval '48 hours'
     ) and e.heat_score <> 0`,
  )

  const { rows: countRows } = await supabase.query<{ cnt: string }>(
    `select count(*) as cnt from ip_events where heat_score > 0`,
  )
  return {
    events: Number(countRows[0]?.cnt ?? 0),
    orphansDeleted: Number(orphanRows[0]?.cnt ?? 0),
  }
}

export type HotEvent = {
  id: string
  canonical_title: string
  title_cn: string | null
  summary_cn: string | null
  category: string | null
  source_count: number
  report_count: number
  heat_score: number
  heat_prev: number
  first_seen_at: string | null
  last_seen_at: string | null
}

/** 是否「上升」：比 6 小时前涨 30% 以上 */
export function isRising(ev: Pick<HotEvent, 'heat_score' | 'heat_prev'>): boolean {
  const prev = Number(ev.heat_prev)
  const now = Number(ev.heat_score)
  if (prev <= 0) return false
  return (now - prev) / prev > 0.3
}

/** 是否「新」：首次出现不到 6 小时 */
export function isNew(ev: Pick<HotEvent, 'first_seen_at'>): boolean {
  if (!ev.first_seen_at) return false
  return Date.now() - new Date(ev.first_seen_at).getTime() < 6 * 3600 * 1000
}

export async function topEvents(limit = 20): Promise<HotEvent[]> {
  const { rows } = await createServiceClient().query<HotEvent>(
    `select id, canonical_title, title_cn, summary_cn, category,
            source_count, report_count,
            heat_score::float8 as heat_score, heat_prev::float8 as heat_prev,
            first_seen_at, last_seen_at
     from ip_events
     where heat_score > 0
     order by heat_score desc, last_seen_at desc
     limit $1`,
    [limit],
  )
  return rows
}

/** 单个事件 + 按分级/一手排序的报道列表（事件详情页用） */
export async function eventWithReports(eventId: string) {
  const supabase = createServiceClient()
  const { rows: events } = await supabase.query<HotEvent>(
    `select id, canonical_title, title_cn, summary_cn, category,
            source_count, report_count,
            heat_score::float8 as heat_score, heat_prev::float8 as heat_prev,
            first_seen_at, last_seen_at
     from ip_events where id = $1`,
    [eventId],
  )
  if (!events[0]) return null
  const { rows: reports } = await supabase.query<{
    article_id: string
    title: string
    title_cn: string | null
    summary_cn: string | null
    url: string
    source: string
    source_name: string | null
    tier: string | null
    is_first_party: boolean
    manual: boolean
    relation: string | null
    published_at: string | null
    created_at: string | null
  }>(
    `select r.article_id, a.title, a.title_cn, a.summary_cn, a.url,
            a.source, r.source_name, s.tier, r.is_first_party, r.manual, r.relation,
            a.published_at, r.created_at
     from ip_event_reports r
     join articles a on a.id = r.article_id
     left join info_sources s on lower(s.name) = lower(coalesce(r.source_name, a.source))
     where r.event_id = $1
     order by (not r.is_first_party), case s.tier when 'T1' then 0 when 'T1.5' then 1 else 2 end,
              coalesce(a.published_at, r.created_at) desc`,
    [eventId],
  )
  return { event: events[0], reports }
}
