import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { REVIEW_CATEGORY } from '@/lib/categories'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_SIZE = 20

type ArticleRow = {
  id: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  category: string | null
  relevance_score: number | null
  commentary: string | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function POST(request: Request) {
  try {
    const denied = requireAdmin(request)
    if (denied) return denied

    const supabase = createServiceClient()

    const { data: rows, error: fetchError } = await supabase
      .from('articles')
      .select('id, title, title_cn, summary_cn, category, relevance_score, commentary')
      .eq('category', REVIEW_CATEGORY)
      .gte('relevance_score', 4)
      .not('title_cn', 'is', null)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE)

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 500 })
    }

    const articles = (rows || []) as ArticleRow[]
    if (articles.length === 0) {
      return NextResponse.json({ ok: true, message: '没有需要重新分类的待分类文章', results: [] })
    }

    const results: Array<{
      id: string
      title: string
      oldCategory: string | null
      oldScore: number | null
      newCategory: string
      newScore: number
      newSelected: boolean
      commentary: string
    }> = []

    for (const article of articles) {
      try {
        const llmResult = await summarizeArticle(article.title, article.summary_cn || article.title)
        if (!llmResult) {
          results.push({
            id: article.id,
            title: article.title,
            oldCategory: article.category,
            oldScore: article.relevance_score,
            newCategory: REVIEW_CATEGORY,
            newScore: article.relevance_score ?? 0,
            newSelected: false,
            commentary: 'LLM 无响应',
          })
          continue
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

        if (updateError) {
          results.push({
            id: article.id,
            title: article.title,
            oldCategory: article.category,
            oldScore: article.relevance_score,
            newCategory: llmResult.category,
            newScore: llmResult.relevance_score,
            newSelected: llmResult.is_selected,
            commentary: `更新失败: ${updateError.message}`,
          })
          continue
        }

        results.push({
          id: article.id,
          title: article.title,
          oldCategory: article.category,
          oldScore: article.relevance_score,
          newCategory: llmResult.category,
          newScore: llmResult.relevance_score,
          newSelected: llmResult.is_selected,
          commentary: llmResult.commentary,
        })
      } catch (error) {
        results.push({
          id: article.id,
          title: article.title,
          oldCategory: article.category,
          oldScore: article.relevance_score,
          newCategory: REVIEW_CATEGORY,
          newScore: article.relevance_score ?? 0,
          newSelected: false,
          commentary: `分类失败: ${getErrorMessage(error)}`,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      processed: results.length,
      results,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 })
  }
}
