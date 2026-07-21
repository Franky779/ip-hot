import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { REVIEW_CATEGORY } from '@/lib/categories'
import { createServiceClient } from '@/lib/supabase'

type CronLogRow = {
  id: string
  status: string
  trigger_type: string
  started_at: string
  ended_at: string | null
  fetch_total_fetched: number | null
  fetch_total_inserted: number | null
  llm_pending: number | null
  llm_processed: number | null
  llm_failed: number | null
  error_message: string | null
  details?: Record<string, unknown> | null
}

type CategoryRow = {
  category: string | null
}

type SourceActivityRow = {
  source: string | null
  created_at: string
}

type SourceQualityRow = {
  source: string | null
  relevance_score: number | null
}

type InfoSourceRow = {
  id: string
  name: string
  url: string | null
}

type ReviewQueueRow = {
  id: string
  title_cn: string | null
  summary_cn: string | null
  commentary: string | null
  relevance_score: number | null
  source: string | null
  created_at: string
}

type PipelineStateRow = {
  status: string | null
  stage: string | null
  current_group: number | null
  total_groups: number | null
  current_source: string | null
  total_fetched: number | null
  total_inserted: number | null
  total_llm_processed: number | null
  total_llm_selected: number | null
  total_llm_failed: number | null
  rounds: number | null
  started_at: string | null
  last_update: string | null
  error_message: string | null
}

type QueryResult<T> = {
  data: T | null
  error: { message?: string } | null
}

export const runtime = 'nodejs'

const QUEUE_WARNING_THRESHOLD = 100
const QUEUE_CRITICAL_THRESHOLD = 300
const STALE_SUCCESS_HOURS = 12

function getBeijingTodayRange(): { start: string; end: string } {
  const now = new Date()
  const beijingOffset = 8 * 60 * 60 * 1000
  const beijingTime = new Date(now.getTime() + beijingOffset)
  const year = beijingTime.getUTCFullYear()
  const month = beijingTime.getUTCMonth()
  const day = beijingTime.getUTCDate()
  const start = new Date(Date.UTC(year, month, day, -8, 0, 0)).toISOString()
  const end = new Date(Date.UTC(year, month, day, 15, 59, 59)).toISOString()
  return { start, end }
}

function getBeijing7DaysAgo(): string {
  const now = new Date()
  const beijingOffset = 8 * 60 * 60 * 1000
  const beijingTime = new Date(now.getTime() + beijingOffset)
  beijingTime.setUTCDate(beijingTime.getUTCDate() - 7)
  const year = beijingTime.getUTCFullYear()
  const month = beijingTime.getUTCMonth()
  const day = beijingTime.getUTCDate()
  return new Date(Date.UTC(year, month, day, -8, 0, 0)).toISOString()
}

function getErrorMessages(results: Array<QueryResult<unknown>>): string[] {
  return results
    .map((result) => result.error?.message)
    .filter((message): message is string => Boolean(message))
}

function mapCronLog(log: CronLogRow) {
  return {
    id: log.id,
    startedAt: log.started_at,
    triggerType: log.trigger_type,
    fetchTotal: log.fetch_total_fetched,
    inserted: log.fetch_total_inserted,
    llmPending: log.llm_pending,
    llmProcessed: log.llm_processed,
    llmFailed: log.llm_failed,
    status: log.status,
    errorMessage: log.error_message,
    details: log.details,
    elapsedSeconds:
      log.ended_at && log.started_at
        ? Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 1000)
        : null,
  }
}

function buildCategoryStats(rows: CategoryRow[] | null) {
  const categoryCounts = new Map<string, number>()

  for (const row of rows || []) {
    if (!row.category) continue
    categoryCounts.set(row.category, (categoryCounts.get(row.category) || 0) + 1)
  }

  return Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
}

function buildSourceHealth(
  activityRows: SourceActivityRow[] | null,
  allSources: InfoSourceRow[] | null,
  sevenDaysAgo: string,
) {
  const sourceHealthMap = new Map<string, { lastActive: string | null; count7d: number }>()

  for (const row of activityRows || []) {
    if (!row.source) continue

    const existing = sourceHealthMap.get(row.source) || { lastActive: null, count7d: 0 }
    if (!existing.lastActive || row.created_at > existing.lastActive) {
      existing.lastActive = row.created_at
    }
    if (row.created_at >= sevenDaysAgo) {
      existing.count7d += 1
    }
    sourceHealthMap.set(row.source, existing)
  }

  const sourceUrlMap = new Map<string, { id: string; url: string }>()
  for (const row of allSources || []) {
    sourceUrlMap.set(row.name, { id: row.id, url: row.url || '' })
  }

  const now = Date.now()
  const deadList: Array<{ name: string; url: string; id: string }> = []
  const failedList: Array<{ name: string; url: string; id: string; lastActive: string; count7d: number }> = []
  const activeList: Array<{ name: string; url: string; id: string; lastActive: string; count7d: number }> = []

  for (const [name, data] of sourceHealthMap.entries()) {
    const sourceInfo = sourceUrlMap.get(name) || { id: '', url: '' }
    if (!data.lastActive) {
      deadList.push({ name, url: sourceInfo.url, id: sourceInfo.id })
      continue
    }

    const hoursInactive = (now - new Date(data.lastActive).getTime()) / (1000 * 60 * 60)
    if (hoursInactive > 72) {
      failedList.push({ name, url: sourceInfo.url, id: sourceInfo.id, lastActive: data.lastActive, count7d: data.count7d })
    } else {
      activeList.push({ name, url: sourceInfo.url, id: sourceInfo.id, lastActive: data.lastActive, count7d: data.count7d })
    }
  }

  for (const row of allSources || []) {
    if (!sourceHealthMap.has(row.name)) {
      deadList.push({ name: row.name, url: row.url || '', id: row.id })
    }
  }

  deadList.sort((a, b) => a.name.localeCompare(b.name))
  failedList.sort((a, b) => a.name.localeCompare(b.name))
  activeList.sort((a, b) => a.name.localeCompare(b.name))

  return {
    deadList,
    failedList,
    activeList,
    sourceHealth: Array.from(sourceHealthMap.entries()).map(([name, data]) => ({
      name,
      lastActive: data.lastActive,
      count7d: data.count7d,
    })),
  }
}

function buildSourceQuality(rows: SourceQualityRow[] | null) {
  const sourceQualityMap = new Map<string, { total: number; low: number }>()

  for (const row of rows || []) {
    if (!row.source || row.relevance_score == null) continue
    const existing = sourceQualityMap.get(row.source) || { total: 0, low: 0 }
    existing.total += 1
    if (row.relevance_score <= 3) existing.low += 1
    sourceQualityMap.set(row.source, existing)
  }

  return Array.from(sourceQualityMap.entries())
    .map(([name, data]) => ({
      name,
      total: data.total,
      low: data.low,
      rate: data.total > 0 ? Math.round((data.low / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
}

function mapPipelineState(row: PipelineStateRow | null) {
  if (!row) return null

  return {
    status: row.status,
    stage: row.stage,
    currentGroup: row.current_group,
    totalGroups: row.total_groups,
    currentSource: row.current_source,
    totalFetched: row.total_fetched,
    totalInserted: row.total_inserted,
    totalLlmProcessed: row.total_llm_processed,
    totalLlmSelected: row.total_llm_selected,
    totalLlmFailed: row.total_llm_failed,
    rounds: row.rounds,
    startedAt: row.started_at,
    lastUpdate: row.last_update,
    errorMessage: row.error_message,
  }
}

function buildQueueHealth({
  queue,
  latestLog,
  recentErrors,
}: {
  queue: number
  latestLog: CronLogRow | null
  recentErrors: Array<Pick<CronLogRow, 'id' | 'started_at' | 'status' | 'error_message'>>
}) {
  const alerts: Array<{ level: 'warning' | 'critical'; message: string; action: string }> = []
  const lastEndedAt = latestLog?.ended_at || latestLog?.started_at || null
  const hoursSinceLastRun = lastEndedAt
    ? (Date.now() - new Date(lastEndedAt).getTime()) / (1000 * 60 * 60)
    : null

  if (queue >= QUEUE_CRITICAL_THRESHOLD) {
    alerts.push({
      level: 'critical',
      message: `LLM 待处理已达到 ${queue} 条，更新会明显滞后。`,
      action: '请立即点击“手动处理LLM”，并保持页面打开直到清零。',
    })
  } else if (queue >= QUEUE_WARNING_THRESHOLD) {
    alerts.push({
      level: 'warning',
      message: `LLM 待处理已有 ${queue} 条，建议尽快消化。`,
      action: '建议启动自动处理，或使用外部定时器更高频调用处理接口。',
    })
  }

  if (latestLog?.status === 'error') {
    alerts.push({
      level: 'critical',
      message: '最近一次抓取/处理任务失败。',
      action: latestLog.error_message || '请查看最近错误日志。',
    })
  }

  if (hoursSinceLastRun != null && hoursSinceLastRun > STALE_SUCCESS_HOURS) {
    alerts.push({
      level: 'warning',
      message: `距离上次任务结束已超过 ${Math.round(hoursSinceLastRun)} 小时。`,
      action: '请确认 Vercel Cron、外部定时器或本机任务计划是否仍在运行。',
    })
  }

  if (recentErrors.length >= 3) {
    alerts.push({
      level: 'warning',
      message: `最近有 ${recentErrors.length} 条失败日志。`,
      action: '请优先检查 LLM 频限、信源 URL 和 Supabase 写入错误。',
    })
  }

  const level = alerts.some((alert) => alert.level === 'critical')
    ? 'critical'
    : alerts.length > 0
      ? 'warning'
      : 'healthy'

  return {
    level,
    queueWarningThreshold: QUEUE_WARNING_THRESHOLD,
    queueCriticalThreshold: QUEUE_CRITICAL_THRESHOLD,
    hoursSinceLastRun: hoursSinceLastRun == null ? null : Math.round(hoursSinceLastRun * 10) / 10,
    alerts,
  }
}

export async function GET(request: Request) {
  try {
    const denied = requireAdmin(request)
    if (denied) return denied

    const supabase = createServiceClient()
    const { start: todayStart, end: todayEnd } = getBeijingTodayRange()
    const sevenDaysAgo = getBeijing7DaysAgo()

    const [
      todayTaskResult,
      historyResult,
      queueResult,
      todayInsertedResult,
      categoryResult,
      sourceActivityResult,
      recentErrorsResult,
      sourceQualityResult,
      reviewQueueResult,
      allSourcesResult,
      pipelineStateResult,
      reviewStatsResult,
    ] = await Promise.all([
      supabase
        .from('cron_logs')
        .select('id, status, trigger_type, started_at, ended_at, fetch_total_fetched, fetch_total_inserted, llm_pending, llm_processed, llm_failed, error_message, details')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('cron_logs')
        .select('id, status, trigger_type, started_at, ended_at, fetch_total_fetched, fetch_total_inserted, llm_pending, llm_processed, llm_failed, error_message, details')
        .gte('started_at', sevenDaysAgo)
        .order('started_at', { ascending: false })
        .limit(20),
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .is('title_cn', null),
      supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),
      supabase
        .from('articles')
        .select('category')
        .not('title_cn', 'is', null)
        .not('summary_cn', 'is', null)
        .not('category', 'is', null),
      supabase
        .from('articles')
        .select('source, created_at')
        .not('source', 'is', null),
      supabase
        .from('cron_logs')
        .select('id, started_at, status, error_message')
        .eq('status', 'error')
        .order('started_at', { ascending: false })
        .limit(5),
      supabase
        .from('articles')
        .select('source, relevance_score')
        .gte('created_at', sevenDaysAgo)
        .not('source', 'is', null)
        .not('relevance_score', 'is', null),
      supabase
        .from('articles')
        .select('id, title_cn, summary_cn, commentary, relevance_score, source, created_at')
        .eq('category', REVIEW_CATEGORY)
        .gte('relevance_score', 4)
        .lte('relevance_score', 6)
        .not('title_cn', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('info_sources')
        .select('id, name, url'),
      supabase
        .from('pipeline_state')
        .select('status, stage, current_group, total_groups, current_source, total_fetched, total_inserted, total_llm_processed, total_llm_selected, total_llm_failed, rounds, started_at, last_update, error_message')
        .eq('id', 1)
        .maybeSingle(),
      supabase
        .from('articles')
        .select('relevance_score')
        .eq('category', REVIEW_CATEGORY)
        .not('title_cn', 'is', null),
    ])

    const queryErrors = getErrorMessages([
      todayTaskResult,
      historyResult,
      queueResult,
      todayInsertedResult,
      categoryResult,
      sourceActivityResult,
      recentErrorsResult,
      sourceQualityResult,
      reviewQueueResult,
      allSourcesResult,
    ])

    if (queryErrors.length > 0) {
      console.error('[monitor] 查询错误:', queryErrors)
    }

    if (pipelineStateResult.error?.message) {
      console.warn('[monitor] pipeline_state 查询跳过:', pipelineStateResult.error.message)
    }

    const categoryStats = buildCategoryStats((categoryResult.data || []) as CategoryRow[])
    const sourceHealth = buildSourceHealth(
      (sourceActivityResult.data || []) as SourceActivityRow[],
      (allSourcesResult.data || []) as InfoSourceRow[],
      sevenDaysAgo,
    )
    const sourceQuality = buildSourceQuality((sourceQualityResult.data || []) as SourceQualityRow[])
    const todayTaskRaw = todayTaskResult.data as CronLogRow | null
    const recentErrors = ((recentErrorsResult.data || []) as Pick<CronLogRow, 'id' | 'started_at' | 'status' | 'error_message'>[]).map((error) => ({
      id: error.id,
      startedAt: error.started_at,
      status: error.status,
      errorMessage: error.error_message,
    }))
    const queueCount = queueResult.count || 0

    const todayTask = todayTaskRaw
      ? {
          status: todayTaskRaw.status,
          triggerType: todayTaskRaw.trigger_type,
          startedAt: todayTaskRaw.started_at,
          endedAt: todayTaskRaw.ended_at,
          fetchTotal: todayTaskRaw.fetch_total_fetched,
          inserted: todayTaskRaw.fetch_total_inserted,
          llmPending: todayTaskRaw.llm_pending,
          llmProcessed: todayTaskRaw.llm_processed,
          llmFailed: todayTaskRaw.llm_failed,
          errorMessage: todayTaskRaw.error_message,
        }
      : null

    return NextResponse.json({
      todayTask,
      history: ((historyResult.data || []) as CronLogRow[]).map(mapCronLog),
      queue: queueCount,
      queueHealth: buildQueueHealth({
        queue: queueCount,
        latestLog: todayTaskRaw,
        recentErrors: (recentErrorsResult.data || []) as Pick<CronLogRow, 'id' | 'started_at' | 'status' | 'error_message'>[],
      }),
      todayInserted: todayInsertedResult.count || 0,
      failedSources: sourceHealth.failedList.length,
      deadSources: sourceHealth.deadList.length,
      activeSources: sourceHealth.activeList.length,
      deadSourceList: sourceHealth.deadList,
      failedSourceList: sourceHealth.failedList,
      activeSourceList: sourceHealth.activeList,
      categoryStats,
      sourceHealth: sourceHealth.sourceHealth,
      recentErrors,
      pipelineState: mapPipelineState(pipelineStateResult.data as PipelineStateRow | null),
      sourceQuality,
      reviewQueue: ((reviewQueueResult.data || []) as ReviewQueueRow[]).map((row) =>

({
        id: row.id,
        titleCn: row.title_cn,
        summaryCn: row.summary_cn,
        commentary: row.commentary,
        relevanceScore: row.relevance_score,
        source: row.source,
        createdAt: row.created_at,
      })),
      reviewStats: (() => {
        const rows = (reviewStatsResult.data || []) as Array<{ relevance_score: number | null }>
        const total = rows.length
        const lowScore = rows.filter((r) => (r.relevance_score ?? 10) <= 3).length
        const midScore = rows.filter((r) => {
          const s = r.relevance_score ?? 10
          return s >= 4 && s <= 6
        }).length
        return { total, lowScore, midScore }
      })(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[monitor] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
