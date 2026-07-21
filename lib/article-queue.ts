import { REVIEW_CATEGORY } from './categories'
import { shouldHardDropArticle } from './domain-pruning'
import { shouldIgnoreArticle, type LlmResult } from './llm'

const PRE_LLM_SKIP_PATTERNS = [
  /习近平|党中央|国务院|人大|政协|党史|党纪|中央军委/,
  /会见|会谈|互致贺电|复信|重要讲话|考察调研|思想/,
  /高考答案|系谣言|剧本式造谣|辟谣/,
  /盐碱地|平陆运河|南博|龙舟|三江源|水塔/,
]

const WEAK_SOURCE_PATTERNS = [
  /千龙网|西安网|豆瓣电影\/动漫/,
]

const LLM_QUEUE_RETRIES = Math.max(1, Number(process.env.LLM_QUEUE_RETRIES || 2))
const LLM_QUEUE_RETRY_DELAY_MS = Math.max(0, Number(process.env.LLM_QUEUE_RETRY_DELAY_MS || 800))
const MID_SCORE_MIN = 4
const MID_SCORE_MAX = 6

type SupabaseQuery = {
  eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>
}

type SupabaseLike = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => SupabaseQuery
    delete: () => SupabaseQuery
  }
}

export type QueuedArticle = {
  id: string
  title: string
  source?: string | null
}

export type QueueProcessStatus = 'ok' | 'irrelevant' | 'skipped' | 'llm_failed_marked'

export type QueueProcessResult = {
  id: string
  status: QueueProcessStatus
  error?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function getPreLlmSkipReason(title: string, source?: string | null): string | null {
  const pruneDecision = shouldHardDropArticle({ title, source })
  if (pruneDecision.drop) {
    return `hard_drop_${pruneDecision.reason}`
  }

  const text = `${title}\n${source || ''}`

  if (PRE_LLM_SKIP_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'pre_llm_sensitive_or_irrelevant'
  }

  if (source && WEAK_SOURCE_PATTERNS.some((pattern) => pattern.test(source)) && title.length < 12) {
    return 'pre_llm_low_signal_source'
  }

  return null
}

export function buildSkippedArticleUpdate(title: string, reason: string) {
  return {
    title_cn: title.slice(0, 100),
    summary_cn: '',
    category: REVIEW_CATEGORY,
    relevance_score: 0,
    is_selected: false,
    commentary: reason === 'pre_llm_sensitive_or_irrelevant'
      ? '预过滤：疑似不适合自动处理内容'
      : '预过滤：低信号来源内容',
  }
}

export function buildLlmFailureArticleUpdate(title: string, reason: string) {
  return {
    title_cn: title.slice(0, 100),
    summary_cn: '',
    category: REVIEW_CATEGORY,
    relevance_score: 4,
    is_selected: false,
    commentary: `LLM处理失败，待人工复核：${reason.slice(0, 60)}`,
  }
}

function shouldSendToManualReview(result: LlmResult, forceReview: boolean): boolean {
  if (forceReview) return true
  if (result.category === REVIEW_CATEGORY) return true
  if (result.relevance_score >= MID_SCORE_MIN && result.relevance_score <= MID_SCORE_MAX) return true
  if (/不确定|需人工|待确认|无法判断|信息不足|uncertain|unsure|ambiguous|insufficient/i.test(result.commentary || '')) {
    return true
  }
  return false
}

async function summarizeWithRetry({
  article,
  summarize,
}: {
  article: QueuedArticle
  summarize: (article: QueuedArticle) => Promise<LlmResult | null>
}): Promise<LlmResult> {
  const reasons: string[] = []

  for (let attempt = 1; attempt <= LLM_QUEUE_RETRIES; attempt += 1) {
    try {
      const result = await summarize(article)
      if (!result) throw new Error('LLM returned empty result')
      return result
    } catch (error) {
      const message = getErrorMessage(error)
      reasons.push(`attempt${attempt}:${message}`)
      if (attempt < LLM_QUEUE_RETRIES) await sleep(LLM_QUEUE_RETRY_DELAY_MS)
    }
  }

  throw new Error(`LLM retries exhausted: ${reasons.join(' | ').slice(0, 220)}`)
}

export async function processQueuedArticle({
  supabase,
  article,
  summarize,
  forceReview = false,
}: {
  supabase: SupabaseLike
  article: QueuedArticle
  summarize: (article: QueuedArticle) => Promise<LlmResult | null>
  forceReview?: boolean
}): Promise<QueueProcessResult> {
  const skipReason = getPreLlmSkipReason(article.title, article.source)
  if (skipReason) {
    if (skipReason.startsWith('hard_drop_')) {
      const { error } = await supabase.from('articles').delete().eq('id', article.id)
      if (error) throw new Error(error.message)
      return { id: article.id, status: 'irrelevant' }
    }

    const { error } = await supabase
      .from('articles')
      .update(buildSkippedArticleUpdate(article.title, skipReason))
      .eq('id', article.id)

    if (error) throw new Error(error.message)
    return { id: article.id, status: 'skipped' }
  }

  let llmResult: LlmResult
  try {
    llmResult = await summarizeWithRetry({ article, summarize })
  } catch (error) {
    const reason = getErrorMessage(error)
    const { error: updateError } = await supabase
      .from('articles')
      .update(buildLlmFailureArticleUpdate(article.title, reason))
      .eq('id', article.id)

    if (updateError) throw new Error(`LLM failed and fallback update failed: ${reason}; ${updateError.message}`)
    return { id: article.id, status: 'llm_failed_marked', error: reason }
  }

  if (shouldIgnoreArticle(llmResult.relevance_score, llmResult.commentary)) {
    let lastDeleteError: { message: string } | null = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { error } = await supabase.from('articles').delete().eq('id', article.id)
      if (!error) {
        lastDeleteError = null
        break
      }
      lastDeleteError = error
      console.error(`[article-queue] 删除低分文章失败 id=${article.id} 第${attempt}次:`, error.message)
      if (attempt < 3) await sleep(300)
    }

    if (lastDeleteError) {
      // 删除彻底失败，返回错误让上层记录；不再 fallback 标记为 0 分待分类制造噪音
      return {
        id: article.id,
        status: 'irrelevant',
        error: `delete failed after 3 attempts: ${lastDeleteError.message}`,
      }
    }

    return { id: article.id, status: 'irrelevant' }
  }

  const reviewMode = shouldSendToManualReview(llmResult, forceReview)

  const { error } = await supabase
    .from('articles')
    .update({
      title_cn: llmResult.title_cn,
      summary_cn: llmResult.summary_cn,
      category: reviewMode ? REVIEW_CATEGORY : llmResult.category,
      relevance_score: llmResult.relevance_score,
      is_selected: reviewMode ? false : llmResult.is_selected,
      commentary: llmResult.commentary,
    })
    .eq('id', article.id)

  if (error) throw new Error(error.message)
  return { id: article.id, status: 'ok' }
}
