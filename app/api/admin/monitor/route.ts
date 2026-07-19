import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

    // 8. 信源低分率统计（过去7天）
    const { data: sourceQualityRows, error: e8 } = await supabase
      .from('articles')
      .select('source, relevance_score')
      .gte('created_at', sevenDaysAgo)
      .not('source', 'is', null)
      .not('relevance_score', 'is', null)

    // 9. 待人工复核队列（待分类 + 评分4-6，LLM拿不准的）
    const { data: reviewQueue, error: e9 } = await supabase
      .from('articles')
      .select('id, title_cn, summary_cn, commentary, relevance_score, source, created_at')
      .eq('category', '待分类')
      .gte('relevance_score', 4)
      .lte('relevance_score', 6)
      .not('title_cn', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20)

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
      e1, e2, e3, e4, e8, e9,
      ...categoryResults.map((result) => result.error),
    ].filter(Boolean)
    if (errors.length > 0) {
      console.error('[monitor] 查询错误:', errors.map((e) => (e as any).message || e))
    }

    const categoryStats = categoryResults.map(({ category, count }) => ({ category, count }))

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

    // 组装信源低分率（过去7天）
    const sourceQualityMap = new Map<string, { total: number; low: number }>()
    if (sourceQualityRows) {
      for (const row of sourceQualityRows as any[]) {
        const s = row.source
        const existing = sourceQualityMap.get(s) || { total: 0, low: 0 }
        existing.total += 1
        if (row.relevance_score <= 3) existing.low += 1
        sourceQualityMap.set(s, existing)
      }
    }
    const sourceQuality = Array.from(sourceQualityMap.entries())
      .map(([name, data]) => ({
        name,
        total: data.total,
        low: data.low,
        rate: data.total > 0 ? Math.round((data.low / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)

    return NextResponse.json({
      todayTask,
      history,
      queue: queueCount || 0,
      todayInserted: todayInserted || 0,
      categoryStats,
      pipelineState,
      sourceQuality,
      reviewQueue: (reviewQueue || []).map((r: any) => ({
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
