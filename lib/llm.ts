import { createServiceClient } from './supabase'
import { findRelevantLearnings, formatLearningRules } from './classification-learning'
import { ARTICLE_CATEGORIES, CATEGORY_PROMPT_REQUIREMENTS, REVIEW_CATEGORY, normalizeCategory, type ArticleCategory } from './categories'

const LLM_BASE_URL = process.env.LLM_BASE_URL || ''
const LLM_API_KEY = process.env.LLM_API_KEY || ''
const LLM_MODEL = process.env.LLM_MODEL || 'kimi-for-coding'
const LLM_PROTOCOL = process.env.LLM_PROTOCOL || 'anthropic'

const BACKUP_URL = process.env.LLM_BACKUP_URL || ''
const BACKUP_KEY = process.env.LLM_BACKUP_KEY || ''
const BACKUP_MODEL = process.env.LLM_BACKUP_MODEL || 'deepseek-chat'
const BACKUP_PROTOCOL = process.env.LLM_BACKUP_PROTOCOL || 'openai'

const BACKUP2_URL = process.env.LLM_BACKUP2_URL || ''
const BACKUP2_KEY = process.env.LLM_BACKUP2_KEY || ''
const BACKUP2_MODEL = process.env.LLM_BACKUP2_MODEL || 'deepseek-v4-flash'
const BACKUP2_PROTOCOL = process.env.LLM_BACKUP2_PROTOCOL || 'openai'

const PRIMARY_ATTEMPTS = Math.max(1, Number(process.env.LLM_PRIMARY_ATTEMPTS || 1))
const BACKUP_ATTEMPTS = Math.max(1, Number(process.env.LLM_BACKUP_ATTEMPTS || 2))
const LLM_TIMEOUT_MS = Math.max(5_000, Number(process.env.LLM_TIMEOUT_MS || 45_000))

export const CATEGORIES = ARTICLE_CATEGORIES
export type Category = ArticleCategory

export type LlmResult = {
  title_cn: string
  summary_cn: string
  category: Category
  relevance_score: number
  is_selected: boolean
  commentary: string
}

type ProviderConfig = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  protocol: string
  attempts: number
}

const JSON_KEYS = ['title_cn', 'summary_cn', 'category', 'relevance_score', 'is_selected', 'commentary'] as const

const SYSTEM_PROMPT = [
  '你是文创/IP/ACG资讯编辑。请对输入新闻输出结构化结果。',
  '要求：',
  '1) title_cn: 中文标题，不超过100字。',
  '2) summary_cn: 中文摘要，不超过200字。',
  `3) 分类规则：\n${CATEGORY_PROMPT_REQUIREMENTS}`,
  '4) relevance_score: 0-10整数。',
  '5) is_selected: relevance_score >= 5 时为 true，否则 false。',
  '6) commentary: 1句行业解读，不超过100字。',
  `7) 若无法确定分类，category 必须为 "${REVIEW_CATEGORY}"。`,
  '8) 若内容与目标产业明显无关，relevance_score 应给 0-3。',
  '只输出 JSON，不要输出 Markdown，不要附加解释。',
  '返回格式：{"title_cn":"...","summary_cn":"...","category":"...","relevance_score":7,"is_selected":true,"commentary":"..."}',
].join('\n')

export class LlmParseError extends Error {
  readonly rawSnippet: string

  constructor(message: string, rawSnippet: string) {
    super(message)
    this.name = 'LlmParseError'
    this.rawSnippet = rawSnippet
  }
}

export class LlmRetryExhaustedError extends Error {
  readonly reasons: string[]

  constructor(reasons: string[]) {
    super(`All LLM providers failed: ${reasons.join(' | ').slice(0, 500)}`)
    this.name = 'LlmRetryExhaustedError'
    this.reasons = reasons
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeMessagesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/v1/messages')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`
  return `${trimmed}/v1/messages`
}

function normalizeChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function extractTextFromPart(part: unknown): string {
  if (typeof part === 'string') return part
  if (!isRecord(part)) return ''

  if (typeof part.text === 'string') return part.text
  if (typeof part.content === 'string') return part.content
  if (Array.isArray(part.content)) {
    return part.content.map(extractTextFromPart).filter(Boolean).join('\n')
  }

  return ''
}

function extractTextFromResponse(data: unknown): string {
  if (!isRecord(data)) return ''

  if (typeof data.output_text === 'string') return data.output_text
  if (typeof data.text === 'string') return data.text

  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.content)) {
    const text = data.content.map(extractTextFromPart).filter(Boolean).join('\n')
    if (text) return text
  }

  if (Array.isArray(data.choices) && data.choices.length > 0) {
    const firstChoice = data.choices[0]
    if (isRecord(firstChoice)) {
      const fromMessage = isRecord(firstChoice.message) ? firstChoice.message.content : undefined
      const fromDelta = isRecord(firstChoice.delta) ? firstChoice.delta.content : undefined
      const fromText = firstChoice.text
      const merged = [fromMessage, fromDelta, fromText]
        .map((item) => (Array.isArray(item) ? item.map(extractTextFromPart).join('\n') : extractTextFromPart(item)))
        .filter(Boolean)
        .join('\n')

      if (merged) return merged
    }
  }

  return ''
}

function extractCodeBlockCandidates(raw: string): string[] {
  const candidates: string[] = []
  const regex = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(raw))) {
    if (match[1]?.trim()) candidates.push(match[1].trim())
  }

  return candidates
}

function extractBalancedJsonObjects(raw: string, limit = 6): string[] {
  const candidates: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      continue
    }

    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }

    if (ch === '}') {
      if (depth > 0) depth -= 1
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, i + 1))
        start = -1
        if (candidates.length >= limit) break
      }
    }
  }

  return candidates
}

function repairJsonCandidate(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3')
    .trim()
}

function parseCandidate(candidate: string): Record<string, unknown> | null {
  const attempts = [candidate.trim(), repairJsonCandidate(candidate)]

  for (const item of attempts) {
    if (!item) continue

    try {
      const parsed = JSON.parse(item)
      if (isRecord(parsed)) return parsed
    } catch {
      // continue
    }
  }

  return null
}

export function parseLlmJsonOrThrow(raw: string): Record<string, unknown> {
  const snippet = raw.replace(/\s+/g, ' ').slice(0, 260)
  if (!raw.trim()) throw new LlmParseError('LLM response is empty', snippet)

  const orderedCandidates = [
    ...extractCodeBlockCandidates(raw),
    ...extractBalancedJsonObjects(raw),
    raw,
  ]

  const unique = Array.from(new Set(orderedCandidates.map((item) => item.trim()).filter(Boolean)))

  for (const candidate of unique) {
    const parsed = parseCandidate(candidate)
    if (!parsed) continue

    if (JSON_KEYS.some((key) => key in parsed)) {
      return parsed
    }
  }

  throw new LlmParseError('Failed to parse valid JSON from LLM response', snippet)
}

function toIntScore(value: unknown): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return 5
  return Math.max(0, Math.min(10, Math.round(num)))
}

function parseResult(parsed: Record<string, unknown>, fallbackTitle: string): LlmResult {
  const category = normalizeCategory(parsed.category)
  const relevance_score = toIntScore(parsed.relevance_score)

  const title_cn = String(parsed.title_cn || fallbackTitle).trim().slice(0, 100)
  const summary_cn = String(parsed.summary_cn || '').trim().slice(0, 200)
  const commentary = String(parsed.commentary || '待人工复核')
    .replace(/^\s+|\s+$/g, '')
    .slice(0, 100)

  return {
    title_cn,
    summary_cn,
    category,
    relevance_score,
    is_selected: relevance_score >= 5 && category !== REVIEW_CATEGORY,
    commentary,
  }
}

async function callLLM({
  title,
  content,
  systemPrompt,
  provider,
}: {
  title: string
  content: string
  systemPrompt: string
  provider: ProviderConfig
}): Promise<LlmResult> {
  const isOpenAI = provider.protocol === 'openai'
  const endpoint = isOpenAI
    ? normalizeChatCompletionsUrl(provider.baseUrl)
    : normalizeMessagesUrl(provider.baseUrl)

  const userContent = `标题: ${title}\n\n正文: ${content.slice(0, 3000)}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (isOpenAI) {
    headers.Authorization = `Bearer ${provider.apiKey}`
  } else {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
  }

  const body = isOpenAI
    ? {
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        max_tokens: 600,
      }
    : {
        model: provider.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        temperature: 0.2,
        max_tokens: 600,
      }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text.slice(0, 220)}`)
  }

  const responseBody: unknown = await response.json()
  const text = extractTextFromResponse(responseBody)
  const parsed = parseLlmJsonOrThrow(text)
  return parseResult(parsed, title)
}

function buildProviders(): ProviderConfig[] {
  return [
    {
      name: 'Backup2',
      baseUrl: BACKUP2_URL,
      apiKey: BACKUP2_KEY,
      model: BACKUP2_MODEL,
      protocol: BACKUP2_PROTOCOL,
      attempts: BACKUP_ATTEMPTS,
    },
    {
      name: 'Primary',
      baseUrl: LLM_BASE_URL,
      apiKey: LLM_API_KEY,
      model: LLM_MODEL,
      protocol: LLM_PROTOCOL,
      attempts: PRIMARY_ATTEMPTS,
    },
    {
      name: 'Backup1',
      baseUrl: BACKUP_URL,
      apiKey: BACKUP_KEY,
      model: BACKUP_MODEL,
      protocol: BACKUP_PROTOCOL,
      attempts: BACKUP_ATTEMPTS,
    },
  ].filter((provider) => provider.baseUrl && provider.apiKey)
}

/** 检测 commentary 是否明确表示与产业无关 */
export function isIrrelevantByCommentary(commentary: string | null): boolean {
  if (!commentary || commentary === '待人工复核') return false
  return /完全无关|不相关|无关产业|建议不收录|not related|irrelevant/i.test(commentary)
}

/** 统一判断文章是否应被忽略（低分或明确无关） */
export function shouldIgnoreArticle(relevanceScore: number | null, commentary: string | null): boolean {
  if ((relevanceScore ?? 10) <= 3) return true
  return isIrrelevantByCommentary(commentary)
}

export async function summarizeArticle(title: string, content: string): Promise<LlmResult | null> {
  if (!LLM_BASE_URL || !LLM_API_KEY) {
    console.warn('[LLM] Missing LLM_BASE_URL or LLM_API_KEY, skip summarization.')
    return null
  }

  let systemPrompt = SYSTEM_PROMPT
  try {
    if (process.env.SUPABASE_SECRET_KEY) {
      const supabase = createServiceClient()
      const learnings = await findRelevantLearnings(supabase, title, 15)
      const learningRules = formatLearningRules(learnings)
      if (learningRules) systemPrompt += learningRules
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[LLM] Failed to load learning rules:', message)
  }

  const providers = buildProviders()
  const reasons: string[] = []

  for (const provider of providers) {
    for (let attempt = 1; attempt <= provider.attempts; attempt += 1) {
      try {
        return await callLLM({ title, content, systemPrompt, provider })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reasons.push(`${provider.name}#${attempt}: ${message}`)
        console.warn(`[LLM] ${provider.name} attempt ${attempt} failed: ${message.slice(0, 200)}`)
      }

      if (attempt < provider.attempts) await sleep(1000)
    }
  }

  throw new LlmRetryExhaustedError(reasons)
}
