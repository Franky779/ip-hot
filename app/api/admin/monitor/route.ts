import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  aggregateSourceQuality,
  type LegacyQualityRow,
  type SourceInfo,
  type SourceQualityAction,
  type SourceQualityLog,
} from '@/lib/source-quality'
import { buildSourceCoverage, type CoverageSource, type SourceFetchRun } from '@/lib/source-coverage'
import { findSourceConfiguration } from '@/lib/sources'

export const dynamic = 'force-dynamic'

const MONITOR_CATEGORIES = [
  '创作/上新', 'IP/品牌/授权', '潮玩谷子', '零售/渠道', '影视综艺',
  '游戏/体育', 'AI/新技术', '展会活动', '文旅及商品', '艺术/亚文化',
  '政策规则', '版权保护', '待分类',
]

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

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-admin-password')
    if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const { start: todayStart, end: todayEnd } = getBeijingTodayRange()
    const sevenDaysAgo = getBeijing7DaysAgo()
    const requestedQualityDays = Number(new URL(request.url).searchParams.get('qualityDays'))
    const qualityDays = [7, 30, 180, 365].includes(requestedQualityDays) ? requestedQualityDays : 7
    const qualityHistoryStart = new Date(Date.now() - qualityDays * 2 * 24 * 60 * 60 * 1000).toISOString()

    // 1. 今日任务（最新一条 cron_logs）
    const { data: todayTaskRaw, error: e1 } = await supabase
      .from('cron_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    // 2. 历史记录（最近 7 天，最多 20 条）
    const { data: historyRaw, error: e2 } = await supabase
      .from('cron_logs')
      .select('*')
      .gte('started_at', sevenDaysAgo)
      .order('started_at', { ascending: false })
      .limit(20)

    // 3. LLM 待处理队列
    const { count: queueCount, error: e3 } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .is('title_cn', null)

    // 4. 今日入库数
    const { count: todayInserted, error: e4 } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)

    // 5. 后台 LLM 守护任务最近一次心跳
    const { data: llmWorkerRaw, error: e5 } = await supabase
      .from('cron_logs')
      .select('status, started_at, ended_at, llm_processed, llm_failed, llm_pending, error_message')
      .eq('trigger_type', 'cron_llm')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 5. 分类统计 — 对每个分类执行数据库精确计数，避免 Supabase 默认1000行上限截断。
    const categoryResults = await Promise.all(
      MONITOR_CATEGORIES.map(async (category) => {
        const { count, error } = await supabase
          .from('articles')
          .select('*', { count: 'exact', head: true })
          .eq('category', category)
          .not('title_cn', 'is', null)
          .not('summary_cn', 'is', null)
        return { category, count: count ?? 0, error }
      })
    )

    // 8. 信源命中效率：优先使用 cron_logs 中删除前持久化的漏斗和评分审计。
    const [qualityLogsResult, qualityActionsResult, sourceInfoResult] = await Promise.all([
      supabase
        .from('cron_logs')
        .select('started_at, details')
        .gte('started_at', qualityHistoryStart)
        .not('details', 'is', null)
        .order('started_at', { ascending: false })
        .limit(1000),
      supabase
        .from('cron_logs')
        .select('details')
        .eq('trigger_type', 'source_quality_action')
        .order('started_at', { ascending: false })
        .limit(500),
      supabase
        .from('info_sources')
        .select('id, name, url, method, type, enabled, last_test_status'),
    ])

    const sourceRunsResult = await supabase
      .from('source_fetch_runs')
      .select('source_id, source_name, source_url, trigger_type, execution_mode, status, started_at, ended_at, discovered_count, fetched_count, blocked_count, dead_count, duplicate_count, inserted_count, error_message')
      .gte('started_at', todayStart)
      .lte('started_at', todayEnd)
      .order('started_at', { ascending: false })
      .limit(5000)

    const sourceCoverage = sourceRunsResult.error
      ? null
      : buildSourceCoverage(
          (sourceInfoResult.data ?? []).map((source) => {
            const configured = findSourceConfiguration(source.url, source.name)
            return {
              ...source,
              priority: configured?.priority,
              needsLocalCdp: configured?.needsLocalCdp,
              loginRequired: configured?.loginRequired,
            } satisfies CoverageSource
          }),
          (sourceRunsResult.data ?? []) as SourceFetchRun[],
        )

    // 兼容部署前的旧数据。旧记录来自 articles，可能因低分删除而偏乐观，前端会明确标注。
    const legacyQualityRows: LegacyQualityRow[] = []
    let legacyQualityError: { message: string } | null = null
    for (let from = 0; from < 5000; from += 1000) {
      const { data, error } = await supabase
        .from('articles')
        .select('source, relevance_score, is_selected, title, title_cn, url, commentary, created_at')
        .gte('created_at', qualityHistoryStart)
        .not('source', 'is', null)
        .not('relevance_score', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, from + 999)
      if (error) {
        legacyQualityError = error
        break
      }
      legacyQualityRows.push(...((data ?? []) as LegacyQualityRow[]))
      if ((data?.length ?? 0) < 1000) break
    }

    // 9. 待人工复核队列（4-5 分边界资讯，以及高分但仍未能自动归类的内容）
    const { data: reviewQueue, error: e9 } = await supabase
      .from('articles')
      .select('id, title_cn, summary_cn, commentary, relevance_score, source, created_at')
      .eq('category', '待人工复核')
      .not('title_cn', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    // 8. 流水线实时状态（pipeline_state 表，可能还未创建）
    let pipelineState = null
    try {
      const { data: ps } = await supabase
        .from('pipeline_state')
        .select('*')
        .eq('id', 1)
        .single()
      if (ps) {
        pipelineState = {
          status: ps.status,
          stage: ps.stage,
          currentGroup: ps.current_group,
          totalGroups: ps.total_groups,
          currentSource: ps.current_source,
          totalFetched: ps.total_fetched,
          totalInserted: ps.total_inserted,
          totalLlmProcessed: ps.total_llm_processed,
          totalLlmSelected: ps.total_llm_selected,
          totalLlmFailed: ps.total_llm_failed,
          rounds: ps.rounds,
          startedAt: ps.started_at,
          lastUpdate: ps.last_update,
          errorMessage: ps.error_message,
        }
      }
    } catch { /* 表不存在时静默 */ }

    const errors = [
      e1, e2, e3, e4, e5, e9,
      qualityLogsResult.error, qualityActionsResult.error, sourceInfoResult.error, sourceRunsResult.error, legacyQualityError,
      ...categoryResults.map((result) => result.error),
    ].filter(Boolean)
    if (errors.length > 0) {
      console.error('[monitor] 查询错误:', errors.map((e) => (e as any).message || e))
    }

    const categoryStats = categoryResults.map(({ category, count }) => ({ category, count }))
    const llmWorkerAge = llmWorkerRaw?.started_at
      ? Date.now() - new Date(llmWorkerRaw.started_at).getTime()
      : Number.POSITIVE_INFINITY
    const llmWorker = {
      active: llmWorkerAge <= 10 * 60 * 1000,
      intervalMinutes: 3,
      lastRunAt: llmWorkerRaw?.started_at || null,
      lastStatus: llmWorkerRaw?.status || null,
      processed: llmWorkerRaw?.llm_processed ?? 0,
      failed: llmWorkerRaw?.llm_failed ?? 0,
      remaining: llmWorkerRaw?.llm_pending ?? queueCount ?? 0,
      errorMessage: llmWorkerRaw?.error_message || null,
    }

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

    const history = (historyRaw || []).map((log: any) => ({
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
    }))

    const sourceQuality = aggregateSourceQuality({
      logs: (qualityLogsResult.data ?? []) as SourceQualityLog[],
      legacyRows: legacyQualityRows,
      sources: (sourceInfoResult.data ?? []) as SourceInfo[],
      actions: (qualityActionsResult.data ?? []).flatMap((row) =>
        row.details && typeof row.details === 'object'
          ? [row.details as SourceQualityAction]
          : [],
      ),
      periodDays: qualityDays,
    })

    return NextResponse.json({
      todayTask,
      llmWorker,
      history,
      queue: queueCount || 0,
      todayInserted: todayInserted || 0,
      categoryStats,
      pipelineState,
      sourceQuality,
      sourceQualityWindowDays: qualityDays,
      sourceCoverage,
      sourceCoverageError: sourceRunsResult.error?.message ?? null,
      reviewQueue: (reviewQueue || []).slice(0, 20).map((r: any) => ({
        id: r.id,
        titleCn: r.title_cn,
        summaryCn: r.summary_cn,
        commentary: r.commentary,
        relevanceScore: r.relevance_score,
        source: r.source,
        createdAt: r.created_at,
      })),
    })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[monitor] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
