import { NextResponse } from 'next/server'
import { summarizeArticle, shouldIgnoreArticle } from '@/lib/llm'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BATCH_SIZE = 8

type Article = {
  id: string
  title: string
  title_cn: string | null
  summary_cn: string | null
  category: string | null
}

type ProcessResult = {
  id: string
  status: 'published' | 'hidden' | 'pending' | 'deleted' | 'skipped' | 'failed'
  error?: string
}

function isFallbackResult(result: Awaited<ReturnType<typeof summarizeArticle>>) {
  return (
    result?.category === '待分类' &&
    result.relevance_score === 5 &&
    result.summary_cn === '' &&
    result.commentary === '待人工编辑'
  )
}

export async function GET(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('mode') !== 'unprocessed') {
    return NextResponse.json({ error: 'Unsupported mode' }, { status: 400 })
  }

  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const pageSize = 500
  const offset = (page - 1) * pageSize
  const supabase = createServiceClient()
  const { data, count, error } = await supabase
    .from('articles')
    .select('id', { count: 'exact' })
    .is('title_cn', null)
    .order('created_at', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (error) {
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 })
  }

  return NextResponse.json({
    articles: data ?? [],
    total: count ?? 0,
    page,
    hasMore: offset + (data?.length ?? 0) < (count ?? 0),
  })
}

export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const rawIds =
    body && typeof body === 'object' && 'ids' in body
      ? (body as { ids?: unknown }).ids
      : null

  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  }

  const ids = Array.from(
    new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
  )

  if (ids.length === 0 || ids.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `ids must contain 1-${MAX_BATCH_SIZE} unique article IDs` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, title_cn, summary_cn, category')
    .in('id', ids)

  if (error) {
    return NextResponse.json({ error: 'Failed to load articles' }, { status: 500 })
  }

  const articles = ((data ?? []) as Article[]).filter(
    (article) => article.title_cn === null || article.category === '待分类'
  )
  const foundIds = new Set(articles.map((article) => article.id))
  const skippedResults: ProcessResult[] = ids
    .filter((id) => !foundIds.has(id))
    .map((id) => ({ id, status: 'skipped' }))

  const processedResults = await Promise.all(
    articles.map(async (article): Promise<ProcessResult> => {
      try {
        const result = await summarizeArticle(article.title, article.summary_cn ?? '')
        if (!result || isFallbackResult(result)) {
          return { id: article.id, status: 'failed', error: 'LLM request failed' }
        }

        if (shouldIgnoreArticle(result.relevance_score, result.commentary)) {
          let deleteQuery = supabase
            .from('articles')
            .delete()
            .eq('id', article.id)
          deleteQuery = article.title_cn === null
            ? deleteQuery.is('title_cn', null)
            : deleteQuery.eq('category', '待分类')
          const { error: deleteError } = await deleteQuery

          if (deleteError) throw deleteError
          return { id: article.id, status: 'deleted' }
        }

        let updateQuery = supabase
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
        updateQuery = article.title_cn === null
          ? updateQuery.is('title_cn', null)
          : updateQuery.eq('category', '待分类')
        const { error: updateError } = await updateQuery

        if (updateError) throw updateError

        if (result.category === '待分类') {
          return { id: article.id, status: 'pending' }
        }

        return {
          id: article.id,
          status: result.relevance_score >= 7 ? 'published' : 'hidden',
        }
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason)
        return { id: article.id, status: 'failed', error: message.slice(0, 160) }
      }
    })
  )

  const results = [...processedResults, ...skippedResults]
  const count = (status: ProcessResult['status']) =>
    results.filter((result) => result.status === status).length

  return NextResponse.json({
    ok: count('failed') === 0,
    total: ids.length,
    published: count('published'),
    hidden: count('hidden'),
    pending: count('pending'),
    deleted: count('deleted'),
    skipped: count('skipped'),
    failed: count('failed'),
    results,
  })
}
