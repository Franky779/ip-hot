import {
  getNextScheduledAt,
  getSourceSchedule,
  isCloudSourceDue,
  isLocalSourceDue,
  type SourceExecutionMode,
  type SourceScheduleTier,
} from './source-schedule'

export type CoverageSource = {
  id: string
  name: string
  url: string
  method?: string | null
  type?: string | null
  enabled?: boolean | null
  priority?: string | null
  needsLocalCdp?: boolean
  loginRequired?: boolean
}

export type SourceFetchRun = {
  source_id: string | null
  source_name: string
  source_url: string
  trigger_type: string
  execution_mode: 'cloud' | 'local' | 'manual'
  status: 'running' | 'success' | 'empty' | 'failed' | 'skipped'
  started_at: string
  ended_at: string | null
  discovered_count: number
  fetched_count: number
  blocked_count: number
  dead_count: number
  duplicate_count: number
  inserted_count: number
  error_message: string | null
}

export type SourceCoverageStatus =
  | 'success'
  | 'empty'
  | 'failed'
  | 'running'
  | 'skipped'
  | 'pending'
  | 'overdue'
  | 'not_due'
  | 'manual'
  | 'paused'

export type SourceCoverageRow = {
  sourceId: string
  sourceName: string
  sourceUrl: string
  executionMode: SourceExecutionMode
  scheduleTier: SourceScheduleTier
  status: SourceCoverageStatus
  scheduledAt: string | null
  nextScheduledAt: string | null
  lastRun: SourceFetchRun | null
}

export type SourceCoverage = {
  summary: {
    planned: number
    completed: number
    success: number
    empty: number
    failed: number
    running: number
    skipped: number
    pending: number
    overdue: number
    notDue: number
    excluded: number
  }
  rows: SourceCoverageRow[]
  nextBatches: Array<{ scheduledAt: string; sources: string[]; total: number }>
}

export function getBeijingDayRange(now = new Date()): { start: Date; end: Date } {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const year = beijing.getUTCFullYear()
  const month = beijing.getUTCMonth()
  const day = beijing.getUTCDate()
  return {
    start: new Date(Date.UTC(year, month, day - 1, 16, 0, 0)),
    end: new Date(Date.UTC(year, month, day, 15, 59, 59, 999)),
  }
}

function getCloudScheduledAtToday(source: CoverageSource, start: Date, end: Date): Date | null {
  const candidate = new Date(start)
  candidate.setUTCMinutes(0, 0, 0)
  if (candidate < start) candidate.setUTCHours(candidate.getUTCHours() + 1)

  while (candidate <= end) {
    if ([4, 9, 14, 23].includes(candidate.getUTCHours()) && isCloudSourceDue(source, candidate)) {
      return new Date(candidate)
    }
    candidate.setUTCHours(candidate.getUTCHours() + 1)
  }
  return null
}

function getLocalScheduledAtToday(start: Date): Date {
  const candidate = new Date(start)
  candidate.setUTCDate(candidate.getUTCDate() + 1)
  candidate.setUTCHours(14, 45, 0, 0)
  return candidate
}

function getNextLocalScheduledAt(source: CoverageSource, now: Date): Date | null {
  const { start } = getBeijingDayRange(now)
  for (let daysAhead = 0; daysAhead <= 8; daysAhead += 1) {
    const candidateStart = new Date(start)
    candidateStart.setUTCDate(candidateStart.getUTCDate() + daysAhead)
    const candidate = getLocalScheduledAtToday(candidateStart)
    if (candidate > now && isLocalSourceDue(source, candidate)) return candidate
  }
  return null
}

function findLatestRun(source: CoverageSource, runs: SourceFetchRun[]): SourceFetchRun | null {
  return runs.find((run) =>
    run.source_id === source.id ||
    (!!run.source_url && run.source_url === source.url) ||
    (!run.source_id && !run.source_url && run.source_name === source.name)
  ) ?? null
}

export function buildSourceCoverage(
  sources: CoverageSource[],
  runs: SourceFetchRun[],
  now = new Date(),
): SourceCoverage {
  const { start, end } = getBeijingDayRange(now)
  const orderedRuns = [...runs].sort((left, right) =>
    new Date(right.started_at).getTime() - new Date(left.started_at).getTime()
  )
  const rows = sources.map((source): SourceCoverageRow => {
    const schedule = getSourceSchedule(source)
    const lastRun = findLatestRun(source, orderedRuns)
    const scheduledAt = schedule.executionMode === 'cloud'
      ? getCloudScheduledAtToday(source, start, end)
      : schedule.executionMode === 'local' && source.enabled && isLocalSourceDue(source, getLocalScheduledAtToday(start))
        ? getLocalScheduledAtToday(start)
        : null
    const nextScheduledAt = schedule.executionMode === 'cloud'
      ? getNextScheduledAt(source, now)
      : schedule.executionMode === 'local'
        ? getNextLocalScheduledAt(source, now)
        : null

    let status: SourceCoverageStatus
    if (schedule.executionMode === 'paused') status = 'paused'
    else if (schedule.executionMode === 'manual') status = 'manual'
    else if (lastRun) status = lastRun.status
    else if (!scheduledAt) status = 'not_due'
    else if (scheduledAt > now) status = 'pending'
    else status = 'overdue'

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
      executionMode: schedule.executionMode,
      scheduleTier: schedule.tier,
      status,
      scheduledAt: scheduledAt?.toISOString() ?? null,
      nextScheduledAt: nextScheduledAt?.toISOString() ?? null,
      lastRun,
    }
  }).sort((left, right) => {
    const first = left.scheduledAt ? new Date(left.scheduledAt).getTime() : Number.POSITIVE_INFINITY
    const second = right.scheduledAt ? new Date(right.scheduledAt).getTime() : Number.POSITIVE_INFINITY
    return first - second || left.sourceName.localeCompare(right.sourceName, 'zh-CN')
  })

  const summary = {
    planned: 0,
    completed: 0,
    success: 0,
    empty: 0,
    failed: 0,
    running: 0,
    skipped: 0,
    pending: 0,
    overdue: 0,
    notDue: 0,
    excluded: 0,
  }
  for (const row of rows) {
    if (!row.scheduledAt) {
      summary.excluded += 1
      if (row.executionMode === 'cloud' || row.executionMode === 'local') summary.notDue += 1
      continue
    }
    summary.planned += 1
    if (row.status === 'success' || row.status === 'empty') {
      summary.completed += 1
      summary[row.status] += 1
    } else {
      summary[row.status] += 1
    }
  }

  const batches = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.nextScheduledAt || row.executionMode === 'manual' || row.executionMode === 'paused') continue
    const names = batches.get(row.nextScheduledAt) ?? []
    names.push(row.sourceName)
    batches.set(row.nextScheduledAt, names)
  }
  const nextBatches = [...batches.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 4)
    .map(([scheduledAt, names]) => ({ scheduledAt, sources: names.slice(0, 12), total: names.length }))

  return { summary, rows, nextBatches }
}
