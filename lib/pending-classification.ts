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
