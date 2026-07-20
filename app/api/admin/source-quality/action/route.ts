import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findSourceConfiguration } from '@/lib/sources'
import { getSourceSchedule, writeSourceSchedule } from '@/lib/source-schedule'

const ACTIONS = new Set(['observe', 'reduce', 'normal', 'pause', 'resume'])

export async function POST(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { sourceId?: string; action?: string }
  if (!body.sourceId || !body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: '缺少信息源或操作无效。' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: source, error } = await supabase
    .from('info_sources')
    .select('id, name, url, method, type, enabled, last_test_status')
    .eq('id', body.sourceId)
    .single()

  if (error || !source) {
    return NextResponse.json({ error: error?.message || '信息源不存在。' }, { status: 404 })
  }

  if ((body.action === 'resume' || (body.action === 'normal' && !source.enabled)) && source.last_test_status !== 'success') {
    return NextResponse.json({ error: '该信息源最近测试未成功，请先在信息源管理页测试。' }, { status: 400 })
  }

  const mode = body.action === 'reduce'
    ? 'reduced'
    : body.action === 'observe'
      ? 'observe'
      : body.action === 'pause'
        ? 'paused'
        : 'normal'

  if (body.action === 'pause') {
    const { error: updateError } = await supabase
      .from('info_sources')
      .update({ enabled: false })
      .eq('id', source.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  if (body.action === 'normal' || body.action === 'resume') {
    const sourceConfig = findSourceConfiguration(source.url, source.name)
    const currentSchedule = getSourceSchedule({
      id: source.id,
      name: source.name,
      url: source.url,
      method: source.method,
      type: source.type,
      enabled: true,
      needsLocalCdp: sourceConfig?.needsLocalCdp,
      loginRequired: sourceConfig?.loginRequired,
      priority: sourceConfig?.priority,
    })
    const executionMode = currentSchedule.executionMode === 'paused'
      ? sourceConfig?.needsLocalCdp
        ? 'local'
        : sourceConfig?.loginRequired
          ? 'manual'
          : 'cloud'
      : currentSchedule.executionMode
    const { error: updateError } = await supabase
      .from('info_sources')
      .update({
        enabled: true,
        method: writeSourceSchedule(source.method, { executionMode, tier: currentSchedule.tier }),
      })
      .eq('id', source.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  const { error: logError } = await supabase.from('cron_logs').insert({
    trigger_type: 'source_quality_action',
    status: 'success',
    ended_at: new Date().toISOString(),
    details: {
      action: 'source_quality_action',
      sourceId: source.id,
      sourceName: source.name,
      mode,
    },
  })

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 })
  }

  const messages: Record<string, string> = {
    observe: '已标记为继续观察，不改变抓取状态。',
    reduce: '已设置为降频抓取，后续只参加一半的定时轮次。',
    normal: '已转为正常信源，并加入原有抓取队列。',
    pause: '已停用该信息源。',
    resume: '已恢复启用该信息源，并加入原有抓取队列。',
  }
  return NextResponse.json({ ok: true, mode, message: messages[body.action] })
}
