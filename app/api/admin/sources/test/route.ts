import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findSourceConfiguration } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'

export const runtime = 'nodejs'
export const maxDuration = 30

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
    .select('id, name, url, fetch_type')
    .eq('id', id)
    .single()

  if (error || !source) {
    return NextResponse.json({ error: error?.message || 'Source not found' }, { status: 404 })
  }

  let status = 'failed'
  let message = ''
  let itemCount = 0
  const configuredSource = findSourceConfiguration(source.url, source.name)
  const effectiveUrl = configuredSource?.url || source.url
  const effectiveFetchType = configuredSource
    ? configuredSource.type === 'rss' || configuredSource.isRss ? 'rss' : 'web'
    : source.fetch_type

  if (effectiveFetchType === 'rss') {
    try {
      const feed = await parseFeedUrl(effectiveUrl)
      itemCount = feed.items.filter((item) => item.title && item.link).length
      status = itemCount > 0 ? 'success' : 'failed'
      message = itemCount > 0
        ? `读取成功，共发现 ${itemCount} 条资讯。`
        : 'RSS 可访问，但没有发现有效资讯。'
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }
  } else if (configuredSource?.loginRequired) {
    message = '该信息源需要登录，不能在 Vercel 无登录环境自动抓取。'
  } else if (configuredSource?.needsLocalCdp) {
    status = 'success'
    message = '已配置由本地 CDP 定时任务抓取；Vercel 不执行静态页面测试。'
  } else {
    const scrapeConfig = configuredSource?.scrapeConfig || {
      adapter: 'auto-news-links' as const,
      maxItems: 10,
    }
    const result = await scrapeNewsList(source.name, effectiveUrl, scrapeConfig)
    itemCount = result.items.length
    status = itemCount > 0 ? 'success' : 'failed'
    message = result.error || `读取成功，共发现 ${itemCount} 条资讯。`
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
