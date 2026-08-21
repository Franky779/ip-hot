import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { createArticleSearchPattern } from '@/lib/article-search'

export const dynamic = 'force-dynamic'

// 公开搜索接口：返回全球快讯中标题/中文标题/概述命中任一关键词的最新 10 条（多关键词结果合并去重）
// GET /api/articles/search?q=关键词&q=关键词2…
export async function GET(request: NextRequest) {
  const keywords = request.nextUrl.searchParams
    .getAll('q')
    .map(keyword => keyword.trim())
    .filter(Boolean)
    .slice(0, 5)
  if (keywords.length === 0) {
    return NextResponse.json({ articles: [] })
  }

  try {
    const supabase = getSupabase()
    const rows: Record<string, unknown>[] = []
    for (const keyword of keywords) {
      const pattern = createArticleSearchPattern(keyword)
      if (!pattern) continue
      try {
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
        if (!error && data) rows.push(...data)
      } catch {
        // 单个关键词查询失败不影响整体，继续下一个关键词
      }
    }

    // 按资讯 id 去重；没有 id 时按 URL 去重；按发布时间倒序，最多返回 10 条
    const seenIds = new Set<string>()
    const seenUrls = new Set<string>()
    const merged: Record<string, unknown>[] = []
    for (const article of rows) {
      const id = article.id != null ? String(article.id) : ''
      const url = typeof article.url === 'string' && article.url.trim() !== '' ? article.url : ''
      if (id) {
        if (seenIds.has(id)) continue
        seenIds.add(id)
      } else if (url) {
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
      }
      merged.push(article)
    }
    merged.sort((a, b) => String(b.published_at || b.created_at || '').localeCompare(String(a.published_at || a.created_at || '')))

    return NextResponse.json({ articles: merged.slice(0, 10) })
  } catch {
    // 数据库不可达（如本地无隧道）时返回空，前端回退到静态新闻列表
    return NextResponse.json({ articles: [] })
  }
}
