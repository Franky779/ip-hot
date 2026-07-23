import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { shouldIgnoreArticle, summarizeArticle } from '@/lib/llm'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const authHeader = request.headers.get('x-admin-password')
  if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const BATCH_SIZE = 3  // Vercel 60s 上限内处理 3 条（每条约 10-15s），留足安全余量

  const { data: pending, error } = await supabase
    .from('articles')
    .select('id, title, url, source')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const batchTotal = pending?.length ?? 0
  if (!batchTotal) return NextResponse.json({ ok: true, processed: 0 })

  // === 第一阶段：写入 running 日志 ===
  const { data: logRecord, error: logErr } = await supabase
    .from('cron_logs')
    .insert({
      trigger_type: 'manual_llm',
      status: 'running',
      llm_pending: batchTotal,
      details: { batch_total: batchTotal, action: 'manual_llm' },
    })
    .select('id')
    .single()

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 500 })

  const logId = logRecord.id

  // === 安全超时守护：45秒后若仍未完成，强制更新日志并返回 ===
  let completed = false
  const timeoutGuard = setTimeout(async () => {
    if (completed) return
    try {
      await supabase.from('cron_logs').update({
        status: 'error',
        ended_at: new Date().toISOString(),
        error_message: 'Vercel函数即将超时，任务被安全终止',
        details: { timeout_reason: 'vercel_60s_guard', batch_total: batchTotal },
      }).eq('id', logId)
    } catch {}
  }, 45000)

  // === 第二阶段：并发处理 ===
  // 全部并行跑 LLM + 数据库更新，3 条约 30-45s
  const results = await Promise.allSettled(
    pending.map(async (article) => {
      const result = await summarizeArticle(article.title, '')
      if (!result) throw new Error('No LLM provider is configured')
      if (shouldIgnoreArticle(result.relevance_score, result.commentary)) {
        // 删除失败时改为标记为已忽略，避免同一批文章反复进入队列空转
        const { error: deleteError } = await supabase.from('articles').delete().eq('id', article.id)
        if (deleteError) {
          console.warn('[process-llm] 删除无关文章失败，改为标记为已忽略:', deleteError.message, 'articleId:', article.id)
          const { error: markError } = await supabase.from('articles').update({
            title_cn: article.title.slice(0, 60),
            summary_cn: '',
            category: '待分类',
            relevance_score: 0,
            is_selected: false,
            commentary: '',
          }).eq('id', article.id)
          if (markError) {
            console.error('[process-llm] 标记已忽略也失败:', markError.message)
            throw new Error(`删除并标记无关文章均失败: ${deleteError.message}; ${markError.message}`)
          }
        }
        return {
          status: 'scored' as const,
          discarded: true,
          source: article.source,
          title: article.title,
          url: article.url,
          score: result.relevance_score,
          selected: false,
          commentary: result.commentary,
        }
      }
      const { error: upErr } = await supabase
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
      if (upErr) throw new Error(upErr.message)
      return {
        status: 'scored' as const,
        discarded: false,
        source: article.source,
        title: article.title,
        url: article.url,
        score: result.relevance_score,
        selected: result.is_selected,
        commentary: result.commentary,
      }
    })
  )

  // 标记处理已完成，取消超时守护
  completed = true
  clearTimeout(timeoutGuard)

  let processed = 0
  let failed = 0
  let irrelevantDeleted = 0
  let firstError: string | null = null

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const v = r.value
      if (v.discarded) { irrelevantDeleted++; continue }
      processed++
    } else {
      const msg = (r.reason instanceof Error ? r.reason.message : String(r.reason)).slice(0, 200)
      if (!firstError) firstError = msg
      failed++
    }
  }

  try {
    // 查剩余队列
    const { count: remaining } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .is('title_cn', null)

    // === 第三阶段：更新日志为 success ===
    await supabase.from('cron_logs').update({
      status: 'success',
      ended_at: new Date().toISOString(),
      llm_processed: processed,
      llm_failed: failed,
      llm_pending: remaining ?? 0,
      details: {
        batch_total: batchTotal,
        batch_processed: processed,
        batch_failed: failed,
        batch_irrelevant_deleted: irrelevantDeleted,
        first_error: firstError,
        action: 'manual_llm',
        qualityResults: results.map((result, index) => result.status === 'fulfilled'
          ? result.value
          : {
              status: 'failed',
              source: pending[index].source,
              title: pending[index].title,
              url: pending[index].url,
              score: null,
              selected: false,
              commentary: '',
            }),
      },
    }).eq('id', logId)

    return NextResponse.json({ ok: true, processed, failed, remaining: remaining ?? 0, irrelevantDeleted, firstError })
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('cron_logs').update({
      status: 'error',
      ended_at: new Date().toISOString(),
      llm_processed: processed,
      llm_failed: failed,
      error_message: msg,
      details: {
        batch_total: batchTotal,
        batch_processed: processed,
        batch_failed: failed,
        first_error: firstError,
        action: 'manual_llm',
        qualityResults: results.map((result, index) => result.status === 'fulfilled'
          ? result.value
          : {
              status: 'failed',
              source: pending[index].source,
              title: pending[index].title,
              url: pending[index].url,
              score: null,
              selected: false,
              commentary: '',
            }),
      },
    }).eq('id', logId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
