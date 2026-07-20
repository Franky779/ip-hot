import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function POST(request: Request) {
  const authHeader = request.headers.get('x-admin-password')
  if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, title_cn, summary_cn, commentary, category, relevance_score, is_selected } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (title_cn !== undefined) updateData.title_cn = title_cn
  if (summary_cn !== undefined) updateData.summary_cn = summary_cn
  if (commentary !== undefined) updateData.commentary = commentary
  if (category !== undefined) updateData.category = category
  if (relevance_score !== undefined) updateData.relevance_score = relevance_score
  if (is_selected !== undefined) updateData.is_selected = is_selected

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('articles')
    .update(updateData)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
