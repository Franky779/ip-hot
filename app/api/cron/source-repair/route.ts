import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { findSourceConfiguration } from '@/lib/sources'
import {
  decideRepairAction,
  isRepairCandidate,
  runSourceTest,
  syncMethod,
  type RepairCandidate,
} from '@/lib/source-repair'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_LIMIT = 8
const LOCK_MINUTES = 60

type RepairOutcome = {
  id: string
  name: string
  url: string
  method: string | null
  action: 'skip' | 'enable' | 'keep_disabled'
  reason?: string
  ok?: boolean
  itemCount?: number
  message?: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const adminPw = request.headers.get('x-admin-password')
  const isCronAuth = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminAuth = !!adminPw && adminPw === process.env.ADMIN_PASSWORD
  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const dryRun = requestUrl.searchParams.get('dryRun') === '1'
  const limitParam = Number(requestUrl.searchParams.get('limit'))
  const limit = Number.isInteger(limitParam) && limitParam > 0
    ? Math.min(limitParam, DEFAULT_LIMIT)
    : DEFAULT_LIMIT

  const supabase = createServiceClient()
  const now = new Date()

  try {
    if (!dryRun) {
      const lockCutoff = new Date(now.getTime() - LOCK_MINUTES * 60 * 1000).toISOString()
      const { data: runningTask } = await supabase
        .from('cron_logs')
        .select('id, started_at')
        .eq('trigger_type', 'source_repair')
        .eq('status', 'running')
        .gte('started_at', lockCutoff)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (runningTask) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: 'another_source_repair_is_running',
          runningTask,
        })
      }
    }

    const { data: rows, error: rowsError } = await supabase
      .from('info_sources')
      .select('id, name, url, type, method, fetch_type, enabled, last_test_status, last_test_message')
      .eq('enabled', false)
      .eq('last_test_status', 'failed')
      .order('created_at', { ascending: true })
      .limit(limit)
    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 })
    }

    const outcomes: RepairOutcome[] = []
    for (const row of rows ?? []) {
      const candidate = row as RepairCandidate
      if (!isRepairCandidate(candidate)) continue
      const configured = findSourceConfiguration(candidate.url, candidate.name)
      const decision = decideRepairAction(candidate, configured)
      if (decision.action === 'skip') {
        outcomes.push({
          id: candidate.id,
          name: candidate.name,
          url: candidate.url,
          method: candidate.method,
          action: 'skip',
          reason: decision.reason,
        })
        continue
      }
      const test = await runSourceTest(candidate, configured)
      outcomes.push({
        id: candidate.id,
        name: candidate.name,
        url: candidate.url,
        method: candidate.method,
        action: test.ok ? 'enable' : 'keep_disabled',
        ok: test.ok,
        itemCount: test.itemCount,
        message: test.message,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        generatedAt: now.toISOString(),
        limit,
        candidates: outcomes,
      })
    }

    const { data: logData } = await supabase
      .from('cron_logs')
      .insert({
        trigger_type: 'source_repair',
        status: 'running',
        details: { action: 'source_repair', candidates: outcomes.length },
      })
      .select('id')
      .single()
    const logId = logData?.id ?? null

    const counts = { enabled: 0, keptDisabled: 0, skipped: 0, failed: 0 }
    const errors: string[] = []
    for (const outcome of outcomes) {
      if (outcome.action === 'skip') {
        counts.skipped += 1
        continue
      }
      const configured = findSourceConfiguration(outcome.url, outcome.name)
      if (outcome.action === 'enable' && outcome.ok) {
        const update: Record<string, unknown> = {
          enabled: true,
          last_test_status: 'success',
          last_tested_at: now.toISOString(),
          last_test_message: String(outcome.message ?? '').slice(0, 500),
        }
        if (configured) {
          update.url = configured.url
          update.fetch_type = configured.type === 'rss' || configured.isRss ? 'rss' : 'web'
          const method = syncMethod(outcome.method, configured)
          if (method) update.method = method
        }
        const { error } = await supabase.from('info_sources').update(update).eq('id', outcome.id)
        if (error) {
          counts.failed += 1
          errors.push(`[${outcome.name}] ${error.message}`)
        } else {
          counts.enabled += 1
        }
        continue
      }

      const { error } = await supabase
        .from('info_sources')
        .update({
          last_test_status: 'failed',
          last_tested_at: now.toISOString(),
          last_test_message: String(outcome.message ?? '').slice(0, 500),
        })
        .eq('id', outcome.id)
      if (error) {
        counts.failed += 1
        errors.push(`[${outcome.name}] ${error.message}`)
      } else {
        counts.keptDisabled += 1
      }
    }

    if (logId) {
      await supabase
        .from('cron_logs')
        .update({
          status: errors.length > 0 ? 'error' : 'success',
          ended_at: now.toISOString(),
          error_message: errors.length > 0 ? errors.join('; ') : null,
          details: {
            action: 'source_repair',
            ...counts,
            outcomes: outcomes.map((outcome) => ({
              id: outcome.id,
              name: outcome.name,
              url: outcome.url,
              action: outcome.action,
              reason: outcome.reason ?? null,
              ok: outcome.ok ?? null,
              itemCount: outcome.itemCount ?? null,
              message: outcome.message ?? null,
            })),
          },
        })
        .eq('id', logId)
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      ...counts,
      errors,
      outcomes,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[source-repair] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
