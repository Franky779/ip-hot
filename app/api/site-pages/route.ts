import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase'
import { ABOUT_PAGE_ID, validateAboutPageInput } from '@/lib/site-pages'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await createServiceClient().from('site_pages').select('id, title, blocks, updated_at').eq('id', ABOUT_PAGE_ID).maybeSingle()
  if (error) {
    console.error('Failed to read site page', error)
    return NextResponse.json({ error: '页面内容读取失败，请稍后重试' }, { status: 500 })
  }
  return NextResponse.json(data ?? { id: ABOUT_PAGE_ID, title: '关于老贾', blocks: [], updated_at: null })
}

export async function PUT(request: Request) {
  if (!isAdminAuthenticated(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = validateAboutPageInput(await request.json())
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  const { error } = await createServiceClient().from('site_pages').upsert({
    id: ABOUT_PAGE_ID,
    title: result.value.title,
    blocks: result.value.blocks,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  if (error) {
    console.error('Failed to update site page', error)
    return NextResponse.json({ error: '保存失败，请稍后重试' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, content: result.value })
}
