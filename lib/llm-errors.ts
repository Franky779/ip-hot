// lib/llm-errors.ts — LLM 调用错误分类（零依赖纯函数，便于单测）
// 区分「内容安全拦截」（网关拿敏感词挡内容，非服务故障）与「真故障」（余额/Key/并发/网络）。

/** LLM 失败类型：content_blocked = 网关内容安全拦截（非故障）；outage = 余额/Key/并发/网络等真故障 */
export type LlmFailureKind = 'content_blocked' | 'outage'

/** 网关内容安全拦截的判据：错误正文出现 sensitive / 敏感词 / blocked / content filter / safety 等字样 */
const CONTENT_BLOCKED_RE = /sensitive|敏感词|blocked|content\s?filter|safety/i

/** 将 LLM 调用错误分类为「内容拦截」或「真故障」 */
export function classifyLlmError(error: unknown): LlmFailureKind {
  const message = error instanceof Error ? error.message : String(error)
  if (CONTENT_BLOCKED_RE.test(message)) return 'content_blocked'
  return 'outage'
}