import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { NEW_SOURCE_NAMES } from '@/lib/sources'

export const runtime = 'nodejs'
export const maxDuration = 300

type ProcessResult = {
  id: string
  source: string
  title: string
  url: string
  ok: boolean
  score: number | null
  selected: boolean
  commentary: string
  status: 'scored' | 'failed' | 'unscored'
  error?: string
}

const BATCH_SIZE = 8
const RECENT_BATCH_SIZE = 6
const LOCK_MINUTES = 2

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const acceptedSecrets = [process.env.CRON_SECRET, process.env.LLM_WORKER_SECRET].filter(Boolean)
  if (acceptedSecrets.length === 0 || !acceptedSecrets.some((secret) => authHeader === `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 防止本地守护任务、手动处理和未来 Supabase Cron 同时领取同一批文章。
  const lockCutoff = new Date(Date.now() - LOCK_MINUTES * 60 * 1000).toISOString()
  const { data: runningTask } = await supabase
    .from('cron_logs')
    .select('id, trigger_type, started_at')
    .in('trigger_type', ['cron_llm', 'manual_llm'])
    .eq('status', 'running')
    .gte('started_at', lockCutoff)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runningTask) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'another_llm_worker_is_running',
      runningTask,
    })
  }

  const { data: logRecord, error: logError } = await supabase
    .from('cron_logs')
    .insert({
      trigger_type: 'cron_llm',
      status: 'running',
      llm_pending: 0,
      details: { action: 'background_llm', batch_total: 0 },
    })
    .select('id')
    .single()

  if (logError || !logRecord) {
    return NextResponse.json({ error: logError?.message || 'Failed to create worker log' }, { status: 500 })
  }

  const logId = logRecord.id

  // 6 条最新资讯保证时效，2 条最旧资讯持续消化历史积压。
  const [recentResult, oldestResult] = await Promise.all([
    supabase
      .from('articles')
      .select('id, title, url, source, published_at, created_at')
      .is('title_cn', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_BATCH_SIZE),
    supabase
      .from('articles')
      .select('id, title, url, source, published_at, created_at')
      .is('title_cn', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE - RECENT_BATCH_SIZE),
  ])

  const fetchError = recentResult.error || oldestResult.error
  if (fetchError) {
    await supabase.from('cron_logs').update({
      status: 'error',
      ended_at: new Date().toISOString(),
      error_message: `Fetch failed: ${fetchError.message}`,
    }).eq('id', logId)
    return NextResponse.json({ error: `Fetch failed: ${fetchError.message}` }, { status: 500 })
  }

  const articles = Array.from(
    new Map([...(recentResult.data || []), ...(oldestResult.data || [])].map((article) => [article.id, article])).values()
  )

  if (!articles || articles.length === 0) {
    await supabase.from('cron_logs').update({
      status: 'success',
      ended_at: new Date().toISOString(),
      llm_pending: 0,
      llm_processed: 0,
      llm_failed: 0,
      details: { action: 'background_llm', batch_total: 0 },
    }).eq('id', logId)
    return NextResponse.json({ ok: true, processed: 0, remaining: 0, message: 'No pending articles' })
  }

  await supabase.from('cron_logs').update({
    llm_pending: articles.length,
    details: { action: 'background_llm', batch_total: articles.length },
  }).eq('id', logId)

  // 并行调用 LLM + 并行更新数据库
  const results: ProcessResult[] = await Promise.all(
    articles.map(async (article): Promise<ProcessResult> => {
      try {
        const llmResult = await summarizeArticle(article.title, '')

        if (!llmResult) {
          // LLM 未配置或调用失败 → 降级
          const { error: updateError } = await supabase
            .from('articles')
            .update({
              title_cn: article.title.slice(0, 60),
              summary_cn: '',
              category: null,
              relevance_score: null,
              is_selected: false,
              commentary: null,
            })
            .eq('id', article.id)

          return {
            id: article.id, source: article.source, title: article.title, url: article.url,
            ok: !updateError, score: null, selected: false, commentary: '',
            status: updateError ? 'failed' : 'unscored', error: updateError?.message,
          }
        }

        // 新增信源的文章强制归类为"待分类"，等人工审核
        const isNewSource = NEW_SOURCE_NAMES.has(article.source)
        const finalCategory = isNewSource ? '待分类' : llmResult.category
        const finalIsSelected = isNewSource ? false : llmResult.is_selected

        const { error: updateError } = await supabase
          .from('articles')
          .update({
            title_cn: llmResult.title_cn,
            summary_cn: llmResult.summary_cn,
            category: finalCategory,
            relevance_score: llmResult.relevance_score,
            is_selected: finalIsSelected,
            commentary: llmResult.commentary,
          })
          .eq('id', article.id)

        return {
          id: article.id, source: article.source, title: article.title, url: article.url,
          ok: !updateError,
          score: updateError ? null : llmResult.relevance_score,
          selected: updateError ? false : finalIsSelected,
          commentary: updateError ? '' : llmResult.commentary,
          status: updateError ? 'failed' : 'scored',
          error: updateError?.message,
        }
      } catch (e) {
        return {
          id: article.id, source: article.source, title: article.title, url: article.url,
          ok: false, score: null, selected: false, commentary: '', status: 'failed',
          error: e instanceof Error ? e.message : String(e),
        }
      }
    })
  )

  const okCount = results.filter((r) => r.ok).length
  const failedCount = articles.length - okCount
  const firstError = results.find((result) => result.error)?.error || null
  const { count: remaining } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .is('title_cn', null)

  await supabase.from('cron_logs').update({
    status: failedCount === 0 ? 'success' : 'error',
    ended_at: new Date().toISOString(),
    llm_pending: remaining ?? 0,
    llm_processed: okCount,
    llm_failed: failedCount,
    error_message: firstError,
    details: {
      action: 'background_llm',
      batch_total: articles.length,
      recent_slots: RECENT_BATCH_SIZE,
      backlog_slots: BATCH_SIZE - RECENT_BATCH_SIZE,
      qualityResults: results,
    },
  }).eq('id', logId)

  return NextResponse.json({
    ok: failedCount === 0,
    timestamp: new Date().toISOString(),
    total: articles.length,
    processed: okCount,
    failed: failedCount,
    remaining: remaining ?? 0,
    results,
  })
}
