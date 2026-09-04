// lib/feishu-alert.ts — 飞书告警模块
// 复用现有「claudecode飞书」bot 的自建应用凭据（FEISHU_APP_ID / FEISHU_APP_SECRET），
// 通过飞书开放平台 OpenAPI 直接给指定用户发消息，无需自定义机器人 webhook。

let cachedToken: { value: string; expiresAt: number } | null = null

/** 换取 tenant_access_token（2 小时有效，进程内缓存，过期前 5 分钟刷新） */
async function getTenantToken(): Promise<string | null> {
  const appId = process.env.FEISHU_APP_ID
  const appSecret = process.env.FEISHU_APP_SECRET
  if (!appId || !appSecret) {
    console.warn('[Feishu] 未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，告警无法发送')
    return null
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.value
  }
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const data = (await res.json()) as { code?: number; tenant_access_token?: string; expire?: number }
    if (!data?.tenant_access_token) {
      console.error('[Feishu] 换取 tenant_access_token 失败:', JSON.stringify(data).slice(0, 200))
      return null
    }
    cachedToken = { value: data.tenant_access_token, expiresAt: Date.now() + (data.expire || 7200) * 1000 }
    return cachedToken.value
  } catch (e) {
    console.error('[Feishu] 换取 token 异常:', e instanceof Error ? e.message : String(e))
    return null
  }
}

/** 用现有 bot 给 FEISHU_ALERT_OPEN_ID 指定的用户发文本消息。返回是否成功。 */
export async function sendFeishuAlert(text: string): Promise<boolean> {
  const openId = process.env.FEISHU_ALERT_OPEN_ID
  if (!openId) {
    console.warn('[Feishu] 未配置 FEISHU_ALERT_OPEN_ID，告警无法发送')
    return false
  }
  try {
    const token = await getTenantToken()
    if (!token) return false
    const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: openId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    })
    if (!res.ok) {
      console.error('[Feishu] 告警发送失败:', res.status, (await res.text()).slice(0, 200))
      return false
    }
    const data = (await res.json()) as { code?: number }
    return data?.code === 0
  } catch (e) {
    console.error('[Feishu] 告警发送异常:', e instanceof Error ? e.message : String(e))
    return false
  }
}

const ALERT_AGGREGATE_WINDOW_MS = 90 * 1000

let aggregator: {
  lastSentAt: number
  merged: number
  exportTimer: ReturnType<typeof setTimeout> | null
} = { lastSentAt: 0, merged: 0, exportTimer: null }

/**
 * 90 秒窗口内去重合并的告警发送：窗口内重复调用只发第一条，后续静默合并计数；
 * 窗口翻转后若累计了合并数，主动补发一条汇总（不再污染下一条告警正文）。
 * `now` 参数仅供测试注入。用于批量并行告警场景（如一批 N 篇文章同时 LLM 失败），避免刷屏。
 */
export async function sendFeishuAlertAggregated(text: string, now: number = Date.now()): Promise<boolean> {
  if (now - aggregator.lastSentAt < ALERT_AGGREGATE_WINDOW_MS) {
    aggregator.merged += 1
    return true
  }

  aggregator.lastSentAt = now
  const ok = await sendFeishuAlert(text)

  if (!aggregator.exportTimer) {
    aggregator.exportTimer = setTimeout(async () => {
      aggregator.exportTimer = null
      if (aggregator.merged > 0) {
        const n = aggregator.merged
        aggregator.merged = 0
        const minutes = Math.round(ALERT_AGGREGATE_WINDOW_MS / 60000)
        await sendFeishuAlert(`【IP-HOT告警】刚才 ${minutes} 分钟内另有 ${n} 条同类告警已合并，不再逐条推送。`)
      }
    }, ALERT_AGGREGATE_WINDOW_MS)
  }

  return ok
}

/** 测试用：清空聚合器状态（含挂起的合并汇总定时器） */
export function _resetAlertAggregator(): void {
  if (aggregator.exportTimer) {
    clearTimeout(aggregator.exportTimer)
  }
  aggregator = { lastSentAt: 0, merged: 0, exportTimer: null }
}