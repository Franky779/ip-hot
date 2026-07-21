import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { fetchSourceArticles } from '@/lib/article-fetchers'
import { filterRelevantArticles, type PruneDecision } from '@/lib/domain-pruning'
import { runLlmQueueBatch, type LlmQueueRunnerResult } from '@/lib/llm-queue-runner'
import { withCronOrAdminAuth } from '@/lib/withAdminAuth'
import { checkLinks } from '@/lib/link-checker'
import { createServiceClient } from '@/lib/supabase'
import { listRunnableNewsSources } from '@/services/sourceService'

export const runtime = 'nodejs'
export const maxDuration = 60

const LLM_BATCH_SIZE = 10
const LLM_CONCURRENCY = 3
const ARTICLE_TIMEOUT_MS = 35_000
const FETCH_BUDGET_MS = 28_000

type FetchResult = {
  source: string
  type: string
  ok: boolean
  fetched: number
  hardDropped: number
  dropReasons: Record<string, number>
  dead: number
  inserted: number
  error?: string
}

type ServiceClient = ReturnType<typeof createServiceClient>

function toArticleRows<T extends { summary?: string | null }>(items: T[]) {
  return items.map(({ summary: _summary, ...item }) => item)
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// 随机洗牌：28 秒抓取预算每次只能覆盖部分源，洗牌让高频周期下所有源轮流被覆盖
function shuffleSources<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

async function updateCronLog(supabase: ServiceClient, logId: string | null, updates: Record<string, unknown>) {
  if (!logId) return

  try {
    await supabase
      .from('cron_logs')
      .update(updates)
      .eq('id', logId)
  } catch (error) {
    console.error('[fetch-and-process] 更新 cron_logs 失败:', getErrorMessage(error))
  }
}

function countDropReasons(dropped: Array<{ decision: PruneDecision }>): Record<string, number> {
  return dropped.reduce<Record<string, number>>((acc, item) => {
    acc[item.decision.reason] = (acc[item.decision.reason] || 0) + 1
    return acc
  }, {})
}

export const GET = withCronOrAdminAuth(async (request: Request) => {
  const isAdminAuth = isAdminAuthenticated(request)
  const supabase = createServiceClient()
  const startedAt = Date.now()
  const triggerType = isAdminAuth ? 'manual' : 'cron'
  let logId: string | null = null

  try {
    const { data: logData, error: logError } = await supabase
      .from('cron_logs')
      .insert({ trigger_type: triggerType, status: 'running' })
      .select('id')
      .single()

    logId = logData?.id ?? null
    if (logError) {
      console.error('[fetch-and-process] 创建 cron_logs 失败:', logError.message)
    }

    const fetchResults: FetchResult[] = []
    let totalInserted = 0
    const sources = shuffleSources(await listRunnableNewsSources(supabase))

    for (const source of sources) {
      if (Date.now() - startedAt > FETCH_BUDGET_MS) break

      const result: FetchResult = {
        source: source.name,
        type: source.type,
        ok: false,
        fetched: 0,
        hardDropped: 0,
        dropReasons: {},
        dead: 0,
        inserted: 0,
      }

      try {
        const rawItems = await fetchSourceArticles(source)
        result.fetched = rawItems.length

        const { kept, dropped } = filterRelevantArticles(rawItems)
        result.hardDropped = dropped.length
        result.dropReasons = countDropReasons(dropped)

        let validItems = kept
        if (kept.length > 0) {
          const linkChecks = await checkLinks(
            kept.map((item) => item.url),
            5,
            6000,
          )
          const validUrls = new Set(linkChecks.filter((item) => item.ok).map((item) => item.url))
          validItems = kept.filter((item) => validUrls.has(item.url))
          result.dead = kept.length - validItems.length
        }

        if (validItems.length > 0) {
          const { data, error } = await supabase
            .from('articles')
            .upsert(toArticleRows(validItems), { onConflict: 'source,url', ignoreDuplicates: true })
            .select('id')

          if (error) {
            result.error = `Supabase: ${error.message}`
          } else {
            result.ok = true
            result.inserted = data?.length ?? 0
            totalInserted += result.inserted
          }
        } else {
          result.ok = true
        }
      } catch (error) {
        result.error = getErrorMessage(error)
      }

      fetchResults.push(result)
    }

    let llmResult: LlmQueueRunnerResult
    try {
      llmResult = await runLlmQueueBatch(supabase, {
        batchSize: LLM_BATCH_SIZE,
        concurrency: LLM_CONCURRENCY,
        articleTimeoutMs: ARTICLE_TIMEOUT_MS,
        includeNewSourceReview: true,
      })
    } catch (error) {
      llmResult = {
        ok: false,
        timestamp: new Date().toISOString(),
        total: 0,
        processed: 0,
        completed: 0,
        failed: 1,
        irrelevantDeleted: 0,
        skipped: 0,
        llmFailureMarked: 0,
        fallbackMarked: 0,
        remaining: 0,
        timedOut: false,
        firstError: getErrorMessage(error),
        results: [],
      }
    }

    const elapsed = Date.now() - startedAt
    const totalFetched = fetchResults.reduce((sum, result) => sum + result.fetched, 0)
    const totalHardDropped = fetchResults.reduce((sum, result) => sum + result.hardDropped, 0)
    const totalDead = fetchResults.reduce((sum, result) => sum + result.dead, 0)
    const processedCount = llmResult.completed
    const llmFailed = llmResult.failed
    const errorMessages = [
      ...fetchResults.filter((result) => result.error).map((result) => `[${result.source}] ${result.error}`),
      ...(llmResult.firstError ? [`[LLM] ${llmResult.firstError}`] : []),
    ]

    // 只有整体失败（全部信源都失败 或 LLM 完全失败）才标红；单个信源失败不影响整体状态
    const allFetchFailed = fetchResults.length > 0 && fetchResults.every((result) => !result.ok)
    const llmCompletelyFailed = llmResult.total > 0 && llmResult.completed === 0 && llmResult.failed > 0
    const isRealFailure = allFetchFailed || llmCompletelyFailed

    await updateCronLog(supabase, logId, {
      ended_at: new Date().toISOString(),
      fetch_total_fetched: totalFetched,
      fetch_total_inserted: totalInserted,
      llm_pending: llmResult.remaining,
      llm_processed: processedCount,
      llm_failed: llmFailed,
      status: isRealFailure ? 'error' : 'success',
      error_message: isRealFailure ? errorMessages.join('; ').slice(0, 1000) : null,
      details: {
        fetchResults,
        processResults: llmResult.results,
        elapsedMs: elapsed,
        fetchBudgetMs: FETCH_BUDGET_MS,
        llmBatchSize: LLM_BATCH_SIZE,
        llmConcurrency: LLM_CONCURRENCY,
        partialErrors: errorMessages.length > 0 ? errorMessages : null,
      },
    })

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      fetch: {
        totalFetched,
        totalBlocked: totalHardDropped,
        totalHardDropped,
        totalDead,
        totalInserted,
        results: fetchResults,
      },
      llm: {
        pending: llmResult.remaining,
        processed: processedCount,
        failed: llmFailed,
        results: llmResult.results,
      },
    })
  } catch (error) {
    const message = getErrorMessage(error)
    console.error('[fetch-and-process] 未捕获异常:', message)

    await updateCronLog(supabase, logId, {
      ended_at: new Date().toISOString(),
      status: 'error',
      error_message: message.slice(0, 1000),
      details: { stage: 'outer_catch', elapsedMs: Date.now() - startedAt },
    })

    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
})
