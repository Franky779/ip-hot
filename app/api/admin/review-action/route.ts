import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { extractKeywords } from '@/lib/classification-learning'

export const runtime = 'nodejs'

const VALID_ACTIONS = ['select', 'delete', 'reclassify'] as const
type ReviewAction = (typeof VALID_ACTIONS)[number]

export async function POST(request: Request) {
  const pw = request.headers.get('x-admin-password') || ''
  const expectedPw = process.env.ADMIN_PASSWORD || ''
  if (!expectedPw || pw !== expectedPw) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      id,
      action,
      newCategory,
    }: {
      id: string
      action: ReviewAction
      newCategory?: string
    } = body

    if (!id || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Missing or invalid id/action' }, { status: 400 })
    }

    if (action === 'reclassify' && (!newCategory || typeof newCategory !== 'string')) {
      return NextResponse.json({ error: 'reclassify requires newCategory' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // 1. 先查出文章的原始信息（用来写学习记录）
    const { data: article } = await supabase
      .from('articles')
      .select('title_cn, category')
      .eq('id', id)
      .maybeSingle()

    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const originalCategory = article.category || '待人工复核'
    const originalTitle = article.title_cn || ''

    // 2. 根据 action 更新文章
    let updateData: Record<string, unknown> = {}
    let correctedCategory: string

    if (action === 'select') {
      updateData = { is_selected: true }
      correctedCategory = originalCategory === '待人工复核' ? '已分类' : originalCategory
    } else if (action === 'delete') {
      updateData = { category: '已过滤', is_selected: false }
      correctedCategory = '已过滤'
    } else {
      // reclassify
      updateData = { category: newCategory!, is_selected: false }
      correctedCategory = newCategory!
    }

    const { error: updateError } = await supabase
      .from('articles')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('[ReviewAction] 更新文章失败:', updateError.message)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 3. 写入学习记录
    const keywords = extractKeywords(originalTitle)

    const { data: existing } = await supabase
      .from('classification_learnings')
      .select('id, match_count')
      .eq('article_id', id)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('classification_learnings')
        .update({
          corrected_category: correctedCategory,
          title_keywords: keywords,
          match_count: (existing.match_count || 1) + 1,
          is_active: true,
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('classification_learnings')
        .insert({
          article_id: id,
          original_title: originalTitle.slice(0, 200),
          original_category: originalCategory,
          corrected_category: correctedCategory,
          title_keywords: keywords,
          match_count: 1,
          is_active: true,
        })
    }

    return NextResponse.json({ ok: true, action, correctedCategory })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[ReviewAction] 异常:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
