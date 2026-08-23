// lib/source-llm-repair.ts — LLM 驱动的信息源自主修复模块（骨架）
//
// 工作流：
//   1. 加载知识库条目（docs/source-fix-kb/entries/*.md）作为上下文
//   2. 把源信息 + 症状 + 知识库喂给 LLM，让其输出结构化修复建议
//   3. 用 runSourceTest() 实测 LLM 建议的新配置，通过才落地
//   4. 返回结构化结果，交由 /api/cron/source-llm-repair 落地
//
// 安全红线：
//   - LLM 只输出"建议"，绝不直接写库；必须经 runSourceTest() 实测通过。
//   - 登录源 / 需要本地 CDP 的源 → needs_human=true，不自动启用。
//   - 不信任 LLM 给的 URL/选择器文本，落地前一律实测。

import { createServiceClient } from './supabase.ts'
import { runSourceTest, type RepairCandidate } from './source-repair.ts'
import { findSourceConfiguration } from './sources.ts'
import { getSourceSchedule } from './source-schedule.ts'
import { promises as fs } from 'fs'
import path from 'path'

export type LlmRepairProposal = {
  /** 建议的抓取类型：rss | web | gov */
  type: 'rss' | 'web' | 'gov'
  /** 建议使用的 URL（可为原地址或新地址） */
  url: string
  /** 若为 web/gov，建议的 scrapeConfig */
  scrapeConfig?: Record<string, unknown>
  /** 是否需要人工介入（登录源/本地CDP/复杂反爬/不确定） */
  needs_human: boolean
  /** 是否需要本地 CDP */
  needsLocalCdp?: boolean
  /** 是否需登录 */
  loginRequired?: boolean
  /** 诊断结论 */
  diagnosis: string
  /** 选用方案的理由 */
  reasoning: string
  /** 置信度 0-1 */
  confidence: number
}

export type LlmRepairResult =
  | { ok: true; proposal: LlmRepairProposal; verified: { ok: boolean; itemCount: number; message: string } }
  | { ok: false; error: string; needs_human?: boolean }

/** LLM 提供商配置（与 lib/llm.ts 同源环境变量） */
type RepairProvider = {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

function repairProviders(): RepairProvider[] {
  return [
    { name: 'DeepSeek', baseUrl: process.env.LLM_BASE_URL || '', apiKey: process.env.LLM_API_KEY || '', model: process.env.LLM_MODEL || 'deepseek-v4-flash' },
    { name: 'Kimi', baseUrl: process.env.LLM_BACKUP_URL || '', apiKey: process.env.LLM_BACKUP_KEY || '', model: process.env.LLM_BACKUP_MODEL || 'kimi-k2.6' },
    { name: 'Kimi Coding', baseUrl: process.env.LLM_BACKUP2_URL || '', apiKey: process.env.LLM_BACKUP2_KEY || '', model: process.env.LLM_BACKUP2_MODEL || 'kimi-for-coding' },
  ].filter((p) => p.baseUrl && p.apiKey && p.model)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** 调用单个 LLM，返回解析后的 JSON 对象 */
async function callRepairLlm(
  provider: RepairProvider,
  systemPrompt: string,
  userPrompt: string,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  const endpoint = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // 不传 temperature：kimi-for-coding 端点只允许 temperature=1，省略时各家均用默认值（2026-08-23 服务器实测）
        max_tokens: 4000,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    const message = data.choices?.[0]?.message
    // 推理型模型可能把正文放在 content，也可能 token 用尽只剩 reasoning_content；取不到正文时退用 reasoning 摘要
    const raw: string = message?.content || message?.reasoning_content || ''
    if (!raw) throw new Error('Empty response')
    const jsonMatch = raw.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) throw new Error(`No JSON in: ${raw.slice(0, 120)}`)
    return JSON.parse(jsonMatch[0])
  } finally {
    clearTimeout(timeout)
  }
}

/** 读取知识库条目文本（作为 LLM 上下文） */
export async function loadKnowledgeBase(): Promise<string> {
  const dir = path.join(process.cwd(), 'docs', 'source-fix-kb', 'entries')
  const entriesDir = path.join(dir, '..')
  try {
    await fs.access(entriesDir)
  } catch {
    return ''
  }
  try {
    const files = await fs.readdir(dir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    const contents = await Promise.all(
      mdFiles.map((f) => fs.readFile(path.join(dir, f), 'utf8').catch(() => '')),
    )
    return contents.filter(Boolean).join('\n\n---\n\n')
  } catch {
    return ''
  }
}

const REPAIR_SYSTEM_PROMPT = `你是一名信息源抓取调试工程师，负责修复网站信息源抓取失败问题。
你只能输出一个 JSON 对象，不要输出任何其它文字。

修复原则：
1. 你的输出只是"建议"，会由系统用 runSourceTest() 实测验证后才落地。
2. 如果你不确定（需要登录、需要浏览器 CDP、复杂反爬、无法从已有信息判断），设置 needs_human=true，此时不要给出具体落地配置。
3. 优先选择最简单可行的抓取方式：原生 RSS > 静态 HTML 抓取(scrapeConfig) > JSON 接口 > 需要 CDP。
4. 第三方 RSSHub 只作备选。
5. 只根据输入的症状和知识库判断，不要臆测。

输出 JSON 格式（严格）：
{"type":"rss|web|gov","url":"...","scrapeConfig":{...}或省略,"needs_human":false,"needsLocalCdp":false,"loginRequired":false,"diagnosis":"根因诊断","reasoning":"为什么选这个方案","confidence":0.8}`

/** 为单个源生成修复建议（不落地，仅诊断+建议） */
export async function proposeRepair(candidate: RepairCandidate): Promise<LlmRepairResult> {
  const providers = repairProviders()
  if (!providers.length) {
    return { ok: false, error: '未配置可用的 LLM。' }
  }

  const configured = findSourceConfiguration(candidate.url, candidate.name)
  // 安全红线：登录源 / 本地 CDP 源不自动修
  if (configured?.loginRequired) {
    return { ok: false, error: '登录源需人工处理。', needs_human: true }
  }
  if (configured?.needsLocalCdp) {
    return { ok: false, error: '本地 CDP 源需人工处理。', needs_human: true }
  }

  const kb = await loadKnowledgeBase()
  const schedule = getSourceSchedule({
    id: candidate.id,
    name: candidate.name,
    url: candidate.url,
    method: candidate.method,
    type: candidate.type,
    enabled: candidate.enabled,
  })

  const userPrompt = `信息源信息：
- id: ${candidate.id}
- name: ${candidate.name}
- url: ${candidate.url}
- 数据库 type: ${candidate.type ?? 'null'}
- fetch_type: ${candidate.fetch_type ?? 'null'}
- 当前 method: ${candidate.method ?? 'null'}
- 当前调度: ${JSON.stringify(schedule)}
- enabled: ${candidate.enabled}
- 最近测试状态: ${candidate.last_test_status}
- 最近测试错误: ${candidate.last_test_message}

请诊断该源为何失败，并给出可落地的新配置建议（URL / 类型 / scrapeConfig）。`

  let lastError = ''
  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parsed = await callRepairLlm(
          provider,
          REPAIR_SYSTEM_PROMPT + (kb ? `\n\n参考知识库（此前修好的源）：\n${kb.slice(0, 6000)}` : ''),
          userPrompt,
        )
        const proposal: LlmRepairProposal = {
          type: parsed.type === 'rss' || parsed.type === 'web' || parsed.type === 'gov' ? parsed.type : candidate.type === 'rss' ? 'rss' : 'web',
          url: String(parsed.url || candidate.url),
          scrapeConfig: parsed.scrapeConfig && typeof parsed.scrapeConfig === 'object' ? parsed.scrapeConfig as Record<string, unknown> : undefined,
          needs_human: parsed.needs_human === true,
          needsLocalCdp: parsed.needsLocalCdp === true,
          loginRequired: parsed.loginRequired === true,
          diagnosis: String(parsed.diagnosis || ''),
          reasoning: String(parsed.reasoning || ''),
          confidence: Number(parsed.confidence) || 0.5,
        }
        if (proposal.needs_human || proposal.needsLocalCdp || proposal.loginRequired) {
          return { ok: false, error: proposal.diagnosis || '需人工介入', needs_human: true }
        }
        return { ok: true, proposal, verified: await verifyProposal(candidate, proposal) }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        console.warn(`[source-llm-repair] ${provider.name} 第${attempt + 1}次失败:`, lastError.slice(0, 160))
      }
      if (attempt < 1) await sleep(2000)
    }
  }
  return { ok: false, error: `LLM 全部失败: ${lastError}` }
}

/** 用真实测试逻辑验证 LLM 建议的新配置 */
export async function verifyProposal(
  candidate: RepairCandidate,
  proposal: LlmRepairProposal,
): Promise<{ ok: boolean; itemCount: number; message: string }> {
  const testCandidate: RepairCandidate = {
    ...candidate,
    url: proposal.url,
    fetch_type: proposal.type === 'rss' ? 'rss' : 'web',
  }
  const result = await runSourceTest(testCandidate, {
    id: candidate.id,
    name: candidate.name,
    url: proposal.url,
    language: 'zh',
    priority: 'P1',
    type: proposal.type,
    isRss: proposal.type === 'rss',
    scrapeConfig: proposal.scrapeConfig as never,
  })
  return { ok: result.ok, itemCount: result.itemCount, message: result.message }
}

/** 供 API 使用：把已验证通过的 LLM 建议落地到 info_sources 表 */
export async function applyRepairProposal(
  candidate: RepairCandidate,
  proposal: LlmRepairProposal,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceClient()
  const { ok, message } = await runSourceTest(
    {
      ...candidate,
      url: proposal.url,
      fetch_type: proposal.type === 'rss' ? 'rss' : 'web',
    },
    {
      id: candidate.id,
      name: candidate.name,
      url: proposal.url,
      language: 'zh',
      priority: 'P1',
      type: proposal.type,
      isRss: proposal.type === 'rss',
      scrapeConfig: proposal.scrapeConfig as never,
    },
  )
  if (!ok) {
    return { ok: false, error: `实测未通过，不落地：${message}` }
  }
  const { error } = await supabase.from('info_sources').update({
    url: proposal.url,
    fetch_type: proposal.type === 'rss' ? 'rss' : 'web',
    enabled: true,
    last_test_status: 'success',
    last_tested_at: new Date().toISOString(),
    last_test_message: `LLM 修复：${proposal.reasoning}`.slice(0, 500),
  }).eq('id', candidate.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
