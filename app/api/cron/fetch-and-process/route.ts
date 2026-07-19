import { NextResponse } from 'next/server'
import Parser from 'rss-parser'
import { createServiceClient } from '@/lib/supabase'
import { summarizeArticle } from '@/lib/llm'
import { findSourceConfiguration, RSS_SOURCES, NEW_SOURCE_NAMES, type ScrapeConfig } from '@/lib/sources'
import { scrapeNewsList } from '@/lib/scraper'
import { parseFeedUrl } from '@/lib/rss'
import { checkLinks } from '@/lib/link-checker'
import { execFileSync } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export const runtime = 'nodejs'
export const maxDuration = 60

const parser = new Parser({ timeout: 15000 })

type RuntimeSource = {
  name: string
  url: string
  fetchType: 'rss' | 'web'
  scrapeConfig?: ScrapeConfig
}

async function loadActiveSources(supabase: ReturnType<typeof createServiceClient>): Promise<RuntimeSource[]> {
  const { data, error } = await supabase
    .from('info_sources')
    .select('name, url, fetch_type')
    .eq('enabled', true)
    .order('sort_order', { ascending: true })

  if (!error) {
    return (data ?? []).flatMap((source): RuntimeSource[] => {
      const configuredSource = findSourceConfiguration(source.url, source.name)
      if (configuredSource?.loginRequired || configuredSource?.needsLocalCdp) {
        return []
      }
      const fetchType =
        configuredSource?.type === 'rss' || configuredSource?.isRss
          ? 'rss'
          : source.fetch_type === 'rss'
            ? 'rss'
            : 'web'
      return [{
        name: source.name,
        url: configuredSource?.url || source.url,
        fetchType,
        scrapeConfig: configuredSource?.scrapeConfig || (
          fetchType === 'web' ? { adapter: 'auto-news-links', maxItems: 10 } : undefined
        ),
      }]
    })
  }

  // 数据库迁移执行前保持现有任务可用，避免部署过程停止抓取。
  console.warn('[Sources] 数据库运行字段尚不可用，暂用代码内 RSS 清单:', error.message)
  return RSS_SOURCES.filter((source) => source.type === 'rss').map(({ name, url }) => ({
    name,
    url,
    fetchType: 'rss',
  }))
}

async function fetchFeedWithFallback(url: string): Promise<Parser.Output<{
  [key: string]: any
}> | null> {
  // 1. 先用普通 fetch 尝试
  try {
    const feed = await parseFeedUrl(url)
    return feed
  } catch {
    // 2. 失败后用 Scrapling fallback（反检测 Chromium）
    const tmpFile = join(tmpdir(), `rss-${Date.now()}.xml`)
    const pythonExe = process.env.SCRAPLING_PYTHON || 'D:\\claudecode\\.venv-scrapling\\Scripts\\python.exe'
    const scriptPath = join(process.cwd(), 'scripts', 'fetch-rss-scrapling.py')
    try {
      execFileSync(pythonExe, [scriptPath, url, tmpFile], {
        timeout: 35000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const xml = readFileSync(tmpFile, 'utf-8')
      unlinkSync(tmpFile)
      const feed = await parser.parseString(xml)
      return feed
    } catch {
      return null
    }
  }
}

const BLOCK_PATTERNS: RegExp[] = [
  /\bto star (as|in)\b/i,
  /\bcast as\b/i,
  /\bstars? in\b/i,
  /\bjoins?\s+(the\s+)?(cast|film|movie|series)\b/i,
  /\b(manga|anime|movie|film|book|series) review\b/i,
  /^review[:\s]/i,
  /^retrospective[:\s]/i,
]

function isNoise(title: string): boolean {
  return BLOCK_PATTERNS.some((p) => p.test(title))
}

type FetchResult = {
  source: string
  ok: boolean
  fetched: number
  blocked: number
  dead: number
  inserted: number
  error?: string
}

type ProcessResult = {
  id: string
  ok: boolean
  error?: string
}

export async function GET(request: Request) {
  // 支持两种验证方式：Vercel Cron (Bearer CRON_SECRET) 或 管理员手动触发 (x-admin-password)
  const authHeader = request.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`
  const adminPw = request.headers.get('x-admin-password')
  const isCronAuth = process.env.CRON_SECRET && authHeader === expectedAuth
  const isAdminAuth = adminPw === process.env.ADMIN_PASSWORD

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const startTime = Date.now()
  const triggerType = isAdminAuth ? 'manual' : 'cron'
  let logId: string | null = null

  try {
    // 创建日志记录
    const { data: logData, error: logError } = await supabase
      .from('cron_logs')
      .insert({ trigger_type: triggerType, status: 'running' })
      .select('id')
      .single()

    logId = logData?.id ?? null
    if (logError) {
      console.error('[CronLog] 创建日志失败:', logError.message)
    }

    // ===== 第1步：抓取 RSS =====
  const fetchResults: FetchResult[] = []
  let totalInserted = 0

  const activeSources = await loadActiveSources(supabase)

  for (const source of activeSources) {
    const result: FetchResult = { source: source.name, ok: false, fetched: 0, blocked: 0, dead: 0, inserted: 0 }

    try {
      let rawItems: Array<{
        source: string
        url: string
        title: string
        published_at: string | null
      }>

      if (source.fetchType === 'rss') {
        const feed = await fetchFeedWithFallback(source.url)
        if (!feed) {
          result.error = 'RSS fetch failed (including Scrapling fallback)'
          fetchResults.push(result)
          continue
        }
        rawItems = feed.items
          .map((item) => ({
            source: source.name,
            url: item.link ?? '',
            title: item.title ?? '',
            published_at: item.isoDate ?? null,
          }))
          .filter((item) => item.url.length > 0 && item.title.length > 0)
      } else {
        if (!source.scrapeConfig) {
          result.error = 'Web source is missing scrapeConfig'
          fetchResults.push(result)
          continue
        }
        const scraped = await scrapeNewsList(source.name, source.url, source.scrapeConfig)
        if (scraped.error) {
          result.error = scraped.error
          fetchResults.push(result)
          continue
        }
        rawItems = scraped.items.map((item) => ({
          source: source.name,
          url: item.url,
          title: item.title,
          published_at: item.publishedAt,
        }))
      }

      const items = rawItems.filter((x) => !isNoise(x.title))
      result.fetched = items.length
      result.blocked = rawItems.length - items.length

      // 链接有效性预检
      let validItems = items
      if (items.length > 0) {
        const linkChecks = await checkLinks(
          items.map((x) => x.url),
          5,
          6000
        )
        const validUrls = new Set(linkChecks.filter((r) => r.ok).map((r) => r.url))
        validItems = items.filter((x) => validUrls.has(x.url))
        result.dead = items.length - validItems.length

        const deadLinks = linkChecks.filter((r) => !r.ok)
        if (deadLinks.length > 0) {
          console.log(`  [链接检查] 过滤 ${deadLinks.length} 条失效链接:`)
          deadLinks.forEach((d) => console.log(`    - ${d.url} (${d.reason})`))
        }
      }

      if (validItems.length > 0) {
        const { data, error } = await supabase
          .from('articles')
          .upsert(validItems, { onConflict: 'source,url', ignoreDuplicates: true })
          .select('id')

        if (error) {
          result.error = `Supabase: ${error.message}`
        } else {
          result.ok = true
          result.inserted = data?.length ?? 0
          totalInserted += result.inserted
        }
      } else {
        result.ok = true
      }
    } catch (e) {
      result.error = e instanceof Error ? e.message : String(e)
    }

    fetchResults.push(result)
  }

  // ===== 第2步：对新文章跑 LLM =====
  // max_tokens=3000 后每条LLM约40-60秒，4条约40-60秒，控制在60秒超时内
  const LLM_BATCH_SIZE = 8

  const { data: pendingArticles, error: pendingError } = await supabase
    .from('articles')
    .select('id, title, url, source, published_at')
    .is('title_cn', null)
    .order('published_at', { ascending: false })
    .limit(LLM_BATCH_SIZE)

  let processResults: ProcessResult[] = []
  let processedCount = 0

  if (!pendingError && pendingArticles && pendingArticles.length > 0) {
    processResults = await Promise.all(
      pendingArticles.map(async (article): Promise<ProcessResult> => {
        try {
          const llmResult = await summarizeArticle(article.title, '')

          if (!llmResult) {
            // LLM 失败降级
            const { error: updateError } = await supabase
              .from('articles')
              .update({
                title_cn: article.title.slice(0, 60),
                summary_cn: '',
                category: null,
                relevance_score: null,
                is_selected: false,
                commentary: null,
              })
              .eq('id', article.id)
            return { id: article.id, ok: !updateError, error: updateError?.message }
          }

          // 新增信源的文章强制归类为"待分类"，等人工审核
          const isNewSource = NEW_SOURCE_NAMES.has(article.source)
          const finalCategory = isNewSource ? '待分类' : llmResult.category
          const finalIsSelected = isNewSource ? false : llmResult.is_selected

          const { error: updateError } = await supabase
            .from('articles')
            .update({
              title_cn: llmResult.title_cn,
              summary_cn: llmResult.summary_cn,
              category: finalCategory,
              relevance_score: llmResult.relevance_score,
              is_selected: finalIsSelected,
              commentary: llmResult.commentary,
            })
            .eq('id', article.id)

          return { id: article.id, ok: !updateError, error: updateError?.message }
        } catch (e) {
          return { id: article.id, ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      })
    )
    processedCount = processResults.filter((r) => r.ok).length
  }

  const elapsed = Date.now() - startTime
  const totalFetched = fetchResults.reduce((s, r) => s + r.fetched, 0)
  const totalBlocked = fetchResults.reduce((s, r) => s + r.blocked, 0)
  const totalDead = fetchResults.reduce((s, r) => s + r.dead, 0)

  // 更新日志记录
  if (logId) {
    const hasFetchError = fetchResults.some((r) => r.error)
    const hasLlmError = processResults.some((r) => r.error)
    const status = hasFetchError || hasLlmError ? 'error' : 'success'
    const errorMessages = [
      ...fetchResults.filter((r) => r.error).map((r) => `[${r.source}] ${r.error}`),
      ...processResults.filter((r) => r.error).map((r) => `[LLM] ${r.error}`),
    ]

    await supabase
      .from('cron_logs')
      .update({
        ended_at: new Date().toISOString(),
        fetch_total_fetched: totalFetched,
        fetch_total_inserted: totalInserted,
        llm_pending: pendingArticles?.length ?? 0,
        llm_processed: processedCount,
        llm_failed: (pendingArticles?.length ?? 0) - processedCount,
        status,
        error_message: errorMessages.length > 0 ? errorMessages.join('; ') : null,
        details: { fetchResults, processResults, elapsedMs: elapsed },
      })
      .eq('id', logId)
  }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
      fetch: {
        totalFetched,
        totalBlocked,
        totalDead,
        totalInserted,
        results: fetchResults,
      },
      llm: {
        pending: pendingArticles?.length ?? 0,
        processed: processedCount,
        failed: (pendingArticles?.length ?? 0) - processedCount,
        results: processResults,
      },
    })
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[fetch-and-process] 未捕获异常:', message)

    // 更新日志为失败状态
    if (logId) {
      await supabase
        .from('cron_logs')
        .update({
          ended_at: new Date().toISOString(),
          status: 'error',
          error_message: message,
        })
        .eq('id', logId)
    }

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}
