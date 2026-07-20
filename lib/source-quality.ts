export type SourceQualitySample = {
  title: string
  url: string
  score: number
  commentary: string
  createdAt: string
}

export type SourceQualityResult = {
  source: string
  title: string
  url: string
  score: number | null
  selected: boolean
  commentary: string
  status: 'scored' | 'failed' | 'unscored'
}

export type SourceFetchResult = {
  source: string
  discovered?: number
  fetched?: number
  blocked?: number
  dead?: number
  duplicates?: number
  inserted?: number
}

export type SourceQualityLog = {
  started_at: string
  details: {
    fetchResults?: SourceFetchResult[]
    qualityResults?: SourceQualityResult[]
  } | null
}

export type LegacyQualityRow = {
  source: string
  relevance_score: number
  is_selected?: boolean | null
  title?: string | null
  title_cn?: string | null
  url?: string | null
  commentary?: string | null
  created_at: string
}

export type SourceInfo = {
  id: string
  name: string
  enabled: boolean
  last_test_status?: string | null
}

export type SourceQualityAction = {
  sourceId?: string
  sourceName?: string
  mode?: 'normal' | 'observe' | 'reduced' | 'paused'
}

export type SourceQualityMetric = {
  sourceId: string | null
  name: string
  enabled: boolean
  mode: 'normal' | 'observe' | 'reduced' | 'paused'
  discovered: number
  inserted: number
  scored: number
  llmUnprocessed: number
  low: number
  mid: number
  high: number
  selected: number
  duplicates: number
  noiseBlocked: number
  deadLinks: number
  llmFailed: number
  lowRate: number
  usefulRate: number
  previousLowRate: number | null
  trend: number | null
  confidence: 'insufficient' | 'enough'
  status: 'insufficient' | 'healthy' | 'warning' | 'poor'
  managementStatus: 'normal' | 'review' | 'insufficient' | 'reduced' | 'observe' | 'paused'
  recommendation: string
  legacyEstimate: boolean
  lowSamples: SourceQualitySample[]
  midSamples: SourceQualitySample[]
  highSamples: SourceQualitySample[]
  selectedSamples: SourceQualitySample[]
}

type ScoreStats = {
  scored: number
  low: number
  mid: number
  high: number
  selected: number
  llmFailed: number
  lowSamples: SourceQualitySample[]
  midSamples: SourceQualitySample[]
  highSamples: SourceQualitySample[]
  selectedSamples: SourceQualitySample[]
}

type FetchStats = {
  discovered: number
  inserted: number
  duplicates: number
  noiseBlocked: number
  deadLinks: number
}

function scoreStats(): ScoreStats {
  return {
    scored: 0,
    low: 0,
    mid: 0,
    high: 0,
    selected: 0,
    llmFailed: 0,
    lowSamples: [],
    midSamples: [],
    highSamples: [],
    selectedSamples: [],
  }
}

function fetchStats(): FetchStats {
  return { discovered: 0, inserted: 0, duplicates: 0, noiseBlocked: 0, deadLinks: 0 }
}

function addSample(samples: SourceQualitySample[], sample: SourceQualitySample) {
  if (samples.length >= 10) return
  if (samples.some((item) => item.url === sample.url)) return
  samples.push(sample)
}

function addScore(
  stats: ScoreStats,
  score: number,
  selected: boolean,
  sample: Omit<SourceQualitySample, 'score'>,
) {
  stats.scored += 1
  if (score <= 3) stats.low += 1
  else if (score <= 6) stats.mid += 1
  else stats.high += 1
  const completeSample = { ...sample, score }
  if (score <= 3) addSample(stats.lowSamples, completeSample)
  else if (score <= 6) addSample(stats.midSamples, completeSample)
  else addSample(stats.highSamples, completeSample)
  if (selected) {
    stats.selected += 1
    addSample(stats.selectedSamples, completeSample)
  }
}

function percentage(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

function recommendation(scored: number, lowRate: number): SourceQualityMetric['recommendation'] {
  if (scored < 20) return '样本不足，继续观察，不建议调整抓取状态。'
  if (lowRate >= 60) return '优先检查低分样本；连续两个周期偏高时再考虑降频或暂停。'
  if (lowRate >= 30) return '检查栏目和低分原因，暂不建议自动停用。'
  return '命中效率正常，维持当前抓取策略。'
}

export function aggregateSourceQuality(input: {
  logs: SourceQualityLog[]
  legacyRows: LegacyQualityRow[]
  sources: SourceInfo[]
  actions: SourceQualityAction[]
  periodDays: number
  now?: Date
}): SourceQualityMetric[] {
  const now = input.now ?? new Date()
  const periodMs = input.periodDays * 24 * 60 * 60 * 1000
  const currentStart = now.getTime() - periodMs
  const previousStart = currentStart - periodMs
  const currentScores = new Map<string, ScoreStats>()
  const previousScores = new Map<string, ScoreStats>()
  const currentFetch = new Map<string, FetchStats>()
  const legacyNames = new Set<string>()
  const auditedCurrent = new Set<string>()
  const auditedPrevious = new Set<string>()

  const scoreBucket = (name: string, current: boolean) => {
    const map = current ? currentScores : previousScores
    const existing = map.get(name) ?? scoreStats()
    map.set(name, existing)
    return existing
  }

  for (const log of input.logs) {
    const time = new Date(log.started_at).getTime()
    const isCurrent = time >= currentStart && time <= now.getTime()
    const isPrevious = time >= previousStart && time < currentStart
    if (!isCurrent && !isPrevious) continue

    if (isCurrent) {
      for (const result of log.details?.fetchResults ?? []) {
        if (!result.source) continue
        const stats = currentFetch.get(result.source) ?? fetchStats()
        const fetched = Math.max(0, result.fetched ?? 0)
        const blocked = Math.max(0, result.blocked ?? 0)
        const dead = Math.max(0, result.dead ?? 0)
        const inserted = Math.max(0, result.inserted ?? 0)
        const discovered = Math.max(0, result.discovered ?? fetched + blocked)
        stats.discovered += discovered
        stats.noiseBlocked += blocked
        stats.deadLinks += dead
        stats.inserted += inserted
        stats.duplicates += Math.max(0, result.duplicates ?? fetched - dead - inserted)
        currentFetch.set(result.source, stats)
      }
    }

    for (const result of log.details?.qualityResults ?? []) {
      if (!result.source) continue
      const stats = scoreBucket(result.source, isCurrent)
      if (result.status === 'failed') {
        stats.llmFailed += 1
        continue
      }
      if (result.status !== 'scored' || typeof result.score !== 'number') continue
      ;(isCurrent ? auditedCurrent : auditedPrevious).add(result.source)
      addScore(stats, result.score, result.selected, {
        title: result.title,
        url: result.url,
        commentary: result.commentary,
        createdAt: log.started_at,
      })
    }
  }

  for (const row of input.legacyRows) {
    if (!row.source || typeof row.relevance_score !== 'number') continue
    const time = new Date(row.created_at).getTime()
    const isCurrent = time >= currentStart && time <= now.getTime()
    const isPrevious = time >= previousStart && time < currentStart
    if (!isCurrent && !isPrevious) continue
    if ((isCurrent ? auditedCurrent : auditedPrevious).has(row.source)) continue
    const stats = scoreBucket(row.source, isCurrent)
    addScore(stats, row.relevance_score, Boolean(row.is_selected), {
      title: row.title_cn || row.title || '未命名资讯',
      url: row.url || '',
      commentary: row.commentary || '',
      createdAt: row.created_at,
    })
    if (isCurrent) legacyNames.add(row.source)
  }

  const sourceByName = new Map(input.sources.map((source) => [source.name, source]))
  const actionById = new Map<string, SourceQualityAction>()
  const actionByName = new Map<string, SourceQualityAction>()
  for (const action of input.actions) {
    if (action.sourceId && !actionById.has(action.sourceId)) actionById.set(action.sourceId, action)
    if (action.sourceName && !actionByName.has(action.sourceName)) actionByName.set(action.sourceName, action)
  }

  // 运营监控以当前信息源目录为准。已从 info_sources 删除的来源可能仍有历史
  // cron_logs，但不应作为可操作的信息源卡片继续展示。
  const names = new Set(sourceByName.keys())
  return Array.from(names).map((name): SourceQualityMetric => {
    const scores = currentScores.get(name) ?? scoreStats()
    const previous = previousScores.get(name) ?? scoreStats()
    const fetched = currentFetch.get(name) ?? fetchStats()
    const source = sourceByName.get(name)
    const action = (source ? actionById.get(source.id) : undefined) ?? actionByName.get(name)
    const lowRate = percentage(scores.low, scores.scored)
    const usefulRate = percentage(scores.high, scores.scored)
    const previousLowRate = previous.scored > 0 ? percentage(previous.low, previous.scored) : null
    const enough = scores.scored >= 20
    const status: SourceQualityMetric['status'] = !enough
      ? 'insufficient'
      : lowRate >= 60
        ? 'poor'
        : lowRate >= 30
          ? 'warning'
          : 'healthy'
    const managementStatus: SourceQualityMetric['managementStatus'] = action?.mode === 'normal'
      ? 'normal'
      : source?.enabled === false || action?.mode === 'paused'
        ? 'paused'
        : action?.mode === 'reduced'
        ? 'reduced'
        : action?.mode === 'observe'
          ? 'observe'
          : status === 'poor'
            ? 'review'
            : status === 'insufficient'
              ? 'insufficient'
              : 'normal'

    return {
      sourceId: source?.id ?? null,
      name,
      enabled: source?.enabled ?? false,
      mode: action?.mode ?? (source?.enabled === false ? 'paused' : 'normal'),
      ...fetched,
      scored: scores.scored,
      llmUnprocessed: Math.max(0, fetched.inserted - scores.scored - scores.llmFailed),
      low: scores.low,
      mid: scores.mid,
      high: scores.high,
      selected: scores.selected,
      llmFailed: scores.llmFailed,
      lowRate,
      usefulRate,
      previousLowRate,
      trend: previousLowRate === null ? null : lowRate - previousLowRate,
      confidence: enough ? 'enough' : 'insufficient',
      status,
      managementStatus,
      recommendation: recommendation(scores.scored, lowRate),
      legacyEstimate: legacyNames.has(name),
      lowSamples: scores.lowSamples.slice(0, 5),
      midSamples: scores.midSamples.slice(0, 5),
      highSamples: scores.highSamples.slice(0, 5),
      selectedSamples: scores.selectedSamples.slice(0, 5),
    }
  }).sort((a, b) => {
    const statusOrder = { poor: 0, warning: 1, insufficient: 2, healthy: 3 }
    return statusOrder[a.status] - statusOrder[b.status] || b.lowRate - a.lowRate || b.scored - a.scored
  })
}
