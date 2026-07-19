import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 30

const parser = new Parser({ timeout: 15000 })

export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: source, error } = await supabase
    .from('info_sources')
    .select('id, url, fetch_type')
    .eq('id', id)
    .single()

  if (error || !source) {
    return NextResponse.json({ error: error?.message || 'Source not found' }, { status: 404 })
  }

  let status = 'failed'
  let message = ''
  let itemCount = 0

  if (source.fetch_type !== 'rss') {
    message = '普通网页需要单独配置抓取规则，目前只能自动测试 RSS。'
  } else {
    try {
      const feed = await parser.parseURL(source.url)
      itemCount = feed.items.filter((item) => item.title && item.link).length
      status = itemCount > 0 ? 'success' : 'failed'
      message = itemCount > 0 ? `读取成功，共发现 ${itemCount} 条资讯。` : 'RSS 可访问，但没有发现有效资讯。'
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
  }

  await supabase
    .from('info_sources')
    .update({
      last_test_status: status,
      last_tested_at: new Date().toISOString(),
      last_test_message: message.slice(0, 500),
      ...(status === 'failed' ? { enabled: false } : {}),
    })
    .eq('id', id)

  return NextResponse.json({ ok: status === 'success', status, message, itemCount })
}
