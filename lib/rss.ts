import Parser from 'rss-parser'

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

export async function parseFeedUrl(url: string, timeoutMs = 15_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'curl/8.x (ip-hot RSS reader)',
        accept: '*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`RSS HTTP ${response.status}`)
    return parser.parseString(await response.text())
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`RSS 请求超时（${timeoutMs / 1000} 秒）`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
