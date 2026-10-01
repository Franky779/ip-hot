import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/lib/admin-auth'
import { isLlmPurpose, listBudgetSnapshots, setBudget } from '@/lib/llm-budget'
import { purgeOldReceipts } from '@/lib/llm-receipts'

export const dynamic = 'force-dynamic'

/** 管理员查看：各用途的用量、上限、熔断状态与今日统计 */
export async function GET(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const budgets = await listBudgetSnapshots()
    return NextResponse.json({ budgets })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

/** 管理员操作：调整上限 / 开关熔断 / 清理旧回执 */
export async function POST(request: Request) {
  if (!isAdminAuthenticated(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 })

    if (body.action === 'purge') {
      const parsedDays = Number(body.retentionDays)
      const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.trunc(parsedDays) : 30
      const deleted = await purgeOldReceipts(days)
      return NextResponse.json({ ok: true, deleted })
    }

    if (!isLlmPurpose(body.purpose)) {
      return NextResponse.json({ error: 'purpose 必须是 summarize / prefilter / score / relate' }, { status: 400 })
    }

    const toOptionalNumber = (value: unknown): number | undefined => {
      if (value === undefined || value === null || value === '') return undefined
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : Number.NaN
    }

    const row = await setBudget(body.purpose, {
      minute: toOptionalNumber(body.minute),
      hour: toOptionalNumber(body.hour),
      day: toOptionalNumber(body.day),
      enabled: body.enabled === undefined ? undefined : body.enabled === true,
    })
    return NextResponse.json({ ok: true, budget: row })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    )
  }
}
