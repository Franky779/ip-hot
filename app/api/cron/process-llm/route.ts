import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'

export const runtime = 'nodejs'
export const maxDuration = 300

type ProcessResult = {
  id: string
  ok: boolean
  error?: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // Vercel Hobby plan 函数超时 10 秒，LLM 每次调用 2-5 秒
  // 并行处理 3 条，总时间约 3-7 秒，在限制内
  const BATCH_SIZE = 3

  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, title, url, published_at')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(BATCH_SIZE)

  if (fetchError) {
    return NextResponse.json(
      { error: `Fetch failed: ${fetchError.message}` },
      { status: 500 }
    )
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending articles' })
  }

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

          return { id: article.id, ok: !updateError, error: updateError?.message }
        }

        const { error: updateError } = await supabase
          .from('articles')
          .update({
            title_cn: llmResult.title_cn,
            summary_cn: llmResult.summary_cn,
            category: llmResult.category,
            relevance_score: llmResult.relevance_score,
            is_selected: llmResult.is_selected,
            commentary: llmResult.commentary,
          })
          .eq('id', article.id)

        return { id: article.id, ok: !updateError, error: updateError?.message }
      } catch (e) {
        return { id: article.id, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    })
  )

  const okCount = results.filter((r) => r.ok).length

  return NextResponse.json({
    ok: okCount === articles.length,
    timestamp: new Date().toISOString(),
    total: articles.length,
    processed: okCount,
    failed: articles.length - okCount,
    results,
  })
}
