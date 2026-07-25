import * as cheerio from 'cheerio'
import { constants, createCipheriv, publicEncrypt, randomInt } from 'node:crypto'
import vm from 'node:vm'
import type { ScrapeConfig } from '@/lib/sources'
import { normalizeImageUrl } from '@/lib/article-image'

export type ScrapedNewsItem = {
  title: string
  url: string
  publishedAt: string | null
  imageUrl?: string | null
  isVideo?: boolean
}

export type ScrapeResult = {
  items: ScrapedNewsItem[]
  rawCount: number
  error?: string
}

const REQUEST_TIMEOUT_MS = 25_000
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

function isAcwChallengePage(html: string): boolean {
  return html.includes('acw_sc__v2') && /<script[\s>]/i.test(html) && html.length < 20_000
}

function solveAcwChallenge(html: string, sourceUrl: string): string | null {
  const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!script) return null

  let cookie = ''
  const location = new URL(sourceUrl)
  const document = {
    forms: [{ submit() {} }],
    location: { reload() {} },
    get cookie() { return cookie },
    set cookie(value: string) { cookie = value },
  }
  const context = {
    document,
    window: undefined as unknown,
    location: { host: location.host, href: location.href, protocol: location.protocol, reload() {} },
    navigator: { userAgent: 'Mozilla/5.0' },
    Date, Math, String, Number, RegExp, Array, Object, parseInt, decodeURIComponent, encodeURIComponent,
  }
  context.window = context

  try {
    vm.runInNewContext(script, context, { timeout: 5_000 })
  } catch {
    return null
  }

  return cookie.match(/(?:^|;)\s*(acw_sc__v2=[^;]+)/)?.[1] ?? null
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
    /(?:^|[/_-])(?:article|articles|detail|details|content|news|newsdetail|story|stories|post|posts|brief)(?:[/_.?=-]|$)/i.test(pathAndQuery)
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
  source?: {
    official_account?: {
      id?: string
      name?: string
    }
  }
}

type JiemianAccountResponse = {
  code?: number
  data?: {
    list?: JiemianAccountItem[]
  }
}

type HuxiuArticleItem = {
  title?: string
  url?: string
  dateline?: string
}

type HuxiuArticleResponse = {
  success?: boolean
  data?: {
    datalist?: HuxiuArticleItem[]
  }
}

type CcdyDigitalPaperResponse = {
  code?: number
  data?: {
    list?: Array<{ digitaldata?: string }>
  }
}

type ShxwcbHomeEntry = {
  ContentId?: string
  ContentTitle?: string
  LinkedTitle?: string
  ContentPublishTimestamp?: number
}

type ShxwcbHomeResponse = {
  code?: number
  data?: Array<{ Data?: ShxwcbHomeEntry[] }>
}

const SHXWCB_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDJNi2fz4NH1t1cx9Hzp7jwTaTX
j90bRymJ6DUR8h1Qr6lViP1nBTzz/lgTt4qqwqFWQujsj443gCUsuthoaty70t6T
U8eO+7wS3oV0/SdCYE/gvUJquloOpj+f3GZCqRBGqWCKhrE/cXhpUFg1O9JdfYVc
P9vi0ytwSJCN/hYGcwIDAQAB
-----END PUBLIC KEY-----`

async function scrapeCcdyDigitalPaper(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'ccdy-digital-paper' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const query = {
    condition: { date: { $lte: today }, state: ['Y'] },
    range: { structure: 0, data: 1, total: 0 },
    content: '',
    sort: { date: '-1' },
    pagination: { currentPage: 1, pageSize: 1 },
  }
  const apiUrl = new URL(config.apiUrl)
  apiUrl.searchParams.set('token', config.token)
  apiUrl.searchParams.set('data', Buffer.from(JSON.stringify(query)).toString('base64'))

  const response = await fetch(apiUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/json',
      referer: sourceUrl,
    },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: API HTTP ${response.status}` }
  }

  const payload = await response.json() as CcdyDigitalPaperResponse
  const encodedPaper = payload.data?.list?.[0]?.digitaldata
  if (payload.code !== 200 || !encodedPaper) {
    return { items: [], rawCount: 0, error: `${sourceName}: API 响应结构无效` }
  }

  const paper = JSON.parse(encodedPaper) as {
    data?: Array<{ polygons?: Array<{ id?: string; title?: string }> }>
  }
  const articles = (paper.data ?? []).flatMap((page) => page.polygons ?? [])
  const items = articles
    .filter((article) => article.id && article.title && article.title.trim().length >= 6)
    .slice(0, config.maxItems ?? 10)
    .map((article) => ({
      title: article.title!.replace(/\s+/g, ' ').trim(),
      url: `https://www.ccdy.cn/#/details/${article.id}`,
      publishedAt: null,
    }))

  return {
    items,
    rawCount: articles.length,
    error: items.length === 0 ? `${sourceName}: API 未返回有效资讯` : undefined,
  }
}

async function scrapeShxwcbHome(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'shxwcb-home' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const key = Array.from({ length: 24 }, () => chars[randomInt(chars.length)]).join('')
  const plaintext = `pageidx=0&home=1&time=${Math.floor(Date.now() / 1000)}`
  const cipher = createCipheriv('aes-192-cbc', Buffer.from(key, 'latin1'), Buffer.from('1234567812345678', 'latin1'))
  const encryptedData = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64')
  const encryptedKey = publicEncrypt(
    { key: SHXWCB_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(key, 'latin1')
  ).toString('base64')
  const apiUrl = new URL(config.apiUrl)
  apiUrl.searchParams.set('data', encryptedData)
  apiUrl.searchParams.set('sign', encryptedKey)

  const response = await fetch(apiUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/json, text/plain, */*',
      referer: sourceUrl,
    },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: API HTTP ${response.status}` }
  }

  const payload = await response.json() as ShxwcbHomeResponse
  if (payload.code !== 200 || !Array.isArray(payload.data)) {
    return { items: [], rawCount: 0, error: `${sourceName}: API 响应结构无效` }
  }

  const entries = payload.data.flatMap((group) => group.Data ?? [])
  const items: ScrapedNewsItem[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (items.length >= (config.maxItems ?? 10) || !entry.ContentId) continue
    const title = cheerio.load(entry.ContentTitle || entry.LinkedTitle || '').text().replace(/\s+/g, ' ').trim()
    if (title.length < 6 || seen.has(entry.ContentId)) continue
    seen.add(entry.ContentId)
    items.push({
      title,
      url: `https://www.shxwcb.com/#/detail/${entry.ContentId}`,
      publishedAt: entry.ContentPublishTimestamp
        ? new Date(entry.ContentPublishTimestamp * 1000).toISOString()
        : null,
    })
  }

  return {
    items,
    rawCount: entries.length,
    error: items.length === 0 ? `${sourceName}: API 未返回有效资讯` : undefined,
  }
}

async function scrapeJinaMarkdownLinks(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'jina-markdown-links' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const response = await fetch(config.proxyUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'text/plain, text/markdown, */*',
    },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: proxy HTTP ${response.status}` }
  }

  const markdown = await response.text()
  const matches = [
    ...markdown.matchAll(/\[!\[([^\]\n]*)\]\([^)]+\)\s*([^\]\n]*)\]\((https?:\/\/[^)\s]+)(?:\s+["'][^)]*["'])?\)/g),
    ...markdown.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)(?:\s+["'][^)]*["'])?\)/g),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  const linkPattern = config.linkPattern ? new RegExp(config.linkPattern) : null
  const items: ScrapedNewsItem[] = []
  const seen = new Set<string>()
  let rawCount = 0

  for (const match of matches) {
    const rawTitle = match.length === 4 ? (match[2] || match[1]) : match[1]
    const rawUrl = match.length === 4 ? match[3] : match[2]
    if (!rawTitle || /^\s*Image \d+(?::|$)/i.test(rawTitle)) continue

    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      continue
    }
    const allowedByPattern = linkPattern?.test(url.toString()) ?? false
    if (
      (url.hostname !== config.sourceHost && !allowedByPattern)
      || !url.pathname.startsWith(config.pathPrefix)
      || (linkPattern && !allowedByPattern)
    ) continue

    const title = cheerio.load(rawTitle).text().replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim()
    if (!isLikelyArticle(title, url, sourceUrl) && !linkPattern) continue
    rawCount++

    url.protocol = 'https:'
    url.search = ''
    url.hash = ''
    const normalizedUrl = url.toString()
    if (seen.has(normalizedUrl)) continue
    seen.add(normalizedUrl)
    items.push({ title, url: normalizedUrl, publishedAt: null })
    if (items.length >= (config.maxItems ?? 10)) break
  }

  return {
    items,
    rawCount,
    error: items.length === 0 ? `${sourceName}: proxy 未返回有效资讯` : undefined,
  }
}

async function scrapeSitemapArticleLinks(
  sourceName: string,
  config: Extract<ScrapeConfig, { adapter: 'sitemap-article-links' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const response = await fetch(config.sitemapUrl, { redirect: 'follow', signal })
  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: sitemap HTTP ${response.status}` }
  }

  const linkPattern = new RegExp(config.linkPattern)
  const urls = [...(await response.text()).matchAll(/<loc>\s*(https?:\/\/[^<\s]+)\s*<\/loc>/gi)]
    .map((match) => match[1])
    .filter((url, index, all) => linkPattern.test(url) && all.indexOf(url) === index)
    .slice(0, config.maxItems ?? 10)

  const items: Array<ScrapedNewsItem | null> = await Promise.all(urls.map(async (url): Promise<ScrapedNewsItem | null> => {
    try {
      const articleResponse = await fetch(url, { redirect: 'follow', signal })
      if (!articleResponse.ok) return null
      const html = await articleResponse.text()
      const title = cheerio.load(html)('title').first().text().replace(/\s+/g, ' ').trim()
      return title ? { title, url, publishedAt: null } : null
    } catch {
      return null
    }
  }))

  const validItems = items.filter((item): item is ScrapedNewsItem => Boolean(item))
  return {
    items: validItems,
    rawCount: urls.length,
    error: validItems.length === 0 ? `${sourceName}: sitemap 未返回有效资讯` : undefined,
  }
}

async function fetchHtmlWithRetry(sourceUrl: string, signal: AbortSignal): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(sourceUrl, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        signal,
      })
    } catch (error) {
      lastError = error
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError
}

async function scrapeHuxiuApi(
  sourceName: string,
  sourceUrl: string,
  config: Extract<ScrapeConfig, { adapter: 'huxiu-api' }>,
  signal: AbortSignal
): Promise<ScrapeResult> {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://www.huxiu.com',
      referer: sourceUrl,
    },
    body: new URLSearchParams({ platform: 'www' }),
    redirect: 'follow',
    signal,
  })

  if (!response.ok) {
    return { items: [], rawCount: 0, error: `${sourceName}: HTTP ${response.status}` }
  }

  const payload = await response.json() as HuxiuArticleResponse
  const list = payload.data?.datalist
  if (!payload.success || !Array.isArray(list)) {
    return { items: [], rawCount: 0, error: `${sourceName}: API 响应结构无效` }
  }

  const items = list
    .filter((entry) => entry.title && entry.url && /^https:\/\/www\.huxiu\.com\/article\/\d+\.html$/.test(entry.url))
    .slice(0, config.maxItems ?? 10)
    .map((entry) => ({
      title: entry.title!.replace(/\s+/g, ' ').trim(),
      url: entry.url!,
      publishedAt: entry.dateline ? new Date(Number(entry.dateline) * 1000).toISOString() : null,
    }))

  return {
    items,
    rawCount: list.length,
    error: items.length === 0 ? `${sourceName}: API 没有返回有效资讯` : undefined,
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

  const headers = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    accept: 'application/javascript, application/json, text/javascript',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    referer: sourceUrl,
  }
  let response: Response | undefined
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(apiUrl, { headers, redirect: 'follow', signal })
      if (response.ok || response.status < 500) break
    } catch (error) {
      lastError = error
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }

  if (!response) throw lastError ?? new Error('雷报 API 请求失败')

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
  const timeoutMs = config.adapter === 'jina-markdown-links' ? 60_000 : REQUEST_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

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
    if (config.adapter === 'huxiu-api') {
      return await scrapeHuxiuApi(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === 'ccdy-digital-paper') {
      return await scrapeCcdyDigitalPaper(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === 'shxwcb-home') {
      return await scrapeShxwcbHome(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === 'jina-markdown-links') {
      return await scrapeJinaMarkdownLinks(sourceName, sourceUrl, config, controller.signal)
    }
    if (config.adapter === 'sitemap-article-links') {
      return await scrapeSitemapArticleLinks(sourceName, config, controller.signal)
    }

    let response = await fetchHtmlWithRetry(sourceUrl, controller.signal)

    if (!response.ok) {
      return { items: [], rawCount: 0, error: `${sourceName}: HTTP ${response.status}` }
    }

    let html = decodeHtml(await response.arrayBuffer(), response.headers.get('content-type'))
    if (isAcwChallengePage(html)) {
      const challengeCookie = solveAcwChallenge(html, sourceUrl)
      if (challengeCookie) {
        const retryResponse = await fetch(sourceUrl, {
          headers: {
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
            accept: 'text/html,application/xhtml+xml',
            'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
            cookie: challengeCookie,
          },
          redirect: 'follow',
          signal: controller.signal,
        })
        if (!retryResponse.ok) {
          return { items: [], rawCount: 0, error: `${sourceName}: HTTP ${retryResponse.status}` }
        }
        response = retryResponse
        html = decodeHtml(await retryResponse.arrayBuffer(), retryResponse.headers.get('content-type'))
      }
    }
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
      const imageElement = item.is('img') ? item : item.find('img').first()
      const videoElement = item.is('video') ? item : item.find('video').first()
      const imageCandidate = imageElement.attr('data-src')
        || imageElement.attr('data-original')
        || imageElement.attr('data-lazy-src')
        || imageElement.attr('src')
        || videoElement.attr('poster')
      const imageUrl = normalizeImageUrl(imageCandidate, normalizedUrl)
      items.push({ title, url: normalizedUrl, publishedAt, imageUrl, isVideo: videoElement.length > 0 })
    })

    return {
      items,
      rawCount: elements.length,
      error: items.length === 0 ? `${sourceName}: 选择器未提取到有效资讯` : undefined,
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `请求超时（${timeoutMs / 1000} 秒）`
        : error instanceof Error
          ? error.message
          : String(error)
    return { items: [], rawCount: 0, error: `${sourceName}: ${message}` }
  } finally {
    clearTimeout(timer)
  }
}
