import type { DatabaseClient } from './supabase'

export const DEFAULT_SELECTION_THRESHOLD = 6
export const MIN_SELECTION_THRESHOLD = 4
export const MAX_SELECTION_THRESHOLD = 10
export const SELECTION_THRESHOLD_KEY = 'article_selection_threshold'

/** B1 分级门槛：按信源分级使用不同入选线（方案文档 B1，0-100 的 55/62/72 校准后折算为 5.5/6.5/7） */
export const SELECTION_THRESHOLD_TIER_KEYS = {
  T1: 'article_selection_threshold_t1',
  T1_5: 'article_selection_threshold_t1_5',
  T2: 'article_selection_threshold_t2',
} as const

export type TierThresholds = { t1: number; t1_5: number; t2: number }

export function normalizeSelectionThreshold(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_SELECTION_THRESHOLD || parsed > MAX_SELECTION_THRESHOLD) {
    throw new Error(`筛选分数必须是 ${MIN_SELECTION_THRESHOLD}-${MAX_SELECTION_THRESHOLD} 的整数`)
  }
  return parsed
}

/** 分级门槛允许 0.5 步长（两次打分均值的粒度就是 0.5），缺失/非法时回落全局门槛 */
function normalizeTierThreshold(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < MIN_SELECTION_THRESHOLD || parsed > MAX_SELECTION_THRESHOLD) {
    return fallback
  }
  return Math.round(parsed * 2) / 2
}

export async function getSelectionThreshold(db: DatabaseClient): Promise<number> {
  const { data, error } = await db
    .from('app_settings')
    .select('value')
    .eq('key', SELECTION_THRESHOLD_KEY)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return normalizeSelectionThreshold(data?.value ?? DEFAULT_SELECTION_THRESHOLD)
}

/** 读取三级信源分级门槛；未配置的键回落全局门槛 */
export async function getTierThresholds(db: DatabaseClient): Promise<TierThresholds> {
  const fallback = await getSelectionThreshold(db)
  const { data, error } = await db
    .from('app_settings')
    .select('key,value')
    .in('key', Object.values(SELECTION_THRESHOLD_TIER_KEYS))
  if (error) throw new Error(error.message)
  const byKey = new Map((data ?? []).map((row: { key: string; value: unknown }) => [row.key, row.value]))
  return {
    t1: normalizeTierThreshold(byKey.get(SELECTION_THRESHOLD_TIER_KEYS.T1), fallback),
    t1_5: normalizeTierThreshold(byKey.get(SELECTION_THRESHOLD_TIER_KEYS.T1_5), fallback),
    t2: normalizeTierThreshold(byKey.get(SELECTION_THRESHOLD_TIER_KEYS.T2), fallback),
  }
}

/** info_sources 的 (name → tier) 映射，供打分路由按文章 source 查分级 */
export async function loadSourceTierMap(
  db: DatabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await db.from('info_sources').select('name,tier')
  if (error) throw new Error(error.message)
  const map = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ name: string | null; tier: string | null }>) {
    if (row.name && row.tier) map.set(row.name, row.tier)
  }
  return map
}

/** 单篇文章的入选门槛：按信源分级取，未知分级/官号特判路径回落全局门槛 */
export function resolveThresholdForSource(
  tier: string | null | undefined,
  thresholds: TierThresholds,
  fallback: number,
): number {
  switch (tier) {
    case 'T1':
      return thresholds.t1
    case 'T1_5':
      return thresholds.t1_5
    case 'T2':
      return thresholds.t2
    default:
      return fallback
  }
}

export function isScoreSelected(score: number, threshold: number): boolean {
  return score >= threshold
}

type InitialLlmQueueQuery<T> = {
  is(column: string, value: unknown): T
}

export function onlyArticlesAwaitingInitialLlm<T>(query: InitialLlmQueueQuery<T>): T {
  // title_cn is written by the first LLM pass and is never cleared by a threshold change.
  // Keeping this filter centralized prevents historical articles from being reprocessed.
  return query.is('title_cn', null)
}
