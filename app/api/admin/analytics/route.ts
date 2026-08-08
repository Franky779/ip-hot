import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function getBeijingWeekRange(weeksAgo: number): { start: string; end: string } {
  const now = new Date()
  const beijingOffset = 8 * 60 * 60 * 1000
  const beijingTime = new Date(now.getTime() + beijingOffset)
  const dayOfWeek = beijingTime.getUTCDay()
  // Monday = 1 in China
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(Date.UTC(
    beijingTime.getUTCFullYear(),
    beijingTime.getUTCMonth(),
    beijingTime.getUTCDate() - mondayOffset - weeksAgo * 7,
    -8, 0, 0,
  ))
  const sunday = new Date(Date.UTC(
    monday.getUTCFullYear(),
    monday.getUTCMonth(),
    monday.getUTCDate() + 6,
    15, 59, 59,
  ))
  return { start: monday.toISOString(), end: sunday.toISOString() }
}

function getBeijingDateDaysAgo(days: number): string {
  const now = new Date()
  const beijingOffset = 8 * 60 * 60 * 1000
  const beijingTime = new Date(now.getTime() + beijingOffset)
  beijingTime.setUTCDate(beijingTime.getUTCDate() - days)
  return new Date(Date.UTC(
    beijingTime.getUTCFullYear(),
    beijingTime.getUTCMonth(),
    beijingTime.getUTCDate(),
    -8, 0, 0,
  )).toISOString()
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-admin-password')
    if (!authHeader || authHeader !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = createServiceClient()
    const thirtyDaysAgo = getBeijingDateDaysAgo(30)

    // ---- KPI queries ----
    const thisWeek = getBeijingWeekRange(0)
    const lastWeek = getBeijingWeekRange(1)

    const [
      totalResult,
      weekNewResult,
      lastWeekNewResult,
      activeSourcesResult,
      llmSelectResult,
    ] = await Promise.all([
      // Total articles (with content)
      db.query(
        'SELECT COUNT(*)::int AS count FROM articles WHERE title_cn IS NOT NULL',
      ),
      // This week new
      db.query(
        'SELECT COUNT(*)::int AS count FROM articles WHERE created_at >= $1 AND created_at <= $2',
        [thisWeek.start, thisWeek.end],
      ),
      // Last week new (for comparison)
      db.query(
        'SELECT COUNT(*)::int AS count FROM articles WHERE created_at >= $1 AND created_at <= $2',
        [lastWeek.start, lastWeek.end],
      ),
      // Active sources
      db.query(
        "SELECT COUNT(*)::int AS count FROM info_sources WHERE enabled = true AND last_test_status != 'failed'",
      ),
      // LLM select rate: selected / scored
      db.query(
        'SELECT COUNT(*)::int AS scored, COUNT(*) FILTER (WHERE is_selected = true)::int AS selected FROM articles WHERE relevance_score IS NOT NULL',
      ),
    ])

    const totalArticles = (totalResult.rows[0] as any)?.count ?? 0
    const weekNewArticles = (weekNewResult.rows[0] as any)?.count ?? 0
    const lastWeekNewArticles = (lastWeekNewResult.rows[0] as any)?.count ?? 0
    const activeSources = (activeSourcesResult.rows[0] as any)?.count ?? 0
    const scored = (llmSelectResult.rows[0] as any)?.scored ?? 0
    const selected = (llmSelectResult.rows[0] as any)?.selected ?? 0

    // Week-over-week changes
    const weekNewChange = lastWeekNewArticles > 0
      ? Math.round(((weekNewArticles - lastWeekNewArticles) / lastWeekNewArticles) * 100)
      : weekNewArticles > 0 ? 100 : 0

    // For total articles change, compare total now vs 7 days ago
    const weekAgoCountResult = await db.query(
      'SELECT COUNT(*)::int AS count FROM articles WHERE created_at <= $1',
      [getBeijingDateDaysAgo(7)],
    )
    const weekAgoTotal = (weekAgoCountResult.rows[0] as any)?.count ?? 0
    const totalChange = weekAgoTotal > 0
      ? Math.round(((totalArticles - weekAgoTotal) / weekAgoTotal) * 100)
      : 0

    // ---- Daily trend (last 30 days) ----
    const trendResult = await db.query(
      `SELECT
         to_char(d, 'YYYY-MM-DD') AS date,
         COUNT(a.id)::int AS count
       FROM generate_series(
         $1::date,
         (CURRENT_DATE AT TIME ZONE 'Asia/Shanghai')::date,
         '1 day'::interval
       ) d
       LEFT JOIN articles a ON a.created_at >= d
         AND a.created_at < d + '1 day'::interval
       GROUP BY d
       ORDER BY d`,
      [thirtyDaysAgo],
    )

    // ---- Category distribution ----
    const categoryResult = await db.query(
      `SELECT category, COUNT(*)::int AS count
       FROM articles
       WHERE title_cn IS NOT NULL AND summary_cn IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`,
    )

    // ---- Top sources ----
    const topSourcesResult = await db.query(
      `SELECT source AS name, COUNT(*)::int AS count
       FROM articles
       WHERE source IS NOT NULL AND title_cn IS NOT NULL
       GROUP BY source
       ORDER BY count DESC
       LIMIT 10`,
    )

    // ---- LLM funnel ----
    const funnelResult = await db.query(
      `SELECT
         COUNT(*)::int AS fetched,
         COUNT(*) FILTER (WHERE title_cn IS NOT NULL)::int AS translated,
         COUNT(*) FILTER (WHERE title_cn IS NOT NULL AND category IS NOT NULL AND category != '待分类')::int AS classified,
         COUNT(*) FILTER (WHERE relevance_score IS NOT NULL)::int AS scored,
         COUNT(*) FILTER (WHERE is_selected = true)::int AS selected
       FROM articles`,
    )

    // ---- Source health ----
    const healthResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE enabled = true AND last_test_status = 'success')::int AS healthy,
         COUNT(*) FILTER (WHERE enabled = true AND last_test_status NOT IN ('success', 'failed', 'untested') AND last_test_status IS NOT NULL)::int AS warning,
         COUNT(*) FILTER (WHERE enabled = true AND (last_test_status = 'failed' OR (last_test_status = 'untested' AND last_tested_at IS NOT NULL)))::int AS dead
       FROM info_sources`,
    )

    // ---- Recent feedback ----
    const feedbackResult = await db.query(
      `SELECT content, created_at
       FROM feedback
       ORDER BY created_at DESC
       LIMIT 5`,
    )

    const funnel = funnelResult.rows[0] as any

    return NextResponse.json({
      kpi: {
        totalArticles,
        weekNewArticles,
        activeSources,
        llmSelectRate: scored > 0 ? Math.round((selected / scored) * 100) : 0,
        totalArticlesChange: totalChange,
        weekNewChange,
        activeSourcesChange: 0,
        llmSelectRateChange: 0,
      },
      dailyTrend: (trendResult.rows as any[]).map((r) => ({
        date: r.date,
        count: r.count,
      })),
      categoryDistribution: (categoryResult.rows as any[]).map((r) => ({
        category: r.category,
        count: r.count,
      })),
      topSources: (topSourcesResult.rows as any[]).map((r) => ({
        name: r.name,
        count: r.count,
      })),
      llmFunnel: {
        fetched: funnel.fetched ?? 0,
        translated: funnel.translated ?? 0,
        classified: funnel.classified ?? 0,
        scored: funnel.scored ?? 0,
        selected: funnel.selected ?? 0,
      },
      sourceHealth: {
        healthy: (healthResult.rows[0] as any)?.healthy ?? 0,
        warning: (healthResult.rows[0] as any)?.warning ?? 0,
        dead: (healthResult.rows[0] as any)?.dead ?? 0,
      },
      recentFeedback: (feedbackResult.rows as any[]).map((r) => ({
        content: r.content,
        createdAt: r.created_at,
      })),
    })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[analytics] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
