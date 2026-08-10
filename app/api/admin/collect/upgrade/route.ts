// app/api/admin/collect/upgrade/route.ts — 随手收来源升级：把登记的公众号升级为常驻 RSS 信息源
// 用户从 we-mp-rss（rss.laojia-ip.com）订阅公众号后粘贴 feed 地址，服务器实抓验证通过后启用

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { parseFeedUrl } from '@/lib/rss'
import { COLLECT_SOURCE_TYPE } from '@/lib/manual-collect'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let sourceId = ''
  let feedUrl = ''
  try {
    const body = await request.json()
    sourceId = typeof body?.sourceId === 'string' ? body.sourceId : ''
    feedUrl = typeof body?.feedUrl === 'string' ? body.feedUrl.trim() : ''
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  if (!sourceId || !feedUrl || !/^https?:\/\//.test(feedUrl)) {
    return NextResponse.json({ error: '缺少来源 ID 或有效的 RSS 地址' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 只允许升级随手收登记的来源，防误改普通源
  const { data: source, error: sourceError } = await supabase
    .from('info_sources')
    .select('id, name, type, enabled, fetch_type')
    .eq('id', sourceId)
    .limit(1)
    .maybeSingle()

  if (sourceError) {
    return NextResponse.json({ error: `数据库查询失败：${sourceError.message}` }, { status: 500 })
  }
  if (!source) {
    return NextResponse.json({ error: '找不到这个信息源' }, { status: 404 })
  }
  if (source.type !== COLLECT_SOURCE_TYPE) {
    return NextResponse.json({ error: '只有随手收登记的来源才能从这里升级' }, { status: 400 })
  }
  if (source.enabled && source.fetch_type === 'rss') {
    return NextResponse.json({ ok: true, already: true, message: `「${source.name}」已经是常驻信息源了` })
  }

  // 服务器实抓验证：feed 必须能解析且有条目
  let itemCount = 0
  try {
    const feed = await parseFeedUrl(feedUrl, 25_000)
    itemCount = feed?.items?.length ?? 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `RSS 地址抓取失败：${message}` }, { status: 422 })
  }
  if (itemCount === 0) {
    return NextResponse.json({ error: 'RSS 地址能打开但没有任何文章，请确认订阅已成功' }, { status: 422 })
  }

  const { error: updateError } = await supabase
    .from('info_sources')
    .update({
      url: feedUrl,
      fetch_type: 'rss',
      enabled: true,
      last_test_status: 'success',
      last_tested_at: new Date().toISOString(),
      last_test_message: `随手收升级验证通过（${itemCount} 条）`,
    })
    .eq('id', sourceId)

  if (updateError) {
    return NextResponse.json({ error: `启用失败：${updateError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    already: false,
    itemCount,
    message: `「${source.name}」已升级为常驻信息源，系统会每 20 分钟自动抓取其新文章`,
  })
}
