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

export async function parseFeedUrl(url: string, timeoutMs = 15_000) {
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
    return parser.parseString(await response.text())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('RSS 请求超时（' + (timeoutMs / 1000) + ' 秒）')
    }
    try {
      return parser.parseString(curlFetchXml(url, timeoutMs))
    } catch {
      throw error
    }
  } finally {
    clearTimeout(timer)
  }
}
