import * as cheerio from 'cheerio'
import type { ScrapeConfig } from '@/lib/sources'

export type ScrapedNewsItem = {
  title: string
  url: string
  publishedAt: string | null
}

export type ScrapeResult = {
  items: ScrapedNewsItem[]
  rawCount: number
  error?: string
}

const REQUEST_TIMEOUT_MS = 15_000
const NAVIGATION_TITLES = new Set([
  '首页', '首 页', '主页', '新闻', '资讯', '焦点', '头条', '股票', '简体',
  '网络游戏', '文旅要闻', '用户登录', 'home', 'news', 'more', 'read more',
])

function decodeHtml(buffer: ArrayBuffer, contentType: string | null): string {
  const bytes = new Uint8Array(buffer)
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 4096))
  const charset = `${contentType ?? ''} ${header}`.match(/charset\s*=\s*["']?\s*([\w-]+)/i)?.[1]
  const encoding = charset && /^(gb2312|gbk|gb18030)$/i.test(charset) ? 'gb18030' : 'utf-8'
  return new TextDecoder(encoding).decode(bytes)
}

function isLikelyArticle(title: string, url: URL, sourceUrl: string): boolean {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim()
  const compactTitle = normalizedTitle.replace(/\s+/g, '')
  if (compactTitle.length < 6 || NAVIGATION_TITLES.has(normalizedTitle.toLowerCase())) return false
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const pathAndQuery = `${url.pathname}${url.search}`
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) return false
  const basename = segments.at(-1) ?? ''
  if (/^(?:index|main)\.(?:s?html?|aspx?)$/i.test(basename) || /^node_\d+\.(?:s?html?|aspx?)$/i.test(basename)) {
    return false
  }

  const hasArticleWord =
    /(?:^|[/_-])(?:article|articles|detail|details|content|newsdetail|story|stories|post|posts|brief)(?:[/_.?=-]|$)/i.test(pathAndQuery)
  const hasLongId = /\d{5,}/.test(pathAndQuery)
  const hasDatePath = /(?:19|20)\d{2}[/_-]\d{1,2}(?:[/_-]\d{1,2})?/.test(pathAndQuery)
  const hasDescriptiveSlug =
    segments.length >= 3
    && /[a-z]/i.test(basename)
    && basename.length >= 20

  if (!hasArticleWord && !hasLongId && !hasDatePath && !hasDescriptiveSlug) return false
  if (url.pathname.endsWith('/') && !hasArticleWord && !hasDatePath) return false

  try {
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '')
    const targetHost = url.hostname.replace(/^www\./, '')
    if (targetHost !== sourceHost && !targetHost.endsWith(`.${sourceHost}`) && !sourceHost.endsWith(`.${targetHost}`)) {
      return false
    }
  } catch {
    return false
  }

  return true
}

type BilibiliTimelineEpisode = {
  episode_id?: number
  pub_index?: string
  pub_ts?: number
  published?: number
  title?: string
}

type BilibiliTimelineResponse = {
  code?: number
  message?: string
  result?: Array<{ episodes?: BilibiliTimelineEpisode[] }>
}

type News17173SearchItem = {
  title?: string
  pageUrl?: string
  publishTime?: string
}

type News17173SearchResponse = {
  result?: string
  data?: {
    listData?: News17173SearchItem[]
  }
}

type JiemianAccountItem = {
  object_type?: string
  title?: string
  url?: string
  publish_time?: string
  source_name?: string
}

type JiemianAccountResponse = {
  code?: number
  data?: {
    list?: JiemianAccountItem[]
  }
}

async function scrapeJiemianAccount(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'jiemian-account' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const maxItems = config.maxItems ?? 10
  const apiUrl = new URL(config.apiUrl)
  apiUrl.searchParams.set('id', config.accountId)
  apiUrl.searchParams.set('page', '1')
  apiUrl.searchParams.set('callback', 'ipHotCallback')

  const response = await fetch(apiUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/javascript, application/json, text/javascript',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: sourceUrl,
    },
    redirect: 'follow',
    signal,
  })

  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: API HTTP ${response.status}` }
  }

  const jsonp = await response.text()
  const json = jsonp.match(/^ipHotCallback\(([\s\S]*)\);?\s*$/)?.[1]
  if (!json) {
    return { items: [], rawCount: 0, error: `${sourceName}: API JSONP 响应无效` }
  }

  const payload = JSON.parse(json) as JiemianAccountResponse
  const list = payload.data?.list
  if (payload.code !== 0 || !Array.isArray(list)) {
    return { items: [], rawCount: 0, error: `${sourceName}: API 响应结构无效` }
  }

  const items = list
    .filter((entry) =>
      entry.object_type === 'article'
      && entry.source_name === sourceName
      && Boolean(entry.title)
      && Boolean(entry.url)
    )
    .slice(0, maxItems)
    .map((entry) => ({
      title: entry.title!.trim(),
      url: entry.url!,
      publishedAt: entry.publish_time
        ? new Date(Number(entry.publish_time) * 1000).toISOString()
        : null,
    }))

  return {
    items,
    rawCount: list.length,
    error: items.length === 0 ? `${sourceName}: API 未返回该账号的有效资讯` : undefined,
  }
}

async function scrape17173Search(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: '17173-search' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const maxItems = config.maxItems ?? 10
  const apiUrl = new URL(config.apiUrl)
  apiUrl.searchParams.set('keyword', config.keyword)
  apiUrl.searchParams.set('pageNo', '1')
  apiUrl.searchParams.set('pageSize', String(maxItems))
  apiUrl.searchParams.set('orderBy', '2')

  const response = await fetch(apiUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: sourceUrl,
    },
    redirect: 'follow',
    signal,
  })

  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: API HTTP ${response.status}` }
  }

  const payload = (await response.json()) as News17173SearchResponse
  const list = payload.data?.listData
  if (payload.result !== 'success' || !Array.isArray(list)) {
    return { items: [], rawCount: 0, error: `${sourceName}: API 响应结构无效` }
  }

  const items: ScrapedNewsItem[] = []
  const seen = new Set<string>()
  for (const entry of list) {
    if (items.length >= maxItems || !entry.title || !entry.pageUrl) continue

    const title = cheerio.load(entry.title).text().replace(/\s+/g, ' ').trim()
    let url: URL
    try {
      url = new URL(entry.pageUrl)
    } catch {
      continue
    }
    if (url.protocol === 'http:') url.protocol = 'https:'
    const normalizedUrl = url.toString()
    if (!title || seen.has(normalizedUrl)) continue
    seen.add(normalizedUrl)

    const publishedAt = entry.publishTime
      ? new Date(`${entry.publishTime.replace(' ', 'T')}+08:00`).toISOString()
      : null
    items.push({ title, url: normalizedUrl, publishedAt })
  }

  return {
    items,
    rawCount: list.length,
    error: items.length === 0 ? `${sourceName}: API 未返回有效资讯` : undefined,
  }
}

async function scrapeBilibiliTimeline(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'bilibili-guochuang-timeline' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const response = await fetch(config.apiUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/json',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: sourceUrl,
    },
    redirect: 'follow',
    signal,
  })

  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: API HTTP ${response.status}` }
  }

  const payload = (await response.json()) as BilibiliTimelineResponse
  if (payload.code !== 0 || !Array.isArray(payload.result)) {
    return {
      items: [],
      rawCount: 0,
      error: `${sourceName}: API ${payload.code ?? 'invalid'} ${payload.message ?? '响应结构无效'}`,
    }
  }

  const episodes = payload.result
    .flatMap((day) => day.episodes ?? [])
    .filter((episode) =>
      episode.published === 1
      && typeof episode.episode_id === 'number'
      && typeof episode.pub_ts === 'number'
      && typeof episode.title === 'string'
      && episode.title.trim().length > 0
    )
    .sort((a, b) => (b.pub_ts ?? 0) - (a.pub_ts ?? 0))

  const seen = new Set<number>()
  const items: ScrapedNewsItem[] = []

  for (const episode of episodes) {
    if (items.length >= (config.maxItems ?? 10)) break
    if (!episode.episode_id || !episode.pub_ts || !episode.title || seen.has(episode.episode_id)) {
      continue
    }
    seen.add(episode.episode_id)

    const title = [episode.title.trim(), episode.pub_index?.trim()].filter(Boolean).join(' ')
    items.push({
      title,
      url: `https://www.bilibili.com/bangumi/play/ep${episode.episode_id}`,
      publishedAt: new Date(episode.pub_ts * 1000).toISOString(),
    })
  }

  return {
    items,
    rawCount: episodes.length,
    error: items.length === 0 ? `${sourceName}: API 未返回已发布的国创内容` : undefined,
  }
}

export async function scrapeNewsList(
  sourceName: string,
  sourceUrl: string,
  config: ScrapeConfig
): Promise<ScrapeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    if (config.adapter === 'bilibili-guochuang-timeline') {
      return await scrapeBilibiliTimeline(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === '17173-search') {
      return await scrape17173Search(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === 'jiemian-account') {
      return await scrapeJiemianAccount(sourceName, sourceUrl, config, controller.signal)
    }

    const response = await fetch(sourceUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      return { items: [], rawCount: 0, error: `${sourceName}: HTTP ${response.status}` }
    }

    const html = decodeHtml(await response.arrayBuffer(), response.headers.get('content-type'))
    const $ = cheerio.load(html)
    const autoMode = config.adapter === 'auto-news-links'
    const elements = autoMode ? $('a[href]') : $(config.itemSelector)
    const items: ScrapedNewsItem[] = []
    const seen = new Set<string>()

    elements.each((_, element) => {
      if (items.length >= (config.maxItems ?? 10)) return false

      const item = $(element)
      const titleElement = autoMode
        ? item
        : config.titleSelector
        ? item.is(config.titleSelector)
          ? item
          : item.find(config.titleSelector).first()
        : item
      const linkElement = autoMode
        ? item
        : config.linkSelector
        ? item.is(config.linkSelector)
          ? item
          : item.find(config.linkSelector).first()
        : item.is('a')
          ? item
          : item.find('a').first()

      const title = titleElement.text().replace(/\s+/g, ' ').trim()
      const href = linkElement.attr('href')?.trim()
      if (!title || !href) return

      let url: URL
      try {
        url = new URL(href, autoMode ? sourceUrl : config.linkPrefix || sourceUrl)
      } catch {
        return
      }
      url.hash = ''

      const normalizedUrl = url.toString()
      if (seen.has(normalizedUrl) || !isLikelyArticle(title, url, sourceUrl)) return
      seen.add(normalizedUrl)

      const publishedAt =
        item.find('time').attr('datetime') ||
        item.find('time, .time, .date').first().text().trim() ||
        null
      items.push({ title, url: normalizedUrl, publishedAt })
    })

    return {
      items,
      rawCount: elements.length,
      error: items.length === 0 ? `${sourceName}: 选择器未提取到有效资讯` : undefined,
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `请求超时（${REQUEST_TIMEOUT_MS / 1000} 秒）`
        : error instanceof Error
          ? error.message
          : String(error)
    return { items: [], rawCount: 0, error: `${sourceName}: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}
