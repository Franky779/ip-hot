// lib/prompts.ts — 提示词外置与版本化（B4）
//
// 铁律：
// 1. 提示词正文只存在于 prompts/*.md，代码里不再硬编码第二份。
// 2. version = 文件内容 sha256 前 12 位。改提示词 = 换版本号，
//    写进 llm_receipts.prompt_version 与 articles.prompt_version，可事后追溯。
// 3. 改提示词只影响之后新处理的资料：历史文章不重算，
//    且 input_hash 变了 → 旧回执不会被误复用（宁可重新付费一次，不复用旧标准的结果）。
// 4. 文件缺失或读取失败一律抛错，绝不静默回退到内置副本——
//    否则「改提示词」在生产上会变成「有时生效有时不生效」。

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PromptName =
  | 'article-score'
  | 'event-relate'
  | 'event-summary'
  | 'event-industry-gate'
  | 'period-report'
  | 'source-repair'

export type Prompt = {
  name: PromptName
  /** 渲染后的最终提示词（已替换占位符） */
  text: string
  /** 文件内容哈希前 12 位，即提示词版本号 */
  version: string
  /** 原始文件内容（未渲染），用于把渲染值也算进回执哈希 */
  raw: string
}

const cache = new Map<PromptName, { raw: string; version: string }>()

function promptDir(): string {
  return process.env.PROMPTS_DIR || join(process.cwd(), 'prompts')
}

/** 读文件 + 算版本号（进程内缓存，文件改动需重启才生效——这是刻意的） */
export function loadPromptFile(name: PromptName): { raw: string; version: string } {
  const cached = cache.get(name)
  if (cached) return cached

  const path = join(promptDir(), `${name}.md`)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(
      `[prompts] 读取提示词文件失败：${path}（${e instanceof Error ? e.message : String(e)}）。` +
      '提示词必须随 release 部署，缺失时不得静默降级。',
    )
  }
  if (!raw.trim()) {
    throw new Error(`[prompts] 提示词文件为空：${path}`)
  }

  const version = createHash('sha256').update(raw).digest('hex').slice(0, 12)
  const entry = { raw, version }
  cache.set(name, entry)
  return entry
}

/** 替换 {{KEY}} 占位符；未提供的占位符原样保留（便于排错时一眼看出漏配） */
function render(raw: string, vars: Record<string, string>): string {
  return raw.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  )
}

/** 加载并渲染提示词。vars 里的值会参与版本追踪：版本号只反映文件内容，不含运行时变量。 */
export function getPrompt(name: PromptName, vars: Record<string, string> = {}): Prompt {
  const { raw, version } = loadPromptFile(name)
  return { name, raw, version, text: render(raw, vars) }
}

/** 只取版本号，不渲染（写 articles.prompt_version 用） */
export function promptVersion(name: PromptName): string {
  return loadPromptFile(name).version
}

/** 当前生效的全部提示词版本（/api/admin/prompt-versions 与部署核对用） */
export function allPromptVersions(): Array<{ name: PromptName; version: string }> {
  const names: PromptName[] = [
    'article-score',
    'event-relate',
    'event-summary',
    'period-report',
    'source-repair',
  ]
  return names.map((name) => ({ name, version: promptVersion(name) }))
}

/** 仅供测试：清空缓存 */
export function resetPromptCache(): void {
  cache.clear()
}
