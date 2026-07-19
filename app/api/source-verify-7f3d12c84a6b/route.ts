import { NextResponse } from 'next/server'
import { scrapeNewsList } from '@/lib/scraper'
import { findSourceConfiguration } from '@/lib/sources'
import { createServiceClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

const VERIFY_TOKEN = 'd44a3c2f5f614af9a194e45dc32a7b81'
const TARGET_NAMES = new Set(['17173动漫', '雷报'])

export async function POST(request: Request) {
  if (request.headers.get('x-source-verify-token') !== VERIFY_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('info_sources')
    .select('id, name, url, enabled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets = (data ?? []).filter((source) => TARGET_NAMES.has(source.name))
  const results = []

  for (const source of targets) {
    const configured = findSourceConfiguration(source.url, source.name)
    if (!configured?.scrapeConfig) {
      results.push({ id: source.id, name: source.name, passed: false, error: 'Missing scrapeConfig' })
      continue
    }

    const runs = []
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await scrapeNewsList(source.name, configured.url, configured.scrapeConfig)
      runs.push({ attempt, itemCount: result.items.length, error: result.error ?? null })
    }

    const expected = configured.scrapeConfig.maxItems ?? 10
    const passed = runs.every((run) => !run.error && run.itemCount === expected)
    const message = passed
      ? `生产连续测试成功：3 次均读取 ${expected} 条资讯。`
      : `生产连续测试失败：${JSON.stringify(runs)}`

    const { error: updateError } = await supabase
      .from('info_sources')
      .update({
        enabled: passed,
        last_test_status: passed ? 'success' : 'failed',
        last_tested_at: new Date().toISOString(),
        last_test_message: message.slice(0, 500),
      })
      .eq('id', source.id)

    results.push({
      id: source.id,
      name: source.name,
      configuredSourceId: configured.id,
      passed,
      runs,
      updateError: updateError?.message ?? null,
    })
  }

  return NextResponse.json({ ok: results.length === 2 && results.every((result) => result.passed), results })
}
