// lib/events/relate.ts — 聚簇第 2 步：pairwise 关系判断（模型，purpose=relate）
// 四选一：SAME_OCCURRENCE / SAME_STORY / UNRELATED / ROUNDUP。
// 置信度 < 0.75 一律按 UNRELATED 处理（保守：宁可不聚，不可聚错）。

import { callLlmJson } from '@/lib/llm'
import { getPrompt } from '@/lib/prompts'

export type Relation = 'SAME_OCCURRENCE' | 'SAME_STORY' | 'UNRELATED' | 'ROUNDUP'

export const CONFIDENCE_FLOOR = 0.75

export type JudgeResult = {
  relation: Relation
  confidence: number
  reason: string
}

export type RelatableArticle = {
  title_cn: string | null
  title: string
  summary_cn: string | null
  source: string
  published_at: string | Date | null
}

export async function judgeRelation(a: RelatableArticle, b: RelatableArticle): Promise<JudgeResult | null> {
  const fmt = (x: typeof a) => {
    const time = x.published_at
      ? (x.published_at instanceof Date
          ? x.published_at.toISOString().slice(0, 10)
          : String(x.published_at).slice(0, 10))
      : null
    return [`标题: ${x.title_cn ?? x.title}`, `信源: ${x.source}`, x.summary_cn ? `摘要: ${x.summary_cn}` : null, time ? `时间: ${time}` : null]
      .filter(Boolean)
      .join('\n')
  }
  const userPrompt = `【资讯 A】\n${fmt(a)}\n\n【资讯 B】\n${fmt(b)}\n\nA 和 B 是同一件事吗？`

  const outcome = await callLlmJson('relate', getPrompt('event-relate').text, userPrompt, 'event-relate')
  if (!outcome.ok) {
    console.warn(`[events/relate] 模型判断失败: ${outcome.error}`)
    return null
  }

  const relation = String(outcome.parsed.relation ?? '')
  if (!['SAME_OCCURRENCE', 'SAME_STORY', 'UNRELATED', 'ROUNDUP'].includes(relation)) {
    return { relation: 'UNRELATED', confidence: 0, reason: 'invalid relation from model' }
  }
  const rawConfidence = Number(outcome.parsed.confidence)
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0

  // 保守门槛：低置信度视为无关（宁可不聚，不可聚错）
  if (confidence < CONFIDENCE_FLOOR) {
    return { relation: 'UNRELATED', confidence, reason: String(outcome.parsed.reason ?? 'below confidence floor') }
  }
  return {
    relation: relation as Relation,
    confidence,
    reason: String(outcome.parsed.reason ?? ''),
  }
}
