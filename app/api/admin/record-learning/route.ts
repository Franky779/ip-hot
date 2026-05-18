import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { extractKeywords } from '@/lib/classification-learning'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const pw = request.headers.get('x-admin-password') || ''
  const expectedPw = process.env.ADMIN_PASSWORD || ''
  if (!expectedPw || pw !== expectedPw) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      article_id,
      original_title,
      original_category,
      corrected_category,
    }: {
      article_id: string
      original_title: string
      original_category: string | null
      corrected_category: string
    } = body

    if (!article_id || !corrected_category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const keywords = extractKeywords(original_title)

    // 先查是否已有相同 article_id 的学习记录
    const { data: existing } = await supabase
      .from('classification_learnings')
      .select('id, match_count')
      .eq('article_id', article_id)
      .single()

    if (existing) {
      // 更新已有记录（match_count +1）
      const { error } = await supabase
        .from('classification_learnings')
        .update({
          corrected_category,
          title_keywords: keywords,
          match_count: (existing.match_count || 1) + 1,
          is_active: true,
        })
        .eq('id', existing.id)

      if (error) {
        console.error('[Learning] 更新学习记录失败:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      // 插入新记录
      const { error } = await supabase
        .from('classification_learnings')
        .insert({
          article_id,
          original_title: original_title.slice(0, 200),
          original_category,
          corrected_category,
          title_keywords: keywords,
          match_count: 1,
          is_active: true,
        })

      if (error) {
        console.error('[Learning] 插入学习记录失败:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Learning] 记录学习行为异常:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
