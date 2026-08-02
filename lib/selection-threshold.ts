import type { DatabaseClient } from './supabase'

export const DEFAULT_SELECTION_THRESHOLD = 6
export const MIN_SELECTION_THRESHOLD = 4
export const MAX_SELECTION_THRESHOLD = 10
export const SELECTION_THRESHOLD_KEY = 'article_selection_threshold'

export function normalizeSelectionThreshold(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_SELECTION_THRESHOLD || parsed > MAX_SELECTION_THRESHOLD) {
    throw new Error(`筛选分数必须是 ${MIN_SELECTION_THRESHOLD}-${MAX_SELECTION_THRESHOLD} 的整数`)
  }
  return parsed
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
