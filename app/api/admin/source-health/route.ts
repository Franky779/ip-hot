import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { buildSourceHealthSnapshot, type SourceHealthSource } from '@/lib/source-health'
import type { SourceFetchRun } from '@/lib/source-coverage'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const historyStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [sourcesResult, runsResult] = await Promise.all([
    supabase
      .from('info_sources')
      .select('id, name, url, method, type, enabled, last_test_status, last_test_message'),
    supabase
      .from('source_fetch_runs')
      .select('source_id, source_name, source_url, trigger_type, execution_mode, status, started_at, ended_at, discovered_count, fetched_count, blocked_count, dead_count, duplicate_count, inserted_count, error_message')
      .gte('started_at', historyStart)
      .order('started_at', { ascending: false })
      .limit(5000),
  ])

  if (sourcesResult.error || runsResult.error) {
    return NextResponse.json({
      error: sourcesResult.error?.message || runsResult.error?.message || 'Failed to load source health',
    }, { status: 500 })
  }

  const sources = (sourcesResult.data ?? []) as SourceHealthSource[]
  const runs = (runsResult.data ?? []) as SourceFetchRun[]
  const { health } = buildSourceHealthSnapshot(sources, runs, now)

  return NextResponse.json({ generatedAt: now.toISOString(), health })
}
