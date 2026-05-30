import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { shouldIgnoreArticle } from '@/lib/llm'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const authHeader = request.headers.get('x-admin-password')
  if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // 查已处理的文章（按最新优先，评分<=3 或 commentary 明确说无关的都删）
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, commentary, relevance_score')
    .not('title_cn', 'is', null)
    .not('commentary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const toDelete: string[] = []
  for (const a of articles || []) {
    // 统一标准：LLM 已判定低分（<=3）或 commentary 明确说无关
    if (shouldIgnoreArticle(a.relevance_score, a.commentary)) {
      toDelete.push(a.id)
    }
  }

  const totalChecked = articles?.length || 0

  if (toDelete.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, total_checked: totalChecked, message: '无需清理' })
  }

  // 分批删除（每批50）
  let deleted = 0
  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50)
    const { error: delErr } = await supabase
      .from('articles')
      .delete()
      .in('id', batch)

    if (!delErr) deleted += batch.length
  }

  // 记录日志
  await supabase.from('cron_logs').insert({
    trigger_type: 'manual',
    status: 'success',
    details: { action: 'cleanup_irrelevant', deleted, total_checked: totalChecked },
  })

  return NextResponse.json({ ok: true, deleted, total_checked: totalChecked })
}
