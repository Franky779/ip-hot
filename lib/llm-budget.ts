// lib/llm-budget.ts — LLM 调用预算熔断
// 每个用途（purpose）有分钟 / 小时 / 天三级上限，超过就暂停该类调用并告警。
// 设计原则：数据库不可用或记账异常时默认放行，绝不因为成本闸门的故障阻断业务。

import { createServiceClient } from './supabase'
import { sendFeishuAlertAggregated } from './feishu-alert'
import { DEFAULT_LLM_PURPOSE, type LlmPurpose } from './llm-receipts'

export type BudgetWindow = 'minute' | 'hour' | 'day'

export type BudgetLimits = {
  minute: number
  hour: number
  day: number
}

export type BudgetUsage = {
  minute: number
  hour: number
  day: number
}

export type BudgetRow = {
  purpose: string
  minute_limit: number
  hour_limit: number
  day_limit: number
  enabled: boolean
}

export type BudgetCheck = {
  purpose: LlmPurpose
  enabled: boolean
  allowed: boolean
  tripped: BudgetWindow | null
  limits: BudgetLimits
  usage: BudgetUsage
}

export type BudgetSnapshot = BudgetCheck & {
  today: {
    total: number
    ok: number
    failed: number
    pending: number
    promptTokens: number
    completionTokens: number
  }
}

/** 默认上限。建表时写入 llm_budget，这里只作为表缺失/查询失败时的兜底。 */
export const DEFAULT_LIMITS: BudgetLimits = {
  minute: 120,
  hour: 3000,
  day: 30000,
}

export const LLM_PURPOSES: LlmPurpose[] = ['summarize', 'prefilter', 'score', 'relate', 'industry_gate']

function toInt(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function normalizeLimits(patch: Partial<BudgetLimits>): Partial<BudgetLimits> {
  const result: Partial<BudgetLimits> = {}
  for (const key of ['minute', 'hour', 'day'] as BudgetWindow[]) {
    const value = patch[key]
    if (value === undefined || value === null) continue
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`${key} 上限必须是非负整数`)
    }
    result[key] = parsed
  }
  return result
}

/** 读取预算配置；查不到或数据库异常时返回默认值并放行。 */
export async function getBudgetRow(purpose: LlmPurpose = DEFAULT_LLM_PURPOSE): Promise<BudgetRow> {
  try {
    const { rows } = await createServiceClient().query(
      `select purpose, minute_limit, hour_limit, day_limit, enabled
       from llm_budget where purpose = $1 limit 1`,
      [purpose],
    )
    const row = rows[0]
    if (row) {
      return {
        purpose: String(row.purpose),
        minute_limit: toInt(row.minute_limit) || DEFAULT_LIMITS.minute,
        hour_limit: toInt(row.hour_limit) || DEFAULT_LIMITS.hour,
        day_limit: toInt(row.day_limit) || DEFAULT_LIMITS.day,
        enabled: row.enabled !== false,
      }
    }
  } catch {
    // 记账表不存在或数据库异常：按默认值放行，不阻断业务
  }
  return {
    purpose,
    minute_limit: DEFAULT_LIMITS.minute,
    hour_limit: DEFAULT_LIMITS.hour,
    day_limit: DEFAULT_LIMITS.day,
    enabled: true,
  }
}

/** 一次查询统计三个时间窗口的调用量（pending 也计入，请求已经发出去了）。 */
export async function getBudgetUsage(purpose: LlmPurpose): Promise<BudgetUsage> {
  try {
    const { rows } = await createServiceClient().query(
      `select
         count(*) filter (where created_at > now() - interval '1 minute')::int as minute_count,
         count(*) filter (where created_at > now() - interval '1 hour')::int as hour_count,
         count(*)::int as day_count
       from llm_receipts
       where purpose = $1 and created_at > now() - interval '1 day'`,
      [purpose],
    )
    const row = rows[0]
    return {
      minute: toInt(row?.minute_count),
      hour: toInt(row?.hour_count),
      day: toInt(row?.day_count),
    }
  } catch {
    return { minute: 0, hour: 0, day: 0 }
  }
}

/**
 * 调用前检查预算。超限返回 allowed=false，调用方应跳过本次模型调用。
 * 熔断首次触发时发一条飞书告警（90 秒聚合窗口内不重复刷屏）。
 */
export async function checkBudget(purpose: LlmPurpose = DEFAULT_LLM_PURPOSE): Promise<BudgetCheck> {
  const row = await getBudgetRow(purpose)
  const usage = await getBudgetUsage(purpose)
  const limits: BudgetLimits = {
    minute: row.minute_limit,
    hour: row.hour_limit,
    day: row.day_limit,
  }

  let tripped: BudgetWindow | null = null
  if (row.enabled) {
    if (usage.minute >= limits.minute) tripped = 'minute'
    else if (usage.hour >= limits.hour) tripped = 'hour'
    else if (usage.day >= limits.day) tripped = 'day'
  }

  if (tripped) {
    const windowLabel = tripped === 'minute' ? '分钟' : tripped === 'hour' ? '小时' : '天'
    const limit = limits[tripped]
    const used = usage[tripped]
    const text = [
      '【IP-HOT告警】LLM 调用预算熔断',
      `用途：${purpose}`,
      `${windowLabel}窗口用量 ${used}/${limit}，已暂停该类模型调用。`,
      '未处理的文章保持原状，下一轮自动重试；如属预期外暴增请立即排查提示词或抓取回路。',
    ].join('\n')
    void sendFeishuAlertAggregated(text).catch(() => {})
  }

  return {
    purpose,
    enabled: row.enabled,
    allowed: tripped === null,
    tripped,
    limits,
    usage,
  }
}

/** 管理接口：调整上限或开关。 */
export async function setBudget(
  purpose: LlmPurpose,
  patch: Partial<BudgetLimits> & { enabled?: boolean },
): Promise<BudgetRow> {
  const limits = normalizeLimits(patch)
  const columns: string[] = []
  const values: unknown[] = [purpose]
  const push = (column: string, value: unknown): void => {
    values.push(value)
    columns.push(`${column} = $${values.length}`)
  }

  if (limits.minute !== undefined) push('minute_limit', limits.minute)
  if (limits.hour !== undefined) push('hour_limit', limits.hour)
  if (limits.day !== undefined) push('day_limit', limits.day)
  if (patch.enabled !== undefined) push('enabled', patch.enabled === true)
  if (columns.length === 0) return getBudgetRow(purpose)

  columns.push('updated_at = now()')

  // query() 在失败时抛异常，由调用方（管理接口）捕获后返回 500
  await createServiceClient().query(
    `insert into llm_budget (purpose) values ($1)
     on conflict (purpose) do nothing`,
    [purpose],
  )

  await createServiceClient().query(
    `update llm_budget set ${columns.join(', ')} where purpose = $1`,
    values,
  )

  return getBudgetRow(purpose)
}

/** 管理页：返回全部用途的用量、上限、熔断状态与今日统计。 */
export async function listBudgetSnapshots(): Promise<BudgetSnapshot[]> {
  const results: BudgetSnapshot[] = []
  for (const purpose of LLM_PURPOSES) {
    const check = await checkBudget(purpose)
    let today = {
      total: 0,
      ok: 0,
      failed: 0,
      pending: 0,
      promptTokens: 0,
      completionTokens: 0,
    }
    try {
      const { rows } = await createServiceClient().query(
        `select
           count(*)::int as total,
           count(*) filter (where status = 'ok')::int as ok_count,
           count(*) filter (where status = 'failed')::int as failed_count,
           count(*) filter (where status = 'pending')::int as pending_count,
           coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
           coalesce(sum(completion_tokens), 0)::int as completion_tokens
         from llm_receipts
         where purpose = $1 and created_at > now() - interval '1 day'`,
        [purpose],
      )
      const row = rows[0]
      if (row) {
        today = {
          total: toInt(row.total),
          ok: toInt(row.ok_count),
          failed: toInt(row.failed_count),
          pending: toInt(row.pending_count),
          promptTokens: toInt(row.prompt_tokens),
          completionTokens: toInt(row.completion_tokens),
        }
      }
    } catch {
      // 统计失败不影响熔断状态展示
    }
    results.push({ ...check, today })
  }
  return results
}

/** 判断一个字符串是否是合法的 purpose 值。 */
export function isLlmPurpose(value: unknown): value is LlmPurpose {
  return typeof value === 'string' && (LLM_PURPOSES as string[]).includes(value)
}
