#!/usr/bin/env node
// scripts/rebuild-period-html.mjs
// A4 上线后刷新历史日报/周报/月报的 HTML：把新板块（数据快照 / 热点事件 /
// 活跃 IP / 授权线索）补到已经生成过的报告上。
//
// 关键点：**不重跑 LLM**。导语与要点已在 daily_reports 缓存里，
// 重跑既慢又可能因为换模型导致历史报告措辞变样。走
// /api/admin/backfill-daily?rebuild=1，服务端只重渲染 HTML。
//
// 用法（服务器上）：
//   source .env.production.local
//   node scripts/rebuild-period-html.mjs                    # 全部周期
//   node scripts/rebuild-period-html.mjs --period=weekly    # 只刷周报
//   node scripts/rebuild-period-html.mjs --limit=10         # 每个周期最多 10 期
//   node scripts/rebuild-period-html.mjs --dry              # 只列出会刷哪些，不执行

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const only = args.find((a) => a.startsWith('--period='))?.split('=')[1]
const limitArg = args.find((a) => a.startsWith('--limit='))?.split('=')[1]
const limit = limitArg ? Number(limitArg) : 0

const BASE = (process.env.SITE_INTERNAL_URL || 'http://127.0.0.1:3101').replace(/\/+$/, '')
const SECRET = process.env.CRON_SECRET || process.env.LLM_WORKER_SECRET
if (!SECRET) {
  console.error('❌ 缺少 CRON_SECRET / LLM_WORKER_SECRET 环境变量')
  process.exit(1)
}

const PERIODS = ['daily', 'weekly', 'monthly'].filter((p) => !only || p === only)
if (PERIODS.length === 0) {
  console.error(`❌ --period 只接受 daily / weekly / monthly，收到：${only}`)
  process.exit(1)
}

async function call(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function main() {
  for (const period of PERIODS) {
    const query = new URLSearchParams({ period, rebuild: '1' })
    if (limit > 0) query.set('limit', String(limit))

    process.stdout.write(`[${period}] `)
    if (dry) {
      console.log(`将调用 POST ${BASE}/api/admin/backfill-daily?${query}`)
      continue
    }

    try {
      const result = await call(`/api/admin/backfill-daily?${query}`)
      const gen = result.totalGen ?? 0
      const skip = result.totalSkip ?? 0
      const fail = result.totalFail ?? 0
      console.log(`重渲染完成 生成=${gen} 跳过=${skip} 失败=${fail}`)
      for (const line of result.results ?? []) {
        if (typeof line === 'string' && !line.startsWith('===')) console.log(`    ${line}`)
      }
      if (fail > 0) process.exitCode = 1
    } catch (e) {
      console.error(`失败：${e instanceof Error ? e.message : String(e)}`)
      process.exitCode = 1
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
