import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export async function GET(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const queryText = (url.searchParams.get('q') || '').trim()
  const offset = (page - 1) * PAGE_SIZE

  const supabase = createServiceClient()
  let query = supabase
    .from('articles')
    .select(
      'id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at, created_at',
      { count: 'exact' }
    )
    .eq('category', '待分类')
    .not('title_cn', 'is', null)
    .not('summary_cn', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (queryText) {
    query = query.or(`title.ilike.%${queryText}%,title_cn.ilike.%${queryText}%`)
  }

  const { data, count, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    articles: data ?? [],
    total: count ?? 0,
    page,
    hasMore: offset + (data?.length ?? 0) < (count ?? 0),
  })
}
