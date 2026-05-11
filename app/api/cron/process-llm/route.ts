import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5min，LLM批量处理可能需要较长时间

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

  // 1. 拉取未处理的新闻（title_cn 为 null，按时间倒序，每次最多处理 15 条）
  const { data: articles, error: fetchError } = await supabase
    .from('articles')
    .select('id, title, url, published_at')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(15)

  if (fetchError) {
    return NextResponse.json(
      { error: `Fetch failed: ${fetchError.message}` },
      { status: 500 }
    )
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No pending articles' })
  }

  // 2. 逐条调用 LLM 摘要
  const results: ProcessResult[] = []
  for (const article of articles) {
    const result: ProcessResult = { id: article.id, ok: false }

    try {
      const llmResult = await summarizeArticle(article.title, '')

      if (!llmResult) {
        // LLM 未配置或调用失败 → 降级：原标题前60字当摘要
        const { error: updateError } = await supabase
          .from('articles')
          .update({
            title_cn: article.title.slice(0, 60),
            summary_cn: '',
            category: null,
            relevance_score: null,
            is_selected: false,
          })
          .eq('id', article.id)

        if (updateError) {
          result.error = `Update fallback failed: ${updateError.message}`
        } else {
          result.ok = true
        }
      } else {
        const { error: updateError } = await supabase
          .from('articles')
          .update({
            title_cn: llmResult.title_cn,
            summary_cn: llmResult.summary_cn,
            category: llmResult.category,
            relevance_score: llmResult.relevance_score,
            is_selected: llmResult.is_selected,
          })
          .eq('id', article.id)

        if (updateError) {
          result.error = `Update failed: ${updateError.message}`
        } else {
          result.ok = true
        }
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }

    results.push(result)
  }

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
