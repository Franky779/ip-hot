import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

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

    // 5. 分类统计 — 仅统计已完整处理的文章（与首页展示条件一致）
    const { data: categoryRows, error: e5 } = await supabase
      .from('articles')
      .select('category')
      .not('title_cn', 'is', null)
      .not('summary_cn', 'is', null)
      .not('category', 'is', null)

    // 6. 源健康度 — 查所有文章的 source + created_at，在代码里聚合
    const { data: sourceRows, error: e6 } = await supabase
      .from('articles')
      .select('source, created_at')
      .not('source', 'is', null)
      .order('created_at', { ascending: false })

    // 7. 最近错误
    const { data: recentErrors, error: e7 } = await supabase
      .from('cron_logs')
      .select('id, started_at, status, error_message')
      .eq('status', 'error')
      .order('started_at', { ascending: false })
      .limit(5)

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

    const errors = [e1, e2, e3, e4, e5, e6, e7, e8, e9].filter(Boolean)
    if (errors.length > 0) {
      console.error('[monitor] 查询错误:', errors.map((e) => (e as any).message || e))
    }

    // 组装分类统计
    const categoryCounts: Record<string, number> = {}
    if (categoryRows) {
      for (const row of categoryRows as any[]) {
        if (row.category) {
          categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1
        }
      }
    }
    const categoryStats = Object.entries(categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)

    // 组装源健康度数据
    const sourceHealthMap = new Map<string, { lastActive: string | null; count7d: number }>()
    if (sourceRows) {
      const seen = new Set<string>()
      for (const row of sourceRows as any[]) {
        if (!seen.has(row.source)) {
          seen.add(row.source)
          sourceHealthMap.set(row.source, { lastActive: row.created_at, count7d: 0 })
        }
        // 统计7天内数量
        if (row.created_at >= sevenDaysAgo) {
          const existing = sourceHealthMap.get(row.source)
          if (existing) {
            existing.count7d += 1
          }
        }
      }
    }

    // 查询 info_sources 表获取所有源的名字和网址
    const { data: allSources } = await supabase
      .from('info_sources')
      .select('id, name, url')

    const sourceUrlMap = new Map<string, { id: string; url: string }>()
    if (allSources) {
      for (const row of allSources as any[]) {
        sourceUrlMap.set(row.name, { id: row.id, url: row.url || '' })
      }
    }

    // 分类：死源(从未活跃) / 失效(>72h) / 活跃
    const now = Date.now()
    const deadList: Array<{ name: string; url: string; id: string }> = []
    const failedList: Array<{ name: string; url: string; id: string; lastActive: string; count7d: number }> = []
    const activeList: Array<{ name: string; url: string; id: string; lastActive: string; count7d: number }> = []

    for (const [name, data] of sourceHealthMap.entries()) {
      const sourceInfo = sourceUrlMap.get(name) || { id: '', url: '' }
      if (!data.lastActive) {
        deadList.push({ name, url: sourceInfo.url, id: sourceInfo.id })
      } else {
        const hoursInactive = (now - new Date(data.lastActive).getTime()) / (1000 * 60 * 60)
        if (hoursInactive > 72) {
          failedList.push({ name, url: sourceInfo.url, id: sourceInfo.id, lastActive: data.lastActive, count7d: data.count7d })
        } else {
          activeList.push({ name, url: sourceInfo.url, id: sourceInfo.id, lastActive: data.lastActive, count7d: data.count7d })
        }
      }
    }
    // info_sources 里有但 articles 里从未出现过的，也是死源
    if (allSources) {
      for (const row of allSources as any[]) {
        if (!sourceHealthMap.has(row.name)) {
          deadList.push({ name: row.name, url: row.url || '', id: row.id })
        }
      }
    }
    // 排序：按名字
    deadList.sort((a, b) => a.name.localeCompare(b.name))
    failedList.sort((a, b) => a.name.localeCompare(b.name))
    activeList.sort((a, b) => a.name.localeCompare(b.name))

    const failedSources = failedList.length
    const deadSources = deadList.length
    const activeSourceCount = activeList.length

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
      failedSources,
      deadSources,
      activeSources: activeSourceCount,
      deadSourceList: deadList,
      failedSourceList: failedList,
      activeSourceList: activeList,
      categoryStats: (categoryStats || []).map((r: any) => ({ category: r.category, count: r.count })),
      sourceHealth: Array.from(sourceHealthMap.entries()).map(([name, data]) => ({
        name,
        lastActive: data.lastActive,
        count7d: data.count7d,
      })),
      recentErrors: (recentErrors || []).map((e: any) => ({
        id: e.id,
        startedAt: e.started_at,
        status: e.status,
        errorMessage: e.error_message,
      })),
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
