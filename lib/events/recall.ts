// lib/events/recall.ts — 聚簇第 1 步：候选召回（零模型成本）
// 加载近 72h 入选文章，按标题特征重叠 >=2 召回候选，每篇最多 20 条。

import { createServiceClient } from '@/lib/supabase'
import { extractFeatures } from './tokenize'

export type ClusterArticle = {
  id: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  source: string
  published_at: string | null
  created_at: string | null
}

/** 入选标准：评分过门槛（与首页展示口径一致） */
const RECALL_SQL = `
  select a.id, a.title, a.title_cn, a.summary_cn, a.source, a.published_at, a.created_at
  from articles a
  where a.created_at > now() - interval '72 hours'
    and a.relevance_score is not null
    and a.relevance_score >= coalesce(a.selection_threshold, 6)
  order by a.created_at desc
  limit 400
`

export const MAX_CANDIDATES = 20
export const MIN_OVERLAP = 2

export type RecallResult = {
  /** 待聚簇文章（入选、72h 内、尚无事件归属） */
  targets: ClusterArticle[]
  /** 已入库的近 72h 文章（含已聚簇，作为候选池） */
  pool: ClusterArticle[]
  features: Map<string, Set<string>>
}

export async function loadRecallWindow(): Promise<RecallResult> {
  const supabase = createServiceClient()
  const { rows } = await supabase.query<ClusterArticle>(RECALL_SQL)
  const pool: ClusterArticle[] = rows

  // 人工锁定（manual=true）的文章：既不当目标也不被动挪动
  const { rows: manualLocked } = await supabase.query<{ article_id: string }>(
    `select distinct article_id from ip_event_reports where manual = true`,
  )
  const locked = new Set(manualLocked.map((r) => r.article_id))

  // 已有任何事件归属的文章不作为聚簇目标（它们已经归过队了）
  const { rows: clustered } = await supabase.query<{ article_id: string }>(
    `select distinct article_id from ip_event_reports`,
  )
  const hasEvent = new Set(clustered.map((r) => r.article_id))

  const features = new Map<string, Set<string>>()
  for (const a of pool) {
    features.set(a.id, extractFeatures(a.title_cn ?? a.title))
  }

  const targets = pool.filter((a) => !hasEvent.has(a.id) && !locked.has(a.id))
  return { targets, pool, features }
}

/** 为目标文章按特征重叠召回候选（排除自身，按时间新→旧，上限 20） */
export function recallCandidates(
  target: ClusterArticle,
  pool: ClusterArticle[],
  features: Map<string, Set<string>>,
  max = MAX_CANDIDATES,
): ClusterArticle[] {
  const tf = features.get(target.id)
  if (!tf || tf.size === 0) return []
  const hits: Array<{ a: ClusterArticle; overlap: number }> = []
  for (const a of pool) {
    if (a.id === target.id) continue
    const af = features.get(a.id)
    if (!af) continue
    let shared = 0
    for (const f of tf) if (af.has(f)) shared++
    if (shared >= MIN_OVERLAP) hits.push({ a, overlap: shared })
  }
  hits.sort((x, y) => y.overlap - x.overlap)
  return hits.slice(0, max).map((h) => h.a)
}
