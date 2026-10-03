// lib/llm.ts — LLM 调用模块
// 调用顺序: DeepSeek V4 Flash → Kimi K2.6 → Kimi for Coding
// 三个服务均使用各自的 OpenAI 兼容接口。

import { createServiceClient } from './supabase'
import { findRelevantLearnings, formatLearningRules } from './classification-learning'
import { applyDirectCategoryScoreFloor, enforceDirectIndustryScore, INDUSTRY_SCOPE_RULES } from './relevance'
import { classifyLlmError, type LlmFailureKind } from './llm-errors'
import { checkBudget } from './llm-budget'
import { getPrompt, promptVersion, type PromptName } from './prompts'
import {
  buildInputHash,
  completeReceipt,
  failReceipt,
  findReusableReceipt,
  openReceipt,
  DEFAULT_LLM_PURPOSE,
  type LlmPurpose,
  type ReceiptUsage,
} from './llm-receipts'
export type { LlmFailureKind } from './llm-errors'
export type { LlmPurpose } from './llm-receipts'

type LlmProvider = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  attempts: number
}

const LLM_PROVIDERS: LlmProvider[] = [
  {
    name: 'DeepSeek',
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    attempts: 3,
  },
  {
    name: 'Kimi',
    baseUrl: process.env.LLM_BACKUP_URL || '',
    apiKey: process.env.LLM_BACKUP_KEY || '',
    model: process.env.LLM_BACKUP_MODEL || 'kimi-k2.6',
    attempts: 2,
  },
  {
    name: 'Kimi Coding',
    baseUrl: process.env.LLM_BACKUP2_URL || '',
    apiKey: process.env.LLM_BACKUP2_KEY || '',
    model: process.env.LLM_BACKUP2_MODEL || 'kimi-for-coding',
    attempts: 2,
  },
]

export const CATEGORIES = [
  '创作/上新',
  'IP/品牌/授权',
  '潮玩谷子',
  '零售/渠道',
  '影视综艺',
  '游戏/体育',
  'AI/新技术',
  '展会活动',
  '文旅及商品',
  '艺术/亚文化',
  '政策规则',
  '版权保护',
  '待分类',
] as const

export type Category = (typeof CATEGORIES)[number]

export type LlmResult = {
  title_cn: string
  summary_cn: string
  category: Category
  relevance_score: number
  is_selected: boolean
  commentary: string
  safety_blocked: boolean
  /** 产出该结果的提示词版本（B4）；由 summarizeArticle 填，parseResult 阶段为 null */
  prompt_version?: string | null
}

/** 失败信息分类（分类逻辑见 lib/llm-errors.ts） */

/** summarizeArticle 的返回类型：成功携带结果；失败区分失败类型并携带示例错误，便于调用方决定是否告警 */
export type LlmOutcome =
  | { ok: true; result: LlmResult }
  | { ok: false; kind: LlmFailureKind; sampleError: string }

/**
 * 安全闸门追加段（B4：正文在 prompts/article-score.md，这里只放运行时拼装的追加指令）。
 * 单独留在这里是因为它必须无条件生效，不允许被误删提示词文件时一起丢失。
 */
const SAFETY_GATE =
  'Safety gate: set safety_blocked=true for violence, gore, politics, ideology, China sovereignty or territorial disputes, separatism, religious extremism, racism, war, military, weapons, LGBT or gender controversy, or other content that violates mainland China political, ideological, geographic, or religious requirements. Otherwise set false.'

type LlmCallResult = {
  parsed: Record<string, unknown>
  usage: ReceiptUsage
}

function readUsage(data: unknown): ReceiptUsage {
  const raw = (data as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage
  const toNumber = (value: unknown): number | null => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
  }
  return {
    promptTokens: toNumber(raw?.prompt_tokens),
    completionTokens: toNumber(raw?.completion_tokens),
  }
}

/** 调用单个 LLM API（文章打分专用：user 消息按 标题+内容 拼装） */
async function callLLM(
  title: string,
  content: string,
  systemPrompt: string,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<LlmCallResult> {
  return callProvider(systemPrompt, `标题: ${title}\n\n内容: ${content.slice(0, 3000)}`, baseUrl, apiKey, model)
}

/** 调用单个 LLM API（通用：user 消息由调用方拼好） */
async function callProvider(
  systemPrompt: string,
  userPrompt: string,
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<LlmCallResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90000)
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  let res: Response
  try {
    res = await fetch(endpoint, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const raw: string = data.choices?.[0]?.message?.content ?? ''
  if (!raw) throw new Error('Empty response')

  const jsonMatch = raw.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) throw new Error(`No JSON in: ${raw.slice(0, 120)}`)

  return { parsed: JSON.parse(jsonMatch[0]) as Record<string, unknown>, usage: readUsage(data) }
}

/** 解析 LLM 返回的 JSON 为标准结果 */
function parseResult(parsed: Record<string, unknown>, title: string): LlmResult {
  const category = CATEGORIES.includes(parsed.category as Category)
    ? (parsed.category as Category)
    : '待分类'

  const parsedScore = Number(parsed.relevance_score)
  const modelScore = Number.isFinite(parsedScore)
    ? Math.min(10, Math.max(0, parsedScore))
    : 5
  const relevance_score = applyDirectCategoryScoreFloor(
    category,
    enforceDirectIndustryScore(title, category, modelScore),
  )

  return {
    title_cn: String(parsed.title_cn || title).slice(0, 100),
    summary_cn: String(parsed.summary_cn || '').slice(0, 200),
    category,
    relevance_score,
    is_selected: relevance_score >= 7,
    safety_blocked: parsed.safety_blocked === true,
    commentary: String(parsed.commentary || '待人工编辑')
      .replace(/[\s—–-]{0,3}(贾田点评|推荐理由|编辑推荐).*$/g, '')
      .replace(/^[\s—–-]+|[\s—–-]+$/g, '')
      .slice(0, 100),
    prompt_version: null,
  }
}

/** 检测 commentary 是否明确表示与产业完全无关 */
export function isIrrelevantByCommentary(commentary: string | null): boolean {
  if (!commentary || commentary === '待人工编辑') return false
  // 匹配模式：完全无关 / 与XX无关 / 无关产业 / 建议不收录
  return /完全无关|与[一-龥\/]{1,20}无关|无关产业|建议不收录|不建议收录/.test(commentary)
}

/** 统一判断文章是否应被忽略（低分或 commentary 明确无关） */
export function shouldIgnoreArticle(
  relevanceScore: number | null,
  commentary: string | null
): boolean {
  // LLM 已判定弱相关/无关（prompt 要求 0-3 分自动删除）
  if ((relevanceScore ?? 10) <= 3) return true
  // commentary 明确表达无关
  return isIrrelevantByCommentary(commentary)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function summarizeArticle(
  title: string,
  content: string,
  purpose: LlmPurpose = DEFAULT_LLM_PURPOSE
): Promise<LlmOutcome> {
  const providers = LLM_PROVIDERS.filter(
    (provider) => provider.baseUrl && provider.apiKey && provider.model
  )
  if (!providers.length) {
    console.warn('[LLM] 未配置可用的 LLM，跳过摘要')
    return { ok: false, kind: 'outage', sampleError: 'no LLM provider configured' }
  }

  // 提示词正文来自 prompts/article-score.md（B4），版本号随结果一起返回，供写库时留痕
  const prompt = getPrompt('article-score', {
    INDUSTRY_SCOPE: INDUSTRY_SCOPE_RULES,
    SAFETY_GATE,
  })
  const version = prompt.version

  // 查询学习记录并注入 prompt
  let systemPrompt = prompt.text
  try {
    if (process.env.DATABASE_URL) {
      const supabase = createServiceClient()
      const learnings = await findRelevantLearnings(supabase, title, 15)
      const learningRules = formatLearningRules(learnings)
      if (learningRules) {
        systemPrompt += learningRules
      }
    }
  } catch (e) {
    console.error('[LLM] 查询学习记录失败:', e instanceof Error ? e.message : String(e))
  }

  const trimmedContent = content.slice(0, 3000)
  const primaryModel = providers[0].model
  // 哈希里带上提示词版本：改提示词后旧回执不会被误复用（宁可重新付费一次）
  const inputHash = buildInputHash([version, systemPrompt, title, trimmedContent])

  // 1) 复用已付过钱的结果：不花钱、不占用预算额度
  const reusable = await findReusableReceipt(purpose, primaryModel, inputHash)
  if (reusable?.response_json) {
    try {
      const cached = JSON.parse(reusable.response_json) as Record<string, unknown>
      return { ok: true, result: { ...parseResult(cached, title), prompt_version: version } }
    } catch {
      // 回执内容损坏：忽略，按正常流程重新调用
    }
  }

  // 2) 预算熔断：超限暂停调用，文章保持原状等下一轮重试（不伪装降级）
  const budget = await checkBudget(purpose)
  if (!budget.allowed) {
    const window = budget.tripped ?? 'day'
    const used = budget.usage[window]
    const limit = budget.limits[window]
    const message = `LLM budget tripped: ${purpose} ${window} ${used}/${limit}`
    console.warn(`[LLM] 预算熔断，跳过本次调用：${message}`)
    return { ok: false, kind: 'outage', sampleError: message }
  }

  // 3) 记账后调用，拿回结果立即结算
  const receiptId = await openReceipt({
    purpose,
    model: primaryModel,
    inputHash,
    requestChars: systemPrompt.length + title.length + trimmedContent.length,
    promptVersion: version,
  })

  const failures: Array<{ kind: LlmFailureKind; message: string }> = []

  for (const provider of providers) {
    for (let i = 0; i < provider.attempts; i++) {
      try {
        const { parsed, usage } = await callLLM(
          title,
          content,
          systemPrompt,
          provider.baseUrl,
          provider.apiKey,
          provider.model
        )
        const result = parseResult(parsed, title)
        if (receiptId) {
          await completeReceipt(receiptId, JSON.stringify(parsed), usage)
        }
        return { ok: true, result: { ...result, prompt_version: version } }
      } catch (e) {
        const message = e instanceof Error ? e.message.slice(0, 200) : String(e)
        console.warn(
          `[LLM] ${provider.name} 第${i + 1}次失败:`,
          message
        )
        const kind = classifyLlmError(e)
        failures.push({ kind, message })
        if (kind === 'content_blocked') {
          // 网关内容安全拦截：不是服务故障。对该 provider 不做无效重试，直接换下一家
          //（备份 DeepSeek 无此过滤，通常能正常接盘给这类内容打低分/归类）。
          break
        }
      }
      if (i < provider.attempts - 1) await sleep(2000)
    }
  }

  // 全部失败：不在本层发飞书告警，改由 cron 路由按批次汇总后统一发（避免批量失败时逐篇刷屏）。
  // 区分「内容安全拦截」（网关拿敏感词挡内容，非故障）与「真故障」（余额/Key/并发/网络）。
  const hasOutage = failures.some((f) => f.kind === 'outage')
  const kind: LlmFailureKind = hasOutage ? 'outage' : 'content_blocked'
  const sampleError = failures.find((f) => f.kind === 'outage')?.message
    ?? failures[0]?.message
    ?? 'unknown error'
  console.error(`[LLM] 所有模型均失败（${kind === 'content_blocked' ? '内容安全拦截' : '真故障'}）:`, sampleError)
  if (receiptId) {
    await failReceipt(receiptId, sampleError)
  }
  return { ok: false, kind, sampleError }
}

export type LlmJsonOutcome =
  | { ok: true; parsed: Record<string, unknown>; cached: boolean; promptVersion: string | null }
  | { ok: false; kind: LlmFailureKind; error: string }

/**
 * 通用 JSON 调用层（事件聚簇等场景用）：与 summarizeArticle 相同的
 * 「回执复用 → 预算熔断 → 记账调用 → 结算」四步，failover 走同一组 provider。
 *
 * B4：systemPrompt 仍由调用方传入，但额外传 promptName 以便把提示词版本写进回执。
 */
export async function callLlmJson(
  purpose: LlmPurpose,
  systemPrompt: string,
  userPrompt: string,
  promptName?: PromptName
): Promise<LlmJsonOutcome> {
  const providers = LLM_PROVIDERS.filter(
    (provider) => provider.baseUrl && provider.apiKey && provider.model
  )
  if (!providers.length) {
    return { ok: false, kind: 'outage', error: 'no LLM provider configured' }
  }

  const version = promptName ? promptVersion(promptName) : null
  const primaryModel = providers[0].model
  // 哈希带版本号：改提示词后旧回执不会被误复用
  const inputHash = buildInputHash([purpose, version ?? '', systemPrompt, userPrompt])

  // 1) 复用已付过钱的结果
  const reusable = await findReusableReceipt(purpose, primaryModel, inputHash)
  if (reusable?.response_json) {
    try {
      const cached = JSON.parse(reusable.response_json) as Record<string, unknown>
      return { ok: true, parsed: cached, cached: true, promptVersion: version }
    } catch {
      // 回执内容损坏：按正常流程重新调用
    }
  }

  // 2) 预算熔断
  const budget = await checkBudget(purpose)
  if (!budget.allowed) {
    const window = budget.tripped ?? 'day'
    const message = `LLM budget tripped: ${purpose} ${window} ${budget.usage[window]}/${budget.limits[window]}`
    console.warn(`[LLM] 预算熔断，跳过本次调用：${message}`)
    return { ok: false, kind: 'outage', error: message }
  }

  // 3) 记账后调用
  const receiptId = await openReceipt({
    purpose,
    model: primaryModel,
    inputHash,
    requestChars: systemPrompt.length + userPrompt.length,
    promptVersion: version,
  })

  const failures: Array<{ kind: LlmFailureKind; message: string }> = []
  for (const provider of providers) {
    for (let i = 0; i < provider.attempts; i++) {
      try {
        const { parsed, usage } = await callProvider(systemPrompt, userPrompt, provider.baseUrl, provider.apiKey, provider.model)
        if (receiptId) {
          await completeReceipt(receiptId, JSON.stringify(parsed), usage)
        }
        return { ok: true, parsed, cached: false, promptVersion: version }
      } catch (e) {
        const message = e instanceof Error ? e.message.slice(0, 200) : String(e)
        const kind = classifyLlmError(e)
        failures.push({ kind, message })
        if (kind === 'content_blocked') break
      }
      if (i < provider.attempts - 1) await sleep(2000)
    }
  }

  const hasOutage = failures.some((f) => f.kind === 'outage')
  const kind: LlmFailureKind = hasOutage ? 'outage' : 'content_blocked'
  const error = failures.find((f) => f.kind === 'outage')?.message ?? failures[0]?.message ?? 'unknown error'
  console.error(`[LLM:${purpose}] 所有模型均失败（${kind}）:`, error)
  if (receiptId) {
    await failReceipt(receiptId, error)
  }
  return { ok: false, kind, error }
}
