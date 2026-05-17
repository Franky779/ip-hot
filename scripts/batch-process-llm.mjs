#!/usr/bin/env node
// 批量处理积压文章的LLM，双模型两轮策略
// 第一轮：gpt-5-mini → 第二轮：kimi-k2.6 处理失败样本

const API_BASE = 'http://localhost:3000'
const AUTH = 'Bearer ip-hot-cron-2026'

async function callApi(endpoint) {
  const start = Date.now()
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: AUTH },
      signal: AbortSignal.timeout(120000)
    })
    const json = await res.json()
    const elapsed = Date.now() - start
    return { ok: true, data: json, elapsed }
  } catch (e) {
    const elapsed = Date.now() - start
    return { ok: false, error: e.message, elapsed }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const maxRounds = 120
  let totalProcessed = 0
  let totalFailed = 0

  console.log(`批量处理开始，最多跑 ${maxRounds} 轮`)
  console.log('='.repeat(50))

  for (let i = 1; i <= maxRounds; i++) {
    console.log(`\n--- 第 ${i} 轮 ---`)

    // 先跑 fetch-and-process（8条LLM + RSS抓取）
    const fetchRes = await callApi('/api/cron/fetch-and-process')
    let fetchOk = 0, fetchFail = 0
    if (fetchRes.ok && fetchRes.data.llm) {
      fetchOk = fetchRes.data.llm.processed || 0
      fetchFail = fetchRes.data.llm.failed || 0
      console.log(`  fetch-and-process: 成功 ${fetchOk} 失败 ${fetchFail} | 耗时 ${fetchRes.elapsed}ms`)
    } else {
      console.log(`  fetch-and-process: 错误 ${fetchRes.error || JSON.stringify(fetchRes.data)} | 耗时 ${fetchRes.elapsed}ms`)
    }

    // 再跑 process-llm（3条）
    const procRes = await callApi('/api/cron/process-llm')
    let procOk = 0, procFail = 0
    if (procRes.ok && procRes.data.total !== undefined) {
      procOk = procRes.data.processed || 0
      procFail = procRes.data.failed || 0
      console.log(`  process-llm:     成功 ${procOk} 失败 ${procFail} | 耗时 ${procRes.elapsed}ms`)
    } else {
      console.log(`  process-llm:     错误 ${procRes.error || JSON.stringify(procRes.data)} | 耗时 ${procRes.elapsed}ms`)
    }

    const roundTotal = fetchOk + procOk
    const roundFail = fetchFail + procFail
    totalProcessed += roundTotal
    totalFailed += roundFail

    console.log(`  本轮合计: 成功 ${roundTotal} 失败 ${roundFail} | 累计: ${totalProcessed}`)

    // 如果两轮都处理0条，说明积压清完了
    if (fetchOk === 0 && procOk === 0) {
      console.log(`\n积压文章已清空！共跑 ${i} 轮，累计处理 ${totalProcessed} 条`)
      break
    }

    // 每轮间隔等待API冷却
    if (i < maxRounds) {
      console.log(`  等待 60s 冷却...`)
      await sleep(60000)
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log(`批量处理结束。累计成功: ${totalProcessed} 条，失败: ${totalFailed} 条`)
}

main().catch(console.error)
