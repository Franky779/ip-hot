// lib/llm-receipts.ts — 付费调用回执
// 每次模型调用先记账再调用：相同 purpose + model + 输入只花钱一次。
// 进程重启、任务重试时复用已付过钱的结果，不重复花钱。

import { createServiceClient } from './supabase'

export { buildInputHash } from './llm-hash'

export type LlmPurpose = 'summarize' | 'prefilter' | 'score' | 'relate' | 'industry_gate'

export const DEFAULT_LLM_PURPOSE: LlmPurpose = 'summarize'

export type ReceiptUsage = {
  promptTokens: number | null
  completionTokens: number | null
}

export type ReceiptRow = {
  id: string
  status: 'pending' | 'ok' | 'failed'
  response_json: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
}

/**
 * 查找可以直接复用结果的成功回执。
 * 数据库不可用时返回 null（退化为正常调用），绝不因为记账失败就阻断业务。
 */
export async function findReusableReceipt(
  purpose: LlmPurpose,
  model: string,
  inputHash: string,
): Promise<ReceiptRow | null> {
  try {
    const { rows } = await createServiceClient().query(
      `select id, status, response_json, prompt_tokens, completion_tokens
       from llm_receipts
       where purpose = $1 and model = $2 and input_hash = $3 and status = 'ok'
       limit 1`,
      [purpose, model, inputHash],
    )
    const row = rows[0]
    if (!row || !row.response_json) return null
    return row as ReceiptRow
  } catch {
    return null
  }
}

/**
 * 开一张 pending 回执。同输入已有 failed 记录时重开为 pending（允许重试后缓存成功结果）；
 * 并发场景下各方会拿到同一行，结算以最后写入为准，内容一致无碍。
 */
export async function openReceipt(params: {
  purpose: LlmPurpose
  model: string
  inputHash: string
  requestChars: number
  promptVersion?: string | null
}): Promise<string | null> {
  try {
    const { rows } = await createServiceClient().query(
      `insert into llm_receipts (purpose, model, input_hash, request_chars, prompt_version, status)
       values ($1, $2, $3, $4, $5, 'pending')
       on conflict (purpose, model, input_hash) do update
         set status = 'pending', response_json = null, error_message = null,
             prompt_version = excluded.prompt_version, updated_at = now()
       returning id`,
      [params.purpose, params.model, params.inputHash, params.requestChars, params.promptVersion ?? null],
    )
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}

/** 结算成功：写入结果与 token 用量。 */
export async function completeReceipt(
  id: string,
  responseJson: string,
  usage: ReceiptUsage,
): Promise<void> {
  try {
    await createServiceClient().query(
      `update llm_receipts
       set status = 'ok', response_json = $2, prompt_tokens = $3, completion_tokens = $4,
           error_message = null, updated_at = now()
       where id = $1`,
      [id, responseJson, usage.promptTokens, usage.completionTokens],
    )
  } catch {
    // 记账失败不影响已拿到的结果
  }
}

/** 结算失败：只记原因，失败结果不被复用。 */
export async function failReceipt(id: string, message: string): Promise<void> {
  try {
    await createServiceClient().query(
      `update llm_receipts
       set status = 'failed', error_message = $2, updated_at = now()
       where id = $1`,
      [id, message.slice(0, 500)],
    )
  } catch {
    // 忽略
  }
}

/**
 * 清理超过保留天数的回执，防止 receipts 表无限增长拖慢预算统计。
 * 由定时任务或管理接口低频调用。
 */
export async function purgeOldReceipts(retentionDays = 30): Promise<number> {
  try {
    const { rowCount } = await createServiceClient().query(
      `delete from llm_receipts where created_at < now() - make_interval(days => $1)`,
      [retentionDays],
    )
    return rowCount
  } catch {
    return 0
  }
}
