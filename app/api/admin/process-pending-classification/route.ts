import { NextResponse } from 'next/server'
import { summarizeArticle } from '@/lib/llm'
import { applyOfficialSourcePolicy, loadVerifiedOfficialXNames } from '@/lib/source-trust'
import { createServiceClient } from '@/lib/supabase'
import {
  FILTERED_CATEGORY,
  getPendingClassificationOutcome,
  PENDING_CATEGORY,
  REVIEW_CATEGORY,
  autoCleanupLowScore,
} from '@/lib/pending-classification'
import { getSelectionThreshold } from '@/lib/selection-threshold'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 50
const CONCURRENCY = 5
type PendingArticle = {
  id: string
  title: string
  source: string
}

type Outcome = 'classified' | 'reviewed' | 'filtered' | 'failed'

async function processArticle(article: PendingArticle, verifiedOfficialXNames: Set<string>, selectionThreshold: number): Promise<Outcome> {
  const supabase = createServiceClient()
  const result = await summarizeArticle(article.title, '')

  if (!result) return 'failed'

  const policy = applyOfficialSourcePolicy({ relevance_score: result.relevance_score, is_selected: result.is_selected, safety_blocked: result.safety_blocked, trusted_official_x: verifiedOfficialXNames.has(article.source) })
  if (policy.action === 'delete') {
    const { error } = await supabase.from('articles').delete().eq('id', article.id)
    return error ? 'failed' : 'filtered'
  }
  const outcome = getPendingClassificationOutcome({ ...result, relevance_score: policy.relevance_score }, selectionThreshold)

  // Keep sensitive or ambiguous content out of the public stream and future auto-classification batches.
  if (outcome === 'reviewed') {
    const { error } = await supabase
      .from('articles')
      .update({
        title_cn: result.title_cn,
        summary_cn: result.summary_cn,
        category: REVIEW_CATEGORY,
        relevance_score: policy.relevance_score,
        selection_threshold: selectionThreshold,
        is_selected: false,
        commentary: result.commentary,
      })
      .eq('id', article.id)
    return error ? 'failed' : 'reviewed'
  }

  if (outcome === 'filtered') {
    const { error } = await supabase
      .from('articles')
      .update({
        category: FILTERED_CATEGORY,
        selection_threshold: selectionThreshold,
        is_selected: false,
      })
      .eq('id', article.id)
    return error ? 'failed' : 'filtered'
  }

  const { error } = await supabase
    .from('articles')
    .update({
      title_cn: result.title_cn,
      summary_cn: result.summary_cn,
      category: result.category,
      relevance_score: policy.relevance_score,
      selection_threshold: selectionThreshold,
      is_selected: policy.is_selected && policy.relevance_score >= selectionThreshold,
      commentary: result.commentary,
    })
    .eq('id', article.id)
  return error ? 'failed' : 'classified'
}

export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  const authHeader = request.headers.get('authorization')
  const acceptedSecrets = [process.env.CRON_SECRET, process.env.LLM_WORKER_SECRET].filter(Boolean)
  const isWorker = acceptedSecrets.some((secret) => authHeader === `Bearer ${secret}`)
  if ((!password || password !== process.env.ADMIN_PASSWORD) && !isWorker) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const lockCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: runningTask, error: runningError } = await supabase
    .from('cron_logs')
    .select('id')
    .in('trigger_type', ['manual_pending_classification', 'cron_pending_classification'])
    .eq('status', 'running')
    .gte('started_at', lockCutoff)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runningError) return NextResponse.json({ error: runningError.message }, { status: 500 })
  if (runningTask) return NextResponse.json({ error: '已有待分类处理任务正在运行，请稍后刷新。' }, { status: 409 })

  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, title, source')
    .eq('category', PENDING_CATEGORY)
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!articles?.length) {
    return NextResponse.json({ ok: true, classified: 0, reviewed: 0, filtered: 0, failed: 0, remaining: 0 })
  }

  const verifiedOfficialXNames = await loadVerifiedOfficialXNames(supabase)
  const selectionThreshold = await getSelectionThreshold(supabase)

  const { data: log, error: logError } = await supabase
    .from('cron_logs')
    .insert({
    trigger_type: isWorker ? 'cron_pending_classification' : 'manual_pending_classification',
      status: 'running',
      llm_pending: articles.length,
      details: { action: 'pending_classification', batch_total: articles.length },
    })
    .select('id')
    .single()

  if (logError || !log) return NextResponse.json({ error: logError?.message || '无法创建处理日志' }, { status: 500 })

  const counts: Record<Outcome, number> = { classified: 0, reviewed: 0, filtered: 0, failed: 0 }
  try {
    const pending = [...(articles as PendingArticle[])]
    while (pending.length > 0) {
      const group = pending.splice(0, CONCURRENCY)
      const results = await Promise.all(group.map(async (article) => {
        try {
          return await processArticle(article, verifiedOfficialXNames, selectionThreshold)
        } catch {
          return 'failed' as const
        }
      }))
      results.forEach((outcome) => { counts[outcome] += 1 })
    }

    const { count: remaining, error: countError } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('category', PENDING_CATEGORY)
      .not('title_cn', 'is', null)
      .not('summary_cn', 'is', null)
    if (countError) throw new Error(countError.message)

    await supabase.from('cron_logs').update({
      status: counts.failed === 0 ? 'success' : 'error',
      ended_at: new Date().toISOString(),
      llm_processed: counts.classified + counts.reviewed + counts.filtered,
      llm_failed: counts.failed,
      llm_pending: remaining ?? 0,
      details: { action: 'pending_classification', batch_total: articles.length, ...counts },
    }).eq('id', log.id)

    // 自动清理评分≤4的非官号资讯
    const cleaned = await autoCleanupLowScore(supabase)
    if (cleaned > 0) console.log(`[process-pending-classification] auto-cleaned ${cleaned} low-score articles`)

    return NextResponse.json({ ok: true, ...counts, remaining: remaining ?? 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('cron_logs').update({
      status: 'error',
      ended_at: new Date().toISOString(),
      llm_processed: counts.classified + counts.reviewed + counts.filtered,
      llm_failed: counts.failed,
      error_message: message,
      details: { action: 'pending_classification', batch_total: articles.length, ...counts },
    }).eq('id', log.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
