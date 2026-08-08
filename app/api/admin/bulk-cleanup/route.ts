import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET: 统计待删除数量
export async function GET(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { rows } = await supabase.query(
    `SELECT count(*)::integer AS count FROM articles WHERE category = '待人工复核' AND relevance_score <= 4 AND source NOT ILIKE '官号%'`
  )

  return NextResponse.json({ count: rows[0]?.count ?? 0 })
}

// POST: 执行批量删除（软删除：category → 已过滤）
export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  const { rowCount } = await supabase.query(
    `UPDATE articles SET category = '已过滤', is_selected = false WHERE category = '待人工复核' AND relevance_score <= 4 AND source NOT ILIKE '官号%'`
  )

  return NextResponse.json({ updated: rowCount })
}
