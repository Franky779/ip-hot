import { NextResponse } from 'next/server'
import { summarizeArticle } from '@/lib/llm'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 50
const CONCURRENCY = 5
const PENDING_CATEGORY = '待分类'
const REVIEW_CATEGORY = '待人工复核'

type PendingArticle = {
  id: string
  title: string
}

type Outcome = 'classified' | 'reviewed' | 'deleted' | 'failed'

async function processArticle(article: PendingArticle): Promise<Outcome> {
  const supabase = createServiceClient()
  const result = await summarizeArticle(article.title, '')

  if (!result) return 'failed'

  // Keep sensitive or ambiguous content out of the public stream and future auto-classification batches.
  if (result.category === PENDING_CATEGORY || (result.relevance_score >= 4 && result.relevance_score <= 5)) {
    const { error } = await supabase
      .from('articles')
      .update({
        title_cn: result.title_cn,
        summary_cn: result.summary_cn,
        category: REVIEW_CATEGORY,
        relevance_score: result.relevance_score,
        is_selected: false,
        commentary: result.commentary,
      })
      .eq('id', article.id)
    return error ? 'failed' : 'reviewed'
  }

  if (result.relevance_score <= 3) {
    const { error } = await supabase.from('articles').delete().eq('id', article.id)
    return error ? 'failed' : 'deleted'
  }

  const { error } = await supabase
    .from('articles')
    .update({
      title_cn: result.title_cn,
      summary_cn: result.summary_cn,
      category: result.category,
      relevance_score: result.relevance_score,
      is_selected: result.is_selected,
      commentary: result.commentary,
    })
    .eq('id', article.id)
  return error ? 'failed' : 'classified'
}

export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const lockCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { data: runningTask, error: runningError } = await supabase
    .from('cron_logs')
    .select('id')
    .eq('trigger_type', 'manual_pending_classification')
    .eq('status', 'running')
    .gte('started_at', lockCutoff)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runningError) return NextResponse.json({ error: runningError.message }, { status: 500 })
  if (runningTask) return NextResponse.json({ error: '已有待分类处理任务正在运行，请稍后刷新。' }, { status: 409 })

  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, title')
    .eq('category', PENDING_CATEGORY)
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!articles?.length) {
    return NextResponse.json({ ok: true, classified: 0, reviewed: 0, deleted: 0, failed: 0, remaining: 0 })
  }

  const { data: log, error: logError } = await supabase
    .from('cron_logs')
    .insert({
      trigger_type: 'manual_pending_classification',
      status: 'running',
      llm_pending: articles.length,
      details: { action: 'pending_classification', batch_total: articles.length },
    })
    .select('id')
    .single()

  if (logError || !log) return NextResponse.json({ error: logError?.message || '无法创建处理日志' }, { status: 500 })

  const counts: Record<Outcome, number> = { classified: 0, reviewed: 0, deleted: 0, failed: 0 }
  try {
    const pending = [...(articles as PendingArticle[])]
    while (pending.length > 0) {
      const group = pending.splice(0, CONCURRENCY)
      const results = await Promise.all(group.map(async (article) => {
        try {
          return await processArticle(article)
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
      llm_processed: counts.classified + counts.reviewed + counts.deleted,
      llm_failed: counts.failed,
      llm_pending: remaining ?? 0,
      details: { action: 'pending_classification', batch_total: articles.length, ...counts },
    }).eq('id', log.id)

    return NextResponse.json({ ok: true, ...counts, remaining: remaining ?? 0 })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('cron_logs').update({
      status: 'error',
      ended_at: new Date().toISOString(),
      llm_processed: counts.classified + counts.reviewed + counts.deleted,
      llm_failed: counts.failed,
      error_message: message,
      details: { action: 'pending_classification', batch_total: articles.length, ...counts },
    }).eq('id', log.id)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
