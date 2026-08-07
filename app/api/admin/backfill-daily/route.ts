import { NextResponse } from 'next/server'
import { getAvailableDates, getDailyReport } from '@/lib/daily-report'

export const dynamic = 'force-dynamic'

const PERIODS = ['daily', 'weekly', 'monthly'] as const

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') || '0') || 0
  const singleDate = searchParams.get('date')           // YYYY-MM-DD
  const singlePeriod = searchParams.get('period')       // daily | weekly | monthly

  const results: string[] = []
  let totalGen = 0, totalSkip = 0, totalFail = 0

  // 单日期模式（cron 触发）
  if (singleDate && singlePeriod && PERIODS.includes(singlePeriod as any)) {
    const period = singlePeriod as 'daily' | 'weekly' | 'monthly'
    try {
      const report = await getDailyReport(period, singleDate)
      if (report.summary) {
        results.push(`✅ ${period} ${singleDate} — ${report.totalCount}条`)
        totalGen++
      } else {
        results.push(`⚠️ ${period} ${singleDate} — ${report.totalCount}条`)
        totalSkip++
      }
    } catch (e) {
      results.push(`❌ ${period} ${singleDate} — ${(e as Error).message?.slice(0, 80)}`)
      totalFail++
    }
    return NextResponse.json({ ok: true, totalGen, totalSkip, totalFail, results })
  }

  // 全量模式（手动触发）
  for (const period of PERIODS) {
    results.push(`\n=== ${period} ===`)
    const dates = await getAvailableDates(period)
    results.push(`${dates.length} 个周期`)

    let processed = 0
    for (const d of dates) {
      if (limit > 0 && processed >= limit) break
      processed++

      const label = `[${processed}/${Math.min(dates.length, limit || dates.length)}] ${period} ${d.value}`
      try {
        const report = await getDailyReport(period, d.value)
        if (report.summary) {
          results.push(`✅ ${label} — ${report.totalCount}条`)
          totalGen++
        } else if (report.totalCount > 0) {
          results.push(`⚠️ ${label} — ${report.totalCount}条, LLM未生成`)
          totalSkip++
        } else {
          results.push(`⏭️ ${label} — 无文章`)
          totalSkip++
        }
      } catch (e) {
        results.push(`❌ ${label} — ${(e as Error).message?.slice(0, 80)}`)
        totalFail++
      }

      if (processed < Math.min(dates.length, limit || dates.length)) {
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }

  results.push(`\n=== 完成 ===`)
  results.push(`生成: ${totalGen} | 跳过: ${totalSkip} | 失败: ${totalFail}`)

  return NextResponse.json({ ok: true, totalGen, totalSkip, totalFail, results })
}
