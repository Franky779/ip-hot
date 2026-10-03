// lib/events/group.ts — 聚簇第 3 步：落库、事件合并、人工修正保护
// 铁律：manual=true 的归属永不自动覆盖；含人工锁定报道的事件不参与自动合并。

import { createServiceClient } from '@/lib/supabase'
import { callLlmJson } from '@/lib/llm'
import { getPrompt } from '@/lib/prompts'
import { extractPrimaryEntity } from './tokenize'
import { judgeRelation } from './relate'
import { recallCandidates, loadRecallWindow, type ClusterArticle } from './recall'

export type TierMap = Map<string, string> // source name(lower) -> tier

export async function loadTierMap(): Promise<TierMap> {
  const { rows } = await createServiceClient().query<{ name: string; tier: string | null }>(
    `select name, tier from info_sources`,
  )
  return new Map(rows.map((r) => [r.name.toLocaleLowerCase(), r.tier ?? 'T2']))
}

export function tierWeight(tier: string | null | undefined): number {
  if (tier === 'T1') return 1.5
  if (tier === 'T1.5') return 1.2
  return 1.0
}

type EventRow = {
  id: string
  canonical_title: string
  report_count: number
  source_count: number
}

async function getEventOfArticle(articleId: string): Promise<{ event_id: string; manual: boolean } | null> {
  const { rows } = await createServiceClient().query<{ event_id: string; manual: boolean }>(
    `select event_id, manual from ip_event_reports where article_id = $1 limit 1`,
    [articleId],
  )
  return rows[0] ?? null
}

async function eventHasManualReport(eventId: string): Promise<boolean> {
  const { rows } = await createServiceClient().query<{ locked: boolean }>(
    `select exists(select 1 from ip_event_reports where event_id = $1 and manual = true) as locked`,
    [eventId],
  )
  return rows[0]?.locked === true
}

/** 新建事件并把文章作为种子报道写入 */
async function createEventWith(article: ClusterArticle, tier: string | null): Promise<string> {
  const supabase = createServiceClient()
  const displayTitle = (article.title_cn ?? article.title).trim()
  const { rows } = await supabase.query<{ id: string }>(
    `insert into ip_events (canonical_title, title_cn, primary_entity, first_seen_at, last_seen_at)
     values ($1, $2, $3,
             coalesce((select min(coalesce(published_at, created_at)) from articles where id = $4::uuid), now()),
             coalesce((select max(coalesce(published_at, created_at)) from articles where id = $4::uuid), now()))
     returning id`,
    [displayTitle, article.title_cn, extractPrimaryEntity(article.title), article.id],
  )
  const eventId = rows[0].id
  await supabase.query(
    `insert into ip_event_reports (event_id, article_id, source_name, is_first_party, relation, confidence)
     values ($1, $2, $3, $4, 'SEED', 1) on conflict do nothing`,
    [eventId, article.id, article.source, tier === 'T1'],
  )
  return eventId
}

/** 把文章作为报道加入已有事件 */
async function addReportToEvent(
  eventId: string,
  article: ClusterArticle,
  relation: 'SAME_OCCURRENCE' | 'SAME_STORY',
  confidence: number,
  tier: string | null,
): Promise<void> {
  await createServiceClient().query(
    `insert into ip_event_reports (event_id, article_id, source_name, is_first_party, relation, confidence)
     values ($1, $2, $3, $4, $5, $6) on conflict (event_id, article_id) do nothing`,
    [eventId, article.id, article.source, tier === 'T1', relation, confidence],
  )
}

/**
 * 合并事件：报道少的并入报道多的（同数取更老的）。
 * 含 manual=true 报道的事件不参与自动合并——人工分好的不动。
 * 返回存活事件 id；无可合并时返回 null。
 */
async function mergeEventsIfSafe(eventIds: string[]): Promise<string | null> {
  const unique = Array.from(new Set(eventIds))
  if (unique.length <= 1) return unique[0] ?? null
  const supabase = createServiceClient()
  const { rows } = await supabase.query<EventRow & { manual_count: number }>(
    `select e.id, e.canonical_title, e.report_count, e.source_count,
            (select count(*) from ip_event_reports r where r.event_id = e.id and r.manual) as manual_count
     from ip_events e where e.id = any($1::uuid[])`,
    [unique],
  )
  if (rows.some((r) => Number(r.manual_count) > 0)) return null // 有人工锁定：放弃自动合并

  const sorted = rows.sort((a, b) =>
    (Number(b.report_count) - Number(a.report_count)) || (a.id < b.id ? -1 : 1))
  const survivor = sorted[0]
  const absorbed = sorted.slice(1).map((r) => r.id)

  await supabase.query(
    `update ip_event_reports set event_id = $1 where event_id = any($2::uuid[])`,
    [survivor.id, absorbed],
  )
  await supabase.query(`delete from ip_events where id = any($1::uuid[])`, [absorbed])
  return survivor.id
}

/** 刷新事件计数与首报时间（source_count / report_count / first_party / 时间窗） */
export async function refreshEventCounters(eventId: string): Promise<void> {
  await createServiceClient().query(
    `update ip_events e set
       report_count = agg.report_count,
       source_count = agg.source_count,
       first_party_article_id = agg.first_party,
       first_seen_at = agg.first_seen,
       last_seen_at = agg.last_seen,
       updated_at = now()
     from (
       select count(*) as report_count,
              count(distinct r.source_name) as source_count,
              (array_remove(array_agg(r.article_id order by (not r.is_first_party), coalesce(a.published_at, r.created_at)), null))[1] as first_party,
              min(coalesce(a.published_at, r.created_at)) as first_seen,
              max(coalesce(a.published_at, r.created_at)) as last_seen
       from ip_event_reports r
       left join articles a on a.id = r.article_id
       where r.event_id = $1
     ) agg
     where e.id = $1`,
    [eventId],
  )
}

/** 事件综述：来源数 >=2 才生成；每轮每事件最多一次 */
async function maybeGenerateSummary(eventId: string, force = false): Promise<boolean> {
  const supabase = createServiceClient()
  const { rows } = await supabase.query<{
    title_cn: string | null
    summary_cn: string | null
    source_count: number
    report_count: number
    summary_stale: boolean
  }>(
    `select e.title_cn, e.summary_cn, e.source_count, e.report_count,
            (e.summary_cn is null or e.updated_at < (select max(coalesce(a.published_at, r.created_at)) from ip_event_reports r join articles a on a.id = r.article_id where r.event_id = e.id)) as summary_stale
     from ip_events e where e.id = $1`,
    [eventId],
  )
  const ev = rows[0]
  if (!ev || Number(ev.source_count) < 2) return false
  if (!force && ev.summary_cn && !ev.summary_stale) return false

  const { rows: reports } = await supabase.query<{ title: string; title_cn: string | null; summary_cn: string | null; source: string }>(
    `select a.title, a.title_cn, a.summary_cn, r.source_name as source
     from ip_event_reports r join articles a on a.id = r.article_id
     where r.event_id = $1 order by coalesce(a.published_at, r.created_at) asc limit 12`,
    [eventId],
  )
  if (reports.length === 0) return false

  const lines = reports.map((r, i) =>
    `${i + 1}. [${r.source}] ${r.title_cn ?? r.title}${r.summary_cn ? ` — ${r.summary_cn}` : ''}`)
  const outcome = await callLlmJson(
    'summarize',
    getPrompt('event-summary').text,
    `事件标题：${ev.title_cn ?? ''}\n\n报道列表：\n${lines.join('\n')}\n\n返回格式：{"summary_cn":"..."} `,
    'event-summary',
  )
  if (!outcome.ok) {
    console.warn(`[events/group] 综述生成失败: ${outcome.error}`)
    return false
  }
  const summary = String(outcome.parsed.summary_cn ?? '').trim()
  if (!summary) return false
  await supabase.query(
    `update ip_events set summary_cn = $2, updated_at = now() where id = $1`,
    [eventId, summary.slice(0, 200)],
  )
  return true
}

export type ClusterStats = {
  targetsConsidered: number
  pairsJudged: number
  joined: number
  created: number
  merged: number
  failed: number
}

/**
 * 聚簇一轮：目标 = 入选、72h 内、尚无事件归属的文章。
 * 每轮最多 maxTargets 篇，每篇最多 maxPairs 个 pair（成本闸：日上限由 relate 预算兜底）。
 */
export async function clusterRound(opts?: {
  maxTargets?: number
  maxPairs?: number
}): Promise<ClusterStats> {
  const maxTargets = opts?.maxTargets ?? 20
  const maxPairs = opts?.maxPairs ?? 8
  const stats: ClusterStats = { targetsConsidered: 0, pairsJudged: 0, joined: 0, created: 0, merged: 0, failed: 0 }

  const { targets, pool, features } = await loadRecallWindow()
  if (targets.length === 0) return stats

  const tiers = await loadTierMap()
  const touchedEvents = new Set<string>()

  for (const target of targets.slice(0, maxTargets)) {
    stats.targetsConsidered++
    const candidates = recallCandidates(target, pool, features).slice(0, maxPairs)
    try {
      const hits: Array<{ candidate: ClusterArticle; relation: 'SAME_OCCURRENCE' | 'SAME_STORY'; confidence: number }> = []

      for (const candidate of candidates) {
        const judged = await judgeRelation(target, candidate)
        stats.pairsJudged++
        if (judged && (judged.relation === 'SAME_OCCURRENCE' || judged.relation === 'SAME_STORY')) {
          hits.push({ candidate, relation: judged.relation, confidence: judged.confidence })
        }
      }

      if (hits.length === 0) {
        const eventId = await createEventWith(target, tiers.get(target.source.toLocaleLowerCase()) ?? null)
        touchedEvents.add(eventId)
        stats.created++
        continue
      }

      // 命中按置信度排序，取最强的归属
      hits.sort((a, b) => b.confidence - a.confidence)
      const hitEventIds: string[] = []
      for (const hit of hits) {
        const ev = await getEventOfArticle(hit.candidate.id)
        if (ev) hitEventIds.push(ev.event_id)
      }

      let targetEventId: string | null = null
      if (hitEventIds.length > 0) {
        // 多个命中事件 → 尝试合并（含人工锁定报道的事件会放弃合并）
        const merged = await mergeEventsIfSafe(hitEventIds)
        if (merged) {
          targetEventId = merged
          stats.merged += hitEventIds.length - 1
        } else {
          // 放弃合并时，只加入置信度最高且无人工锁定的那个事件
          for (const hit of hits) {
            const ev = await getEventOfArticle(hit.candidate.id)
            if (ev && !(await eventHasManualReport(ev.event_id))) {
              targetEventId = ev.event_id
              break
            }
          }
        }
      }

      if (!targetEventId) {
        // 命中的候选也都没有事件：新建事件把两者装进去
        const first = hits[0]
        const eventId = await createEventWith(first.candidate, tiers.get(first.candidate.source.toLocaleLowerCase()) ?? null)
        await addReportToEvent(eventId, target, first.relation, first.confidence, tiers.get(target.source.toLocaleLowerCase()) ?? null)
        touchedEvents.add(eventId)
        stats.created++
        continue
      }

      const tier = tiers.get(target.source.toLocaleLowerCase()) ?? null
      await addReportToEvent(targetEventId, target, hits[0].relation, hits[0].confidence, tier)
      touchedEvents.add(targetEventId)
      stats.joined++
    } catch (e) {
      stats.failed++
      console.error(`[events/group] 聚簇失败（article ${target.id}）:`, e instanceof Error ? e.message : e)
    }
  }

  for (const eventId of touchedEvents) {
    await refreshEventCounters(eventId)
    await maybeGenerateSummary(eventId)
  }
  return stats
}
