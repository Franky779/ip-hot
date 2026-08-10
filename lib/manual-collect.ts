// lib/manual-collect.ts — 随手收功能的共享常量与手动收录分类规则
// 手动收录的文章必须「必收录」：不被低分自动清理、不被待分类重跑队列覆盖

import type { LlmResult } from './llm.ts'
import { PENDING_CATEGORY, REVIEW_CATEGORY } from './pending-classification.ts'

/** info_sources.type 标记：手动收录时登记的公众号来源（机器可判，UI 可读） */
export const COLLECT_SOURCE_TYPE = '公众号（随手收）'

/** 手动收录来源在 info_sources 里的分组（section_id 需满足 ^[a-zA-Z0-9_-]+$） */
export const COLLECT_SECTION = {
  id: 'domestic-wechat-collect',
  title: '公众号 · 随手收',
  region: 'domestic',
} as const

/**
 * 手动收录文章的行级筛选阈值（CHECK 允许范围 4-10 的最小值）。
 * 首页展示谓词为 relevance_score >= selection_threshold：
 * 阈值存 4 = 评分≥4 的手动文章即可上首页；≤3 留库但不上首页。
 */
export const MANUAL_SELECTION_THRESHOLD = 4

export type ManualClassification = {
  category: string
  relevance_score: number
  is_selected: boolean
  selection_threshold: number
}

/**
 * 手动收录的分类后处理：
 * - category 取 LLM 原值；若为「待分类」改写为「待人工复核」
 *   （待分类队列会用空正文重跑 LLM 并覆盖结果，手动文章绝不能落入）
 * - relevance_score 保留 LLM 原值，不人为抬分（不污染数据）
 * - is_selected 恒为 true（=「手动精选」数据标记）
 */
export function resolveManualClassification(result: LlmResult): ManualClassification {
  return {
    category: result.category === PENDING_CATEGORY ? REVIEW_CATEGORY : result.category,
    relevance_score: result.relevance_score,
    is_selected: true,
    selection_threshold: MANUAL_SELECTION_THRESHOLD,
  }
}
