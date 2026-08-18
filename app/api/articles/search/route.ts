import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { createArticleSearchPattern } from '@/lib/article-search'

export const dynamic = 'force-dynamic'

// 公开搜索接口：返回全球快讯中标题/中文标题/概述命中关键词的最新 10 条
// GET /api/articles/search?q=关键词
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const pattern = q ? createArticleSearchPattern(q) : null
  if (!pattern) {
    return NextResponse.json({ articles: [] })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('articles')
      .select('id, source, url, title, title_cn, summary_cn, category, published_at, created_at')
      .not('title_cn', 'is', null)
      .not('summary_cn', 'is', null)
      .not('category', 'is', null)
      .not('commentary', 'is', null)
      .neq('commentary', '')
      .neq('category', '待分类')
      .neq('category', '待人工复核')
      .orIlike(['title', 'title_cn', 'summary_cn'], pattern)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(10)

    if (error) {
      return NextResponse.json({ articles: [] })
    }
    return NextResponse.json({ articles: data ?? [] })
  } catch {
    // 数据库不可达（如本地无隧道）时返回空，前端回退到静态新闻列表
    return NextResponse.json({ articles: [] })
  }
}
