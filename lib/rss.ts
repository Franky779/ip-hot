import Parser from 'rss-parser'

const parser = new Parser()

export async function parseFeedUrl(url: string, timeoutMs = 15_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
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
