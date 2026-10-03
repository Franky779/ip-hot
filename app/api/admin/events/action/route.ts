import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { refreshEventCounters } from '@/lib/events/group'

export const runtime = 'nodejs'

/**
 * 事件人工修正（A1 验收标准：人工改归属后不被自动覆盖）。
 * POST body:
 *   action: 'move'      — 把文章移入指定事件（或从原事件移出：targetEventId 传 null）
 *   action: 'firstParty'— 设/取消一手报道
 *   action: 'rename'    — 改事件标题
 * 所有经此接口改动都会打 manual=true，自动聚簇永不覆盖。
 */
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string
    articleId?: string
    fromEventId?: string
    targetEventId?: string | null
    eventId?: string
    title?: string
  } | null
  if (!body?.action) {
    return NextResponse.json({ error: 'missing action' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const touched = new Set<string>()

  try {
    if (body.action === 'move') {
      if (!body.articleId) return NextResponse.json({ error: 'missing articleId' }, { status: 400 })
      const { rows: article } = await supabase.query<{ id: string; source: string; published_at: string | null; created_at: string | null }>(
        `select id, source, published_at, created_at from articles where id = $1::uuid`,
        [body.articleId],
      )
      if (!article[0]) return NextResponse.json({ error: 'article not found' }, { status: 404 })

      // 移出原事件
      const { rows: from } = await supabase.query<{ event_id: string }>(
        `select event_id from ip_event_reports where article_id = $1::uuid`,
        [body.articleId],
      )
      for (const row of from) {
        if (row.event_id !== body.targetEventId) touched.add(row.event_id)
      }
      await supabase.query(
        `delete from ip_event_reports where article_id = $1::uuid and event_id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')`,
        [body.articleId, body.targetEventId ?? null],
      )

      // 移入目标事件
      if (body.targetEventId) {
        await supabase.query(
          `insert into ip_event_reports (event_id, article_id, source_name, is_first_party, relation, manual)
           values ($1, $2, $3, false, 'MANUAL', 1)
           on conflict (event_id, article_id) do update set manual = true, relation = 'MANUAL'`,
          [body.targetEventId, body.articleId, article[0].source],
        )
        touched.add(body.targetEventId)
      }
      for (const eventId of touched) {
        await refreshEventCounters(eventId)
      }
      // 清空无报道的空事件
      await supabase.query(
        `delete from ip_events e where not exists (select 1 from ip_event_reports r where r.event_id = e.id)`,
      )
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'firstParty') {
      if (!body.articleId) return NextResponse.json({ error: 'missing articleId' }, { status: 400 })
      const { rows } = await supabase.query<{ event_id: string; current: boolean }>(
        `select event_id, is_first_party as current from ip_event_reports where article_id = $1::uuid limit 1`,
        [body.articleId],
      )
      if (!rows[0]) return NextResponse.json({ error: 'report not found' }, { status: 404 })
      await supabase.query(
        `update ip_event_reports set is_first_party = $2, manual = true where article_id = $1::uuid`,
        [body.articleId, !rows[0].current],
      )
      await refreshEventCounters(rows[0].event_id)
      return NextResponse.json({ ok: true, is_first_party: !rows[0].current })
    }

    if (body.action === 'rename') {
      if (!body.eventId || !body.title) return NextResponse.json({ error: 'missing eventId/title' }, { status: 400 })
      await supabase.query(
        `update ip_events set title_cn = $2, updated_at = now() where id = $1::uuid`,
        [body.eventId, body.title.slice(0, 200)],
      )
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
