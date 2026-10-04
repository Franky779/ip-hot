// lib/events/industry-gate.ts — A8 事件行业价值闸门
//
// 为什么需要这道闸门（2026-10-04 线上实测的真实教训）：
//   热榜首版 15 条里没有一条是真正的授权联名，全是影视票房、体育赛事、
//   明星动态、每周推荐。根因不是评分失效，而是**文章层的 relevance_score
//   回答的问题和热榜要回答的问题不是同一个**：
//     文章层问「这篇内容本身合格吗」→ Variety 报道一部新片票房，合格，8 分；
//     热榜要问「一个做授权生意的人看到这条要不要有所行动」→ 没用。
//   Variety / Deadline / Sports Business 是正经行业媒体，文章分普遍不低，
//   所以这道闸门**不能靠信源过滤，只能逐事件判定**。
//
// 设计要点：
//   1. 判定结果落 ip_events.industry_relevant，榜单查询直接过滤，零额外开销。
//   2. 判定为 irrelevant 的事件**不删除**，仍留在事件库与 /hot/[id]，
//      人工修正后（hidden=false）可以立刻回到榜单——直接删掉就没法翻案了。
//   3. 人工隐藏优先级高于模型判定：hidden=true 时无论 industry_relevant 如何都不上榜。
//   4. 边界一律判 irrelevant（提示词里写死了），宁可少不可滥。

import { createServiceClient } from '@/lib/supabase'
import { callLlmJson } from '@/lib/llm'
import { getPrompt } from '@/lib/prompts'
import { prefilterGate, type GateVerdict } from './gate-rules'

export { prefilterGate, normalizeTitle, dedupeByTitle, COLUMN_PATTERN, STRONG_SIGNAL_PATTERN } from './gate-rules'
export type { GateVerdict } from './gate-rules'

/** 单事件判定：先确定性预过滤，再问模型。结果不落库，由调用方决定。 */
export async function judgeEvent(
  title: string,
  summary: string | null,
  reports: string[],
): Promise<GateVerdict> {
  const pre = prefilterGate(title, summary)
  if (pre) return pre

  const prompt = getPrompt('event-industry-gate')
  const reportBlock = reports.length
    ? `\n\n该事件的多家报道标题：\n${reports.slice(0, 6).map((r) => `- ${r}`).join('\n')}`
    : ''

  const outcome = await callLlmJson(
    'industry_gate',
    prompt.text,
    `事件标题：${title}${summary ? `\n事件综述：${summary}` : ''}${reportBlock}\n\n` +
      '这个事件对 IP 授权 / 品牌联名 / 内容版权从业者有决策价值吗？按 JSON 返回。',
    'event-industry-gate',
  )

  if (!outcome.ok) {
    // 判定失败时保守：先按无关处理，等下一轮聚簇重试。
    // 这条事件仍留在库里，只是不上榜——不会丢数据。
    return { relevant: false, reason: '闸门未判定成功，暂不上榜' }
  }

  const relevant = outcome.parsed.relevant === true
  const reason = typeof outcome.parsed.reason === 'string'
    ? outcome.parsed.reason.trim().slice(0, 120)
    : ''
  return { relevant, reason }
}

export type GateRow = {
  id: string
  title_cn: string | null
  canonical_title: string
  summary_cn: string | null
  industry_relevant: boolean | null
}

/** 取待判定的候选事件：热度 > 0 且尚未判定 */
export async function pendingGateEvents(limit = 25): Promise<GateRow[]> {
  const { rows } = await createServiceClient().query<GateRow>(
    `select id, title_cn, canonical_title, summary_cn, industry_relevant
     from ip_events
     where heat_score > 0
       and industry_relevant is null
       and hidden is not true
     order by heat_score desc
     limit $1`,
    [limit],
  )
  return rows
}

/**
 * 批量跑闸门。返回统计供 cron 记录。
 * 单个事件失败不中断整批（失败留在 null，下轮重试）。
 */
export async function runIndustryGate(limit = 25): Promise<{
  checked: number
  relevant: number
  irrelevant: number
  failed: number
}> {
  const supabase = createServiceClient()
  const candidates = await pendingGateEvents(limit)
  let relevant = 0
  let irrelevant = 0
  let failed = 0

  for (const ev of candidates) {
    const title = ev.title_cn ?? ev.canonical_title
    const { rows } = await supabase.query<{ title: string }>(
      `select coalesce(a.title_cn, a.title) as title
       from ip_event_reports r join articles a on a.id = r.article_id
       where r.event_id = $1::uuid
       order by r.is_first_party desc, a.published_at desc nulls last
       limit 6`,
      [ev.id],
    )

    let verdict: GateVerdict
    try {
      verdict = await judgeEvent(title, ev.summary_cn, rows.map((r) => r.title))
    } catch (error) {
      failed += 1
      console.warn(`[industry-gate] 事件 ${ev.id} 判定异常：`, error instanceof Error ? error.message : String(error))
      continue
    }

    await supabase.query(
      `update ip_events
       set industry_relevant = $2, gate_reason = $3, gate_checked_at = now(), updated_at = now()
       where id = $1::uuid`,
      [ev.id, verdict.relevant, verdict.reason],
    )

    if (verdict.relevant) relevant += 1
    else irrelevant += 1
  }

  return { checked: candidates.length, relevant, irrelevant, failed }
}
