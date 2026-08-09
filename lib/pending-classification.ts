import type { DatabaseClient } from '@/lib/supabase'

export const PENDING_CATEGORY = '待分类'
export const REVIEW_CATEGORY = '待人工复核'
export const FILTERED_CATEGORY = '已过滤'

export type PendingClassificationOutcome = 'classified' | 'reviewed' | 'filtered'

export function getPendingClassificationOutcome(result: {
  category: string
  relevance_score: number
}, selectionThreshold = 6): PendingClassificationOutcome {
  // 低分优先：≤3 分一律自动过滤，不进入人工复核
  if (result.relevance_score <= 3) return 'filtered'
  if (result.category === PENDING_CATEGORY || (result.relevance_score >= 4 && result.relevance_score < selectionThreshold)) {
    return 'reviewed'
  }
  return 'classified'
}

export function resolveClassificationResult(result: {
  category: string
  relevance_score: number
  is_selected: boolean
}, selectionThreshold = 6): { category: string; is_selected: boolean } {
  const outcome = getPendingClassificationOutcome(result, selectionThreshold)
  if (outcome === 'reviewed') return { category: REVIEW_CATEGORY, is_selected: false }
  if (outcome === 'filtered') return { category: FILTERED_CATEGORY, is_selected: false }
  return { category: result.category, is_selected: result.is_selected }
}

/** 自动清理评分≤4的非官号待复核资讯，返回清理条数 */
export async function autoCleanupLowScore(supabase: DatabaseClient): Promise<number> {
  const { rowCount } = await supabase.query(
    `UPDATE articles SET category = $1, is_selected = false WHERE category = $2 AND relevance_score <= 4 AND source NOT ILIKE '官号%'`,
    [FILTERED_CATEGORY, REVIEW_CATEGORY]
  )
  return rowCount
}
