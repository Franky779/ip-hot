// _probe_llm_block.ts — LLM 内容审核拦截探测脚本（只读，不写库）
// 用法：node --experimental-strip-types _probe_llm_block.ts
// 目的：用已知敏感标题分别打三家 LLM provider，打印原始 status + body 文本，
//      用于校准 lib/llm-errors.ts 的拦截判定正则。**不写数据库、不发请求给生产 cron**。
//
// 触发敏感词样本（取自 _sensitive_review.ts 关键词集）：
//   - 台湾独立相关
//   - 西藏独立相关
//   - 香港相关
//   - 政治敏感（如法轮功）

import { readFileSync } from 'fs'

// 加载本地 .env.local（与 _sensitive_review.ts 一致）
try {
  const envContent = readFileSync('.env.local', 'utf8')
  for (const line of envContent.split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0) {
      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()
      if (key && !process.env[key]) process.env[key] = value
    }
  }
} catch {
  console.warn('[probe] 未找到 .env.local，使用进程环境变量')
}

type Provider = {
  name: string
  baseUrl: string | undefined
  apiKey: string | undefined
  model: string | undefined
}

const PROVIDERS: Provider[] = [
  {
    name: 'DeepSeek(主力)',
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  },
  {
    name: 'Kimi(备一)',
    baseUrl: process.env.LLM_BACKUP_URL,
    apiKey: process.env.LLM_BACKUP_KEY,
    model: process.env.LLM_BACKUP_MODEL,
  },
  {
    name: 'Kimi Coding(备二)',
    baseUrl: process.env.LLM_BACKUP2_URL,
    apiKey: process.env.LLM_BACKUP2_KEY,
    model: process.env.LLM_BACKUP2_MODEL,
  },
]

// 故意使用内容审核高风险标题样本（仅用于探测，**不写库**）
const SENSITIVE_PROBES = [
  '台湾独立运动的最新发展',
  '西藏独立的历史背景',
  '香港独立的政治诉求',
  '法轮功组织在全球的传播',
]

const SYSTEM_PROMPT = '你是一个简短的助手，只需回复"OK"。'

async function probeOne(p: Provider, title: string): Promise<{ status: number; body: string }> {
  if (!p.baseUrl || !p.apiKey || !p.model) {
    return { status: 0, body: '[probe] provider 未配置' }
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${p.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `标题: ${title}\n\n内容: ` },
        ],
        temperature: 0.2,
        max_tokens: 100,
      }),
    })
    const text = await res.text()
    return { status: res.status, body: text.slice(0, 400) }
  } catch (e) {
    return { status: 0, body: `[probe] 网络异常: ${e instanceof Error ? e.message : String(e)}` }
  } finally {
    clearTimeout(timeout)
  }
}

async function main() {
  console.log('========================================')
  console.log('LLM 内容审核拦截探测（只读，不写库）')
  console.log('========================================\n')

  for (const p of PROVIDERS) {
    if (!p.baseUrl) {
      console.log(`[${p.name}] 未配置 baseUrl，跳过\n`)
      continue
    }
    console.log(`--- [${p.name}] model=${p.model} ---`)
    for (const title of SENSITIVE_PROBES) {
      const { status, body } = await probeOne(p, title)
      const verdict = status === 200 ? '✓ 通过' : status === 0 ? '⚠️ 网络异常' : '✗ 拦截'
      console.log(`  [${status}] ${verdict} | title="${title}"`)
      console.log(`     body: ${body.replace(/\n/g, ' ').slice(0, 200)}`)
    }
    console.log()
  }

  console.log('========================================')
  console.log('探测完成。请把以上 status + body 复制给开发者，')
  console.log('用于校准 lib/llm-errors.ts 的拦截判定正则。')
  console.log('========================================')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
