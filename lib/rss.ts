import Parser from 'rss-parser'
import { spawnSync } from 'child_process'

export function createFeedParser(timeout?: number) {
  return new Parser({
    ...(timeout ? { timeout } : {}),
    customFields: {
      item: [
        ['media:content', 'mediaContent', { keepArray: true }],
        ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
        ['content:encoded', 'contentEncoded'],
      ],
    },
  })
}

/**
 * 修复 XML 中未转义的裸 `&`（如 `<image>...code=abc&</image>`）。
 * 把 `&` 后跟的不是合法实体（&amp; &lt; &gt; &quot; &apos; 或数字/十六进制实体）的裸 `&` 转义为 `&amp;`。
 * 部分站点（如爱范儿）会在 image/description 里带裸 `&`，导致 xml2js 报
 * "Invalid character in entity name"。此函数是通用容错，不影响其它源。
 */
export function sanitizeAmpersand(xml: string): string {
  return xml.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
}

const parser = createFeedParser()

function curlFetchXml(url: string, timeoutMs: number): string {
  const result = spawnSync('curl', [
    '-sL',
    '-m', String(Math.ceil(timeoutMs / 1000)),
    '--compressed',
    '-H', 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    '-H', 'accept: application/rss+xml,application/atom+xml,application/xml,text/xml,*/*',
    '-H', 'accept-language: en-US,en;q=0.9',
    url,
  ], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('curl failed: ' + result.status + ' ' + (result.stderr || ''))
  return result.stdout
}

export async function parseFeedUrl(url: string, timeoutMs = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('RSS HTTP ' + response.status)
    return parser.parseString(sanitizeAmpersand(await response.text()))
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('RSS 请求超时（' + (timeoutMs / 1000) + ' 秒）')
    }
    try {
      return parser.parseString(sanitizeAmpersand(curlFetchXml(url, timeoutMs)))
    } catch {
      throw error
    }
  } finally {
    clearTimeout(timer)
  }
}
