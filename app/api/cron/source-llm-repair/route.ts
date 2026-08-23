import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import {
  proposeRepair,
  applyRepairProposal,
  type LlmRepairProposal,
} from '@/lib/source-llm-repair'
import { decideRepairAction, isRepairCandidate, runSourceTest, type RepairCandidate } from '@/lib/source-repair'
import { findSourceConfiguration } from '@/lib/sources'
import { getSourceSchedule } from '@/lib/source-schedule'

export const runtime = 'nodejs'
export const maxDuration = 300

const DEFAULT_LIMIT = 5
const LOCK_MINUTES = 120
/** 启用中的云端源连续 N 天无成功抓取，纳入 LLM 修复候选 */
const OVERDUE_DAYS = 3

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
        .eq('trigger_type', 'source_llm_repair')
        .eq('status', 'running')
        .gte('started_at', lockCutoff)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (runningTask) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: 'another_llm_repair_is_running',
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

    // 长期逾期的启用中云端源：连续 OVERDUE_DAYS 天无成功抓取（本地CDP/登录源天然不在服务器跑，排除）
    const overdueCutoff = new Date(now.getTime() - OVERDUE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: enabledRows }, { data: recentOkRuns }] = await Promise.all([
      supabase
        .from('info_sources')
        .select('id, name, url, type, method, fetch_type, enabled, last_test_status, last_test_message')
        .eq('enabled', true),
      supabase
        .from('source_fetch_runs')
        .select('source_id, source_url')
        .in('status', ['success', 'empty'])
        .gte('fetched_count', 1)
        .gte('started_at', overdueCutoff),
    ])
    const okIds = new Set((recentOkRuns ?? []).map((run) => run.source_id).filter(Boolean))
    const okUrls = new Set((recentOkRuns ?? []).map((run) => run.source_url).filter(Boolean))
    const overdueRows = (enabledRows ?? []).filter((row) => {
      if (row.type === '公众号（随手收）') return false
      if (okIds.has(row.id) || okUrls.has(row.url)) return false
      const configured = findSourceConfiguration(row.url, row.name)
      if (configured?.needsLocalCdp || configured?.loginRequired) return false
      const schedule = getSourceSchedule({
        id: row.id, name: row.name, url: row.url,
        method: row.method, type: row.type, enabled: row.enabled,
      })
      return schedule.executionMode === 'cloud'
    })
    const overdueIds = new Set(overdueRows.map((row) => row.id))
    const candidateRows = [...(rows ?? []), ...overdueRows].slice(0, limit)

    const outcomes = []
    for (const row of candidateRows) {
      const candidate = row as RepairCandidate
      const isOverdueCandidate = overdueIds.has(candidate.id)
      if (!isOverdueCandidate && !isRepairCandidate(candidate)) continue
      const configured = findSourceConfiguration(candidate.url, candidate.name)
      const decision = decideRepairAction(candidate, configured)
      if (decision.action === 'skip') {
        outcomes.push({
          id: candidate.id,
          name: candidate.name,
          url: candidate.url,
          action: 'skip',
          reason: decision.reason,
        })
        continue
      }

      // 逾期候选先用现有配置确定性重测：能过说明源没坏（只是调度漏了），不烧 LLM
      if (isOverdueCandidate) {
        const preTest = await runSourceTest(candidate, configured)
        if (preTest.ok) {
          if (!dryRun) {
            await supabase.from('info_sources').update({
              last_test_status: 'success',
              last_tested_at: now.toISOString(),
              last_test_message: `逾期自查通过：${preTest.message}`.slice(0, 500),
            }).eq('id', candidate.id)
          }
          outcomes.push({
            id: candidate.id,
            name: candidate.name,
            url: candidate.url,
            action: 'self_healed',
            verified: preTest,
          })
          continue
        }
      }

      // LLM 诊断 + 建议
      const proposalResult = await proposeRepair(candidate)
      if (!proposalResult.ok) {
        outcomes.push({
          id: candidate.id,
          name: candidate.name,
          url: candidate.url,
          action: proposalResult.needs_human ? 'needs_human' : 'llm_failed',
          error: proposalResult.error,
        })
        continue
      }
      const { proposal, verified } = proposalResult

      if (dryRun) {
        outcomes.push({
          id: candidate.id,
          name: candidate.name,
          url: candidate.url,
          action: 'proposed',
          proposal: proposal as LlmRepairProposal,
          verified,
        })
        continue
      }

      // 非 dry-run：仅当实测通过才落地
      if (!verified.ok) {
        outcomes.push({
          id: candidate.id,
          name: candidate.name,
          url: candidate.url,
          action: 'not_applied',
          proposal,
          verified,
        })
        continue
      }
      const applied = await applyRepairProposal(candidate, proposal)
      outcomes.push({
        id: candidate.id,
        name: candidate.name,
        url: proposal.url,
        action: applied.ok ? 'applied' : 'apply_failed',
        proposal,
        verified,
        error: applied.error ?? undefined,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        generatedAt: now.toISOString(),
        limit,
        outcomes,
      })
    }

    const { data: logData } = await supabase
      .from('cron_logs')
      .insert({
        trigger_type: 'source_llm_repair',
        status: 'running',
        details: { action: 'source_llm_repair', candidates: outcomes.length },
      })
      .select('id')
      .single()
    const logId = logData?.id ?? null

    const counts = { applied: 0, notApplied: 0, needsHuman: 0, llmFailed: 0, skipped: 0, failed: 0, selfHealed: 0 }
    for (const o of outcomes) {
      if (o.action === 'applied') counts.applied += 1
      else if (o.action === 'not_applied') counts.notApplied += 1
      else if (o.action === 'needs_human') counts.needsHuman += 1
      else if (o.action === 'llm_failed') counts.llmFailed += 1
      else if (o.action === 'skip') counts.skipped += 1
      else if (o.action === 'self_healed') counts.selfHealed += 1
      else counts.failed += 1
    }

    if (logId) {
      await supabase.from('cron_logs').update({
        status: 'success',
        ended_at: now.toISOString(),
        details: { action: 'source_llm_repair', ...counts, outcomes },
      }).eq('id', logId)
    }

    return NextResponse.json({ ok: true, timestamp: now.toISOString(), ...counts, outcomes })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[source-llm-repair] 未捕获异常:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
