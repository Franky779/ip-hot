import { NextResponse } from 'next/server'
import { runLlmQueueBatch, type LlmQueueRunnerResult } from '@/lib/llm-queue-runner'
import { createServiceClient } from '@/lib/supabase'
import { withCronAuth } from '@/lib/withAdminAuth'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 20
const LLM_CONCURRENCY = 3
const ARTICLE_TIMEOUT_MS = 40_000
const SAFETY_MARGIN_MS = 10_000
const MAX_STALE_ROUNDS = 3

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emptyAggregate(): LlmQueueRunnerResult {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
    total: 0,
    processed: 0,
    completed: 0,
    failed: 0,
    irrelevantDeleted: 0,
    skipped: 0,
    llmFailureMarked: 0,
    fallbackMarked: 0,
    remaining: 0,
    timedOut: false,
    firstError: null,
    results: [],
  }
}

function mergeResults(aggregate: LlmQueueRunnerResult, round: LlmQueueRunnerResult): LlmQueueRunnerResult {
  return {
    ok: aggregate.ok && round.ok,
    timestamp: round.timestamp,
    total: aggregate.total + round.total,
    processed: aggregate.processed + round.processed,
    completed: aggregate.completed + round.completed,
    failed: aggregate.failed + round.failed,
    irrelevantDeleted: aggregate.irrelevantDeleted + round.irrelevantDeleted,
    skipped: aggregate.skipped + round.skipped,
    llmFailureMarked: aggregate.llmFailureMarked + round.llmFailureMarked,
    fallbackMarked: aggregate.fallbackMarked + round.fallbackMarked,
    remaining: round.remaining,
    timedOut: aggregate.timedOut || round.timedOut,
    firstError: aggregate.firstError || round.firstError,
    results: [...aggregate.results, ...round.results],
  }
}

export const GET = withCronAuth(async () => {
  const supabase = createServiceClient()
  const startedAt = Date.now()
  let aggregate = emptyAggregate()
  let lastRemaining = Number.MAX_SAFE_INTEGER
  let staleRounds = 0
  let rounds = 0

  try {
    while (Date.now() - startedAt < maxDuration * 1000 - SAFETY_MARGIN_MS) {
      rounds += 1
      const round = await runLlmQueueBatch(supabase, {
        batchSize: BATCH_SIZE,
        concurrency: LLM_CONCURRENCY,
        articleTimeoutMs: ARTICLE_TIMEOUT_MS,
        includeNewSourceReview: true,
      })

      aggregate = mergeResults(aggregate, round)

      if (round.total === 0 || round.remaining === 0) {
        break
      }

      if (round.remaining >= lastRemaining) {
        staleRounds += 1
        if (staleRounds >= MAX_STALE_ROUNDS) {
          aggregate.firstError = aggregate.firstError || `连续 ${MAX_STALE_ROUNDS} 轮队列未减少，已停止`
          break
        }
      } else {
        staleRounds = 0
      }

      lastRemaining = round.remaining
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      ...aggregate,
      rounds,
      elapsedMs: Date.now() - startedAt,
      message: aggregate.remaining === 0 ? 'Queue drained' : `Stopped with ${aggregate.remaining} remaining`,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 })
  }
})
