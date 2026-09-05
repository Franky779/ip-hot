// lib/content-blocked.ts — LLM 网关内容审核拦截时的"终态入库"逻辑
//
// 背景：被供应商内容安全网关拒绝处理的文章，若不写库会保持 title_cn IS NULL，
//      下一轮 cron 自动重试同一篇死循环。
//
// 终态策略（2026-09-05 阶段 2 拍板）：
//   - title_cn = 原标题（脱队唯一钥匙：lib/selection-threshold.ts 仅判 title_cn IS NULL）
//   - summary_cn = 「【审核拦截】供应商内容安全网关拒绝处理，请人工审阅」标记
//   - category = '待人工复核'（复用现有终态，pending-review 页面与 monitor 队列自动可见）
//   - relevance_score = NULL（避开 pending-classification 自动清理：仅清 ≤4 且非官号；NULL 不命中）
//   - is_selected = false
//
// 概念区分：
//   - safety_blocked（模型自标）：走 source-trust.ts 的 delete 分支，不进本路径
//   - content_blocked（网关拦截）：本路径
//
// 调用方：
//   - app/api/cron/process-llm/route.ts
//   - app/api/cron/fetch-and-process/route.ts
//   - app/api/admin/process-llm/route.ts

import type { DatabaseClient } from '@/lib/supabase'

/** 终态标记文字（同时写入 summary_cn 与日志，便于人工辨识） */
export const CONTENT_BLOCKED_MARKER = '【审核拦截】供应商内容安全网关拒绝处理，请人工审阅。'

/** 终态 category：复用现有 '待人工复核' */
export const CONTENT_BLOCKED_CATEGORY = '待人工复核'

/** 终态入库成功/失败结果 */
export interface MarkBlockedResult {
  ok: boolean
  error?: string
}

/**
 * 将单篇文章标记为「LLM 网关内容审核拦截终态」。
 * 写入 title_cn=原标题, summary_cn=标记, category='待人工复核',
 * relevance_score=NULL, is_selected=false。
 *
 * 必须传 supabase (createServiceClient() 返回的 DatabaseClient)。
 */
export async function markContentBlocked(
  supabase: DatabaseClient,
  article: { id: string; title: string | null },
): Promise<MarkBlockedResult> {
  // 兜底：原标题为空时也要脱队，用一个占位符
  const placeholderTitle = article.title?.trim() || '(无标题)'
  const { error } = await supabase
    .from('articles')
    .update({
      title_cn: placeholderTitle,
      summary_cn: CONTENT_BLOCKED_MARKER,
      category: CONTENT_BLOCKED_CATEGORY,
      relevance_score: null,
      is_selected: false,
    })
    .eq('id', article.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
