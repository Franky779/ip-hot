import { NextResponse } from 'next/server'
import { getDailyReport } from '@/lib/daily-report'
import { isPeriodKind, isValidDateKey, previousPeriodStart } from '@/lib/period-utils'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * A4 周期报告定时生成入口。
 *
 * 三个 timer 各调一次，只传 period，date 由服务端按「上一周期」推算：
 *   ip-hot-daily.timer    每日 06:10 生成昨天日报
 *   ip-hot-weekly.timer   每周一 10:00 生成上周周报
 *   ip-hot-monthly.timer  每月 1 日 10:30 生成上月月报
 * 传 date=... 可手动补跑指定周期。
 *
 * 与旧 cron-daily-report.sh 的区别：
 *   1. 走 systemd timer 而非 crontab（有 Persistent=true，重启后补跑，状态可查）
 *   2. 日期在服务端算，timer 配置里不含会过期的硬编码日期
 *   3. 返回结构化结果，日志可 grep 出失败
 */
async function run(request: Request) {
  const startedAt = new Date().toISOString()
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'daily'
  const explicitDate = searchParams.get('date')

  if (!isPeriodKind(period)) {
    return NextResponse.json(
      { ok: false, error: 'period 必须是 daily / weekly / monthly' },
      { status: 400 },
    )
  }

  let date = explicitDate
  if (date === null) {
    date = previousPeriodStart(period) ?? ''
  }
  if (!isValidDateKey(date)) {
    return NextResponse.json(
      { ok: false, error: 'date 必须是 YYYY-MM-DD（周期起始日），或省略由服务端推算上一周期' },
      { status: 400 },
    )
  }

  try {
    const report = await getDailyReport(period, date)
    const result = {
      ok: Boolean(report.summary),
      period,
      date,
      totalCount: report.totalCount,
      hasSummary: Boolean(report.summary),
      hotEvents: report.insights?.hotEvents.length ?? 0,
      activeIps: report.insights?.activeIps.length ?? 0,
      licensingLeads: report.insights?.licensingLeads.length ?? 0,
    }
    if (!result.ok) {
      console.warn(`[period-report] ${period} ${date} 未产出摘要（${report.totalCount} 条资讯）`)
    } else {
      console.log(
        `[period-report] ${period} ${date} 完成：${report.totalCount} 条 · ` +
        `热点事件 ${result.hotEvents} · 活跃IP ${result.activeIps} · 授权线索 ${result.licensingLeads}`,
      )
    }
    return NextResponse.json({ ...result, startedAt })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error)
    console.error(`[period-report] ${period} ${date} 失败:`, message)
    return NextResponse.json({ ok: false, error: message, period, date, startedAt }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
