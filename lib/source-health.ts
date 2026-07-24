import type { SourceCoverageStatus } from './source-coverage'

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
