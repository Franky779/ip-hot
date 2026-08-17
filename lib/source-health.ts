import { buildSourceCoverage, getBeijingDayRange, type CoverageSource, type SourceCoverage, type SourceCoverageStatus, type SourceFetchRun } from './source-coverage.ts'
import { findSourceConfiguration } from './sources.ts'
import { getSourceSchedule } from './source-schedule.ts'

export type SourceHealthStatus =
  | 'repair'
  | 'dead_links'
  | 'no_articles'
  | 'overdue'
  | 'untested'
  | 'running'
  | 'healthy'
  | 'inactive'

export type SourceHealthRun = {
  status: 'running' | 'success' | 'empty' | 'failed' | 'skipped'
  startedAt: string
  discovered: number
  fetched: number
  dead: number
  inserted: number
  error: string | null
}

export type SourceHealthInput = {
  source: {
    id: string
    enabled?: boolean | null
    lastTestStatus?: string | null
    lastTestMessage?: string | null
  }
  coverageStatus: SourceCoverageStatus | null
  latestRun: SourceHealthRun | null
  recentRuns: SourceHealthRun[]
}

export type SourceHealth = {
  status: SourceHealthStatus
  reason: string
  lastSuccessAt: string | null
}

export type SourceHealthSource = CoverageSource & {
  last_test_status?: string | null
  last_test_message?: string | null
}

export type SourceHealthRow = SourceHealth & {
  sourceId: string
  filterValue: string | null
  latestRun: SourceHealthRun | null
}

export type SourceHealthFilterOption = {
  value: string
  label: string
  status: SourceHealthStatus
  runState: 'active' | 'paused'
}

export const SOURCE_HEALTH_OPTIONS: Array<{ value: SourceHealthStatus; label: string }> = [
  { value: 'repair', label: '待修复' },
  { value: 'dead_links', label: '失效链接过多' },
  { value: 'no_articles', label: '连续无资讯' },
  { value: 'overdue', label: '逾期未抓' },
  { value: 'untested', label: '尚未验证' },
  { value: 'running', label: '抓取中' },
  { value: 'healthy', label: '正常' },
  { value: 'inactive', label: '已停用/人工处理' },
]

export const ATTENTION_HEALTH_STATUSES = new Set<SourceHealthStatus>([
  'repair',
  'dead_links',
  'no_articles',
  'overdue',
  'untested',
])

export const SOURCE_HEALTH_FILTER_OPTIONS: SourceHealthFilterOption[] = [
  { value: 'active:healthy', label: '启动中 · 正常', status: 'healthy', runState: 'active' },
  { value: 'active:running', label: '启动中 · 抓取中', status: 'running', runState: 'active' },
  { value: 'active:dead_links', label: '启动中 · 失效链接过多', status: 'dead_links', runState: 'active' },
  { value: 'active:repair', label: '启动中 · 待修复', status: 'repair', runState: 'active' },
  { value: 'active:untested', label: '启动中 · 尚未验证', status: 'untested', runState: 'active' },
  { value: 'active:no_articles', label: '启动中 · 连续无资讯', status: 'no_articles', runState: 'active' },
  { value: 'active:overdue', label: '启动中 · 逾期未抓', status: 'overdue', runState: 'active' },
  { value: 'active:inactive', label: '启动中 · 已停用/人工处理', status: 'inactive', runState: 'active' },
  { value: 'paused:repair', label: '暂停中 · 待修复', status: 'repair', runState: 'paused' },
  { value: 'paused:inactive', label: '暂停中 · 已停用/人工处理', status: 'inactive', runState: 'paused' },
  { value: 'paused:no_articles', label: '暂停中 · 连续无资讯', status: 'no_articles', runState: 'paused' },
  { value: 'paused:overdue', label: '暂停中 · 逾期未抓', status: 'overdue', runState: 'paused' },
  { value: 'paused:untested', label: '暂停中 · 尚未验证', status: 'untested', runState: 'paused' },
  { value: 'paused:healthy', label: '暂停中 · 正常', status: 'healthy', runState: 'paused' },
  { value: 'paused:running', label: '暂停中 · 抓取中', status: 'running', runState: 'paused' },
  { value: 'paused:dead_links', label: '暂停中 · 失效链接过多', status: 'dead_links', runState: 'paused' },
]

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

export function getSourceHealthFilterOption(
  source: Pick<CoverageSource, 'enabled' | 'method' | 'type' | 'name' | 'url' | 'id'>,
  status: SourceHealthStatus | undefined,
) {
  const executionMode = getSourceSchedule(source).executionMode
  const runState = executionMode === 'cloud' || executionMode === 'local' ? 'active' : 'paused'
  return SOURCE_HEALTH_FILTER_OPTIONS.find((option) =>
    option.status === status && option.runState === runState
  )
}

export function matchesSourceHealthFilter(
  source: Pick<CoverageSource, 'enabled' | 'method' | 'type' | 'name' | 'url' | 'id'>,
  status: SourceHealthStatus | undefined,
  option: SourceHealthFilterOption,
) {
  return getSourceHealthFilterOption(source, status)?.value === option.value
}

export function buildSourceHealthSnapshot(
  sources: SourceHealthSource[],
  runs: SourceFetchRun[],
  now = new Date(),
): { coverage: SourceCoverage; health: SourceHealthRow[] } {
  const { start: todayStart, end: todayEnd } = getBeijingDayRange(now)
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
  const orderedRuns = [...runs].sort((left, right) =>
    new Date(right.started_at).getTime() - new Date(left.started_at).getTime()
  )

  return {
    coverage,
    health: sources.map((source) => {
      const sourceRuns = orderedRuns.filter((run) =>
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
        filterValue: getSourceHealthFilterOption(source, derived.status)?.value ?? null,
        latestRun,
      }
    }),
  }
}

export function deriveSourceHealth(input: SourceHealthInput): SourceHealth {
  const { source, coverageStatus, latestRun, recentRuns } = input
  const lastSuccessAt = recentRuns.find((run) =>
    (run.status === 'success' || run.status === 'empty') && run.fetched > 0
  )?.startedAt ?? null

  if (coverageStatus === 'running' || latestRun?.status === 'running') {
    return { status: 'running', reason: '当前抓取任务正在运行', lastSuccessAt }
  }
  if (latestRun?.status === 'failed') {
    return {
      status: 'repair',
      reason: latestRun.error ? `最近抓取失败：${latestRun.error}` : '最近正式抓取失败',
      lastSuccessAt,
    }
  }
  if (source.lastTestStatus === 'failed') {
    return {
      status: 'repair',
      reason: source.lastTestMessage ? `最近测试失败：${source.lastTestMessage}` : '最近测试失败',
      lastSuccessAt,
    }
  }
  if (coverageStatus === 'paused' || coverageStatus === 'manual' || source.enabled === false) {
    return { status: 'inactive', reason: '已停用或由人工处理', lastSuccessAt }
  }
  if (latestRun && latestRun.fetched > 0 && latestRun.dead / latestRun.fetched >= 0.5) {
    return {
      status: 'dead_links',
      reason: `最近抓取 ${latestRun.fetched} 条中有 ${latestRun.dead} 条链接失效`,
      lastSuccessAt,
    }
  }

  const latestTwoRuns = recentRuns.slice(0, 2)
  if (
    latestTwoRuns.length === 2
    && latestTwoRuns.every((run) =>
      (run.status === 'success' || run.status === 'empty') && run.discovered === 0
    )
  ) {
    return { status: 'no_articles', reason: '最近两次抓取均未发现资讯', lastSuccessAt }
  }
  if (coverageStatus === 'overdue') {
    return { status: 'overdue', reason: '已超过计划抓取时间但尚未运行', lastSuccessAt }
  }
  if (
    (!source.lastTestStatus || source.lastTestStatus === 'untested')
    && recentRuns.length === 0
  ) {
    return { status: 'untested', reason: '尚未完成测试或正式抓取', lastSuccessAt }
  }

  return {
    status: 'healthy',
    reason: latestRun?.fetched
      ? `最近抓取到 ${latestRun.fetched} 条有效资讯`
      : '最近测试或抓取正常',
    lastSuccessAt,
  }
}
