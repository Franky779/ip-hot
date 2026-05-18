// lib/link-checker.ts — 链接有效性预检
// 在文章入库前检查链接是否可用，过滤被拦截/失效的链接

const BLOCK_KEYWORDS = [
  '您的请求可能存在威胁',
  '已被拦截',
  '访问被拒绝',
  '拦截',
  'blocked',
  'WAF',
  '安全检查',
  '安全验证',
  '您的访问被限制',
  'Access Denied',
  'Forbidden',
  '请求过于频繁',
  '请稍后重试',
  '服务不可用',
  'Service Unavailable',
]

const BLOCK_REGEX = new RegExp(BLOCK_KEYWORDS.join('|'), 'i')

export type LinkCheckResult = {
  ok: boolean
  url: string
  status?: number
  reason?: string
}

/** 检查单个链接是否可用 */
export async function checkLink(url: string, timeoutMs = 8000): Promise<LinkCheckResult> {
  if (!url || !url.startsWith('http')) {
    return { ok: false, url, reason: 'invalid url' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // 1. 先尝试 HEAD（最快）
    let res: Response | null = null
    try {
      res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
        },
      })
    } catch {
      // HEAD 失败，继续尝试 GET
    }

    // 2. HEAD 不成功则尝试 GET
    if (!res || !res.ok) {
      try {
        res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
          },
        })
      } catch (e) {
        clearTimeout(timer)
        return {
          ok: false,
          url,
          reason: e instanceof Error ? e.message : 'fetch failed',
        }
      }
    }

    clearTimeout(timer)

    // 3. 状态码检查
    if (res.status >= 400) {
      return { ok: false, url, status: res.status, reason: `HTTP ${res.status}` }
    }

    // 4. 内容检查（只有 GET 才有 body，HEAD 跳过）
    if (res.status === 200) {
      try {
        const text = await res.text()
        if (BLOCK_REGEX.test(text)) {
          return { ok: false, url, status: res.status, reason: 'blocked by WAF/security' }
        }
      } catch {
        // 读取 body 失败，但状态码正常，视为可用
      }
    }

    return { ok: true, url, status: res.status }
  } catch (e) {
    clearTimeout(timer)
    return {
      ok: false,
      url,
      reason: e instanceof Error ? e.message : 'unknown error',
    }
  }
}

/** 批量检查链接，带并发控制 */
export async function checkLinks(
  urls: string[],
  concurrency = 5,
  timeoutMs = 8000
): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = []

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map((url) => checkLink(url, timeoutMs))
    )
    results.push(...batchResults)
  }

  return results
}
