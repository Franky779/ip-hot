export const PENDING_CATEGORY = '待分类'
export const REVIEW_CATEGORY = '待人工复核'
export const FILTERED_CATEGORY = '已过滤'

export type PendingClassificationOutcome = 'classified' | 'reviewed' | 'filtered'

export function getPendingClassificationOutcome(result: {
  category: string
  relevance_score: number
}): PendingClassificationOutcome {
  if (result.category === PENDING_CATEGORY || (result.relevance_score >= 4 && result.relevance_score <= 5)) {
    return 'reviewed'
  }
  if (result.relevance_score <= 3) return 'filtered'
  return 'classified'
}

export function resolveClassificationResult(result: {
  category: string
  relevance_score: number
  is_selected: boolean
}): { category: string; is_selected: boolean } {
  const outcome = getPendingClassificationOutcome(result)
  if (outcome === 'reviewed') return { category: REVIEW_CATEGORY, is_selected: false }
  if (outcome === 'filtered') return { category: FILTERED_CATEGORY, is_selected: false }
  return { category: result.category, is_selected: result.is_selected }
}
