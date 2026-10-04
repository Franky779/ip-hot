import { NextResponse } from 'next/server'
import { refreshHeat } from '@/lib/events/hot'
import { clusterRound } from '@/lib/events/group'
import { runIndustryGate } from '@/lib/events/industry-gate'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * A1 事件聚簇 + A2 热度刷新 + A8 行业价值闸门（ip-hot-group.timer 每 15 分钟一轮）。
 * 每轮：刷新热度 → 聚簇最多 20 篇入选文章（每篇最多 8 个 pair）
 *      → 判定最多 25 个新事件对授权从业者有没有价值。
 * 手动补跑：POST /api/cron/group-events?maxTargets=50&gate=40
 */
async function run(request: Request) {
  const startedAt = new Date().toISOString()
  const { searchParams } = new URL(request.url)
  const maxTargets = Math.min(60, Math.max(1, Number(searchParams.get('maxTargets') ?? '20') || 20))
  const gateLimit = Math.min(60, Math.max(1, Number(searchParams.get('gate') ?? '25') || 25))

  try {
    const heat = await refreshHeat()
    const cluster = await clusterRound({ maxTargets })
    // 闸门放在聚簇之后：新事件先聚簇再判定，避免同批事件重复判定
    const gate = await runIndustryGate(gateLimit)
    console.log(
      `[group-events] heatEvents=${heat.events} orphansDeleted=${heat.orphansDeleted} ` +
      `targets=${cluster.targetsConsidered} pairs=${cluster.pairsJudged} ` +
      `joined=${cluster.joined} created=${cluster.created} merged=${cluster.merged} failed=${cluster.failed} ` +
      `| gate checked=${gate.checked} relevant=${gate.relevant} irrelevant=${gate.irrelevant} gateFailed=${gate.failed}`,
    )
    return NextResponse.json({ ok: true, startedAt, heat, cluster, gate })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error)
    console.error('[group-events] failed:', message)
    return NextResponse.json({ ok: false, error: message, startedAt }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
