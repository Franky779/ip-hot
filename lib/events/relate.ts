// lib/events/relate.ts — 聚簇第 2 步：pairwise 关系判断（模型，purpose=relate）
// 四选一：SAME_OCCURRENCE / SAME_STORY / UNRELATED / ROUNDUP。
// 置信度 < 0.75 一律按 UNRELATED 处理（保守：宁可不聚，不可聚错）。

import { callLlmJson } from '@/lib/llm'

export type Relation = 'SAME_OCCURRENCE' | 'SAME_STORY' | 'UNRELATED' | 'ROUNDUP'

export const CONFIDENCE_FLOOR = 0.75

const SYSTEM_PROMPT = `你是资讯聚簇判断器。判断两条行业资讯是否属于同一件事。

四选一：
- SAME_OCCURRENCE：同一次发生（官方原文 + 媒体转载 / 同一发布的多家报道）
- SAME_STORY：同一事件的直接进展链（发布 → 上架 → 开售 → 评测 → 回应 → 补充信息），时间上前后衔接
- UNRELATED：不同的事。注意：主体相同不等于同一件事（同一个 IP 的两次不同联名是两件事）
- ROUNDUP：其中一条是多话题汇总（周报/盘点/合集），不能代表单一事件

判定要点：
1. 看核心事件（谁、做了什么），不看行业大类
2. 时间跨度超过 30 天的进展不算 SAME_STORY
3. 拿不准就 UNRELATED

严格按 JSON 返回，不要任何其他文字：
{"relation":"SAME_OCCURRENCE","confidence":0.9,"reason":"一句话依据"}`

export type JudgeResult = {
  relation: Relation
  confidence: number
  reason: string
}

export async function judgeRelation(a: {
  title_cn: string | null
  title: string
  summary_cn: string | null
  source: string
  published_at: string | null
}, b: {
  title_cn: string | null
  title: string
  summary_cn: string | null
  source: string
  published_at: string | null
}): Promise<JudgeResult | null> {
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

  const outcome = await callLlmJson('relate', SYSTEM_PROMPT, userPrompt)
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
