import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle, type LlmFailureKind } from '@/lib/llm'
import { sendFeishuAlertAggregated } from '@/lib/feishu-alert'
import { resolveClassificationResult, autoCleanupLowScore } from '@/lib/pending-classification'
import { applyOfficialSourcePolicy, loadVerifiedOfficialXNames } from '@/lib/source-trust'
import { getSelectionThreshold, onlyArticlesAwaitingInitialLlm } from '@/lib/selection-threshold'
import { markContentBlocked } from '@/lib/content-blocked'

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
  status: 'scored' | 'failed' | 'unscored' | 'blocked'
  error?: string
  llmErrorKind?: LlmFailureKind
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
  const verifiedOfficialXNames = await loadVerifiedOfficialXNames(supabase)
  const selectionThreshold = await getSelectionThreshold(supabase)

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
    onlyArticlesAwaitingInitialLlm(
      supabase
        .from('articles')
        .select('id, title, url, source, published_at, created_at'),
    )
      .order('created_at', { ascending: false })
      .limit(RECENT_BATCH_SIZE),
    onlyArticlesAwaitingInitialLlm(
      supabase
        .from('articles')
        .select('id, title, url, source, published_at, created_at'),
    )
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
        const llmOutcome = await summarizeArticle(article.title, '')

        if (!llmOutcome.ok) {
          // 区分「内容拦截」与「真故障」：
          //   - content_blocked：写终态（待人工复核），脱队，终止死循环（2026-09-05 阶段 2）
          //   - outage：不写库，保持 title_cn IS NULL，下一轮自动重试
          if (llmOutcome.kind === 'content_blocked') {
            const marked = await markContentBlocked(supabase, { id: article.id, title: article.title })
            return {
              id: article.id, source: article.source, title: article.title, url: article.url,
              ok: marked.ok,
              score: null, selected: false, commentary: '',
              status: marked.ok ? 'blocked' : 'failed',
              error: marked.ok ? 'CONTENT_BLOCKED' : marked.error,
              llmErrorKind: llmOutcome.kind,
            }
          }
          // outage（真故障）：不写库，标记 failed 以便监控，下一轮重试
          return {
            id: article.id, source: article.source, title: article.title, url: article.url,
            ok: false, score: null, selected: false, commentary: '',
            status: 'failed',
            error: 'ALL_LLM_PROVIDERS_EXHAUSTED',
            llmErrorKind: llmOutcome.kind,
          }
        }

        const llmResult = llmOutcome.result

        const policy = applyOfficialSourcePolicy({
          relevance_score: llmResult.relevance_score,
          is_selected: llmResult.is_selected,
          safety_blocked: llmResult.safety_blocked,
          trusted_official_x: verifiedOfficialXNames.has(article.source),
        })
        if (policy.action === 'delete') {
          const { error: deleteError } = await supabase.from('articles').delete().eq('id', article.id)
          if (deleteError) throw new Error(deleteError.message)
          return { id: article.id, source: article.source, title: article.title, url: article.url, ok: true, score: 0, selected: false, commentary: '', status: 'scored' }
        }
        const classification = verifiedOfficialXNames.has(article.source)
          ? { category: llmResult.category, is_selected: true }
          : resolveClassificationResult({ ...llmResult, relevance_score: policy.relevance_score, is_selected: policy.relevance_score >= selectionThreshold }, selectionThreshold)
        const { error: updateError } = await supabase
          .from('articles')
          .update({
            title_cn: llmResult.title_cn,
            summary_cn: llmResult.summary_cn,
            category: classification.category,
            relevance_score: policy.relevance_score,
            selection_threshold: selectionThreshold,
            is_selected: classification.is_selected,
            commentary: llmResult.commentary,
          })
          .eq('id', article.id)

        return {
          id: article.id, source: article.source, title: article.title, url: article.url,
          ok: !updateError,
          score: updateError ? null : policy.relevance_score,
          selected: updateError ? false : classification.is_selected,
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
  const { count: remaining } = await onlyArticlesAwaitingInitialLlm(
    supabase
      .from('articles')
      .select('*', { count: 'exact', head: true }),
  )

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

  // 集中告警：同一批次只发一条；仅「真故障」（outage）触发，内容安全拦截静默，避免批量失败逐篇刷屏。
  const outageCount = results.filter((r) => r.llmErrorKind === 'outage').length
  const blockedCount = results.filter((r) => r.llmErrorKind === 'content_blocked').length
  if (outageCount > 0) {
    const sampleError = results.find((r) => r.llmErrorKind === 'outage')?.error ?? 'unknown'
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    await sendFeishuAlertAggregated(
      `【IP-HOT告警】LLM 真故障 ${outageCount} 篇未能打分（本批 ${articles.length} 篇${blockedCount > 0 ? `，另有 ${blockedCount} 篇为内容拦截已静默跳过` : ''}）。示例错误: ${sampleError}。请检查余额/Key/并发。时间：${time}`,
    )
  }

  // 自动清理评分≤4的非官号资讯
  const cleaned = await autoCleanupLowScore(supabase)
  if (cleaned > 0) console.log(`[process-llm] auto-cleaned ${cleaned} low-score articles`)

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
