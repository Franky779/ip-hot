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

  // 先查总数（custom QueryBuilder 的 count 需要 head:true）
  let countQuery = supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('category', '待人工复核')
    .not('title_cn', 'is', null)

  if (queryText) {
    countQuery = countQuery.or(`title.ilike.%${queryText}%,title_cn.ilike.%${queryText}%`)
  }

  const { count } = await countQuery

  // 再查分页数据
  let dataQuery = supabase
    .from('articles')
    .select(
      'id, source, url, title, title_cn, summary_cn, commentary, category, relevance_score, published_at, created_at'
    )
    .eq('category', '待人工复核')
    .not('title_cn', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (queryText) {
    dataQuery = dataQuery.or(`title.ilike.%${queryText}%,title_cn.ilike.%${queryText}%`)
  }

  const { data, error } = await dataQuery
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const total = count ?? 0

  return NextResponse.json({
    articles: data ?? [],
    total,
    page,
    hasMore: offset + (data?.length ?? 0) < total,
  })
}
