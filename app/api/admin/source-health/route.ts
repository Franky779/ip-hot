import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { buildSourceCoverage, getBeijingDayRange, type CoverageSource, type SourceFetchRun } from '@/lib/source-coverage'
import { deriveSourceHealth, type SourceHealthRun } from '@/lib/source-health'
import { findSourceConfiguration } from '@/lib/sources'

export const dynamic = 'force-dynamic'

type HealthSource = CoverageSource & {
  last_test_status: string | null
  last_test_message: string | null
}

function toHealthRun(run: SourceFetchRun): SourceHealthRun {
  return {
    status: run.status,
    startedAt: run.started_at,
    discovered: run.discovered_count,
    fetched: run.fetched_count,
    dead: run.dead_count,
    inserted: run.inserted_count,
    error: run.error_message,
  }
}

export async function GET(request: Request) {
  const password = request.headers.get('x-admin-password')
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const historyStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { start: todayStart, end: todayEnd } = getBeijingDayRange(now)
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

  const sources = (sourcesResult.data ?? []) as HealthSource[]
  const runs = (runsResult.data ?? []) as SourceFetchRun[]
  const todayRuns = runs.filter((run) => {
    const startedAt = new Date(run.started_at)
    return startedAt >= todayStart && startedAt <= todayEnd
  })
  const coverage = buildSourceCoverage(
    sources.map((source) => {
      const configured = findSourceConfiguration(source.url, source.name)
      return {
        ...source,
        priority: configured?.priority,
        needsLocalCdp: configured?.needsLocalCdp,
        loginRequired: configured?.loginRequired,
      }
    }),
    todayRuns,
    now,
  )
  const coverageBySource = new Map(coverage.rows.map((row) => [row.sourceId, row]))

  const health = sources.map((source) => {
    const sourceRuns = runs.filter((run) =>
      run.source_id === source.id
      || (!!run.source_url && run.source_url === source.url)
      || (!run.source_id && !run.source_url && run.source_name === source.name)
    )
    const recentRuns = sourceRuns.map(toHealthRun)
    const latestRun = recentRuns[0] ?? null
    const derived = deriveSourceHealth({
      source: {
        id: source.id,
        enabled: source.enabled,
        lastTestStatus: source.last_test_status,
        lastTestMessage: source.last_test_message,
      },
      coverageStatus: coverageBySource.get(source.id)?.status ?? null,
      latestRun,
      recentRuns,
    })

    return {
      sourceId: source.id,
      ...derived,
      latestRun,
    }
  })

  return NextResponse.json({ generatedAt: now.toISOString(), health })
}
