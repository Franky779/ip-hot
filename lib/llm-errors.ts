// lib/llm-errors.ts — LLM 调用错误分类（零依赖纯函数，便于单测）
// 区分「内容安全拦截」（网关拿敏感词挡内容，非服务故障）与「真故障」（余额/Key/并发/网络）。
//
// 判定策略（2026-09-05 阶段 1 重构）：
// 1. 先从错误 message 头部解析 HTTP status（callLLM 抛错格式："API {status}: {body前200}"）
// 2. 内容拦截的本质信号是"body 出现审核特征词"，与 status 无关：
//    - 强特征词（敏感词 / content_filter / content exists risk / data inspection / 内容审核 / 违规内容）
//      无论 status 是什么，只要出现就判 content_blocked
//    - 弱特征词（risk / blocked / safety / inappropriate / invalid prompt）
//      仅在与 status=400 同时命中才判 blocked（避免 5xx 错误中通用词误伤）
// 3. 真故障：401（key无效）/ 402（余额不足）/ 429（限流）/ 5xx（服务端）且无强特征词 → outage
// 4. 无 status 时：仅凭强特征词判定，弱特征词不足以判 blocked
// 5. 拿不到 status 也无强特征词 → 保守降级 outage

/** LLM 失败类型：content_blocked = 网关内容安全拦截（非故障）；outage = 余额/Key/并发/网络等真故障 */
export type LlmFailureKind = 'content_blocked' | 'outage'

/** 从 callLLM 抛出的 message 头部解析 HTTP status。返回 null 表示解析失败。 */
export function parseApiStatus(message: string): number | null {
  const m = message.match(/\bAPI\s+(\d{3})\b/)
  return m ? Number(m[1]) : null
}

/** 强特征词：单独出现就足以判定为内容拦截（与 status 无关） */
const STRONG_BLOCKED_RE =
  /sensitive|敏感词|content[\s_]filter|content[\s_]exists[\s_]risk|data[\s_]inspection|内容审核|违规内容/i

/** 弱特征词：必须与 status=400 同时命中才判定为内容拦截（避免 5xx 错误中通用词误伤） */
const WEAK_BLOCKED_RE = /\brisk\b|\bblocked\b|\bsafety\b|inappropriate|invalid[_\s]prompt/i

/** 将 LLM 调用错误分类为「内容拦截」或「真故障」 */
export function classifyLlmError(error: unknown): LlmFailureKind {
  const message = error instanceof Error ? error.message : String(error)
  const status = parseApiStatus(message)

  // 优先级 1：强特征词（无论 status 直接判 blocked）—— 拦截的本质信号在 body 不在 status
  if (STRONG_BLOCKED_RE.test(message)) return 'content_blocked'

  // 优先级 2：弱特征词必须与 status=400/403 同时命中
  // 400=请求格式或参数被拒，403=禁止访问，语义上都常用于内容拦截
  if ((status === 400 || status === 403) && WEAK_BLOCKED_RE.test(message)) return 'content_blocked'

  // 真故障：401/402/429/5xx 且无强特征词
  if (status !== null) {
    if (status === 401 || status === 402 || status === 429 || status >= 500) {
      return 'outage'
    }
    if (status === 400) {
      // 400 但无审核特征（如 JSON 格式错误）按真故障
      return 'outage'
    }
  }

  // 无 status 且无强特征词：保守降级为 outage
  return 'outage'
}
